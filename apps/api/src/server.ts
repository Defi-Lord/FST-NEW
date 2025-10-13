// apps/api/src/server.ts
import express from "express";
import type { CookieOptions } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// ---------- Config ----------
const prisma = new PrismaClient();

const APP_NAME = process.env.APP_NAME ?? "FST";
const JWT_SECRET = process.env.JWT_SECRET || "";
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET environment variable.");
  process.exit(1);
}

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const FORCE_SECURE_COOKIES = process.env.FORCE_SECURE_COOKIES === "1";

const allowed = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const PORT = Number(process.env.PORT) || 4000;

// ---------- App ----------
const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// ----- Manual CORS (no 'cors' package; avoids express@5 TS overloads) -----
function isAllowedOrigin(origin?: string | null) {
  if (!origin) return true; // allow curl/postman
  if (allowed.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.hostname.endsWith(".vercel.app")) return true; // allow all vercel previews
  } catch {}
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (isAllowedOrigin(origin)) {
    // reflect allowed origin (required for credentialed requests)
    if (origin) res.header("Access-Control-Allow-Origin", origin);
    else res.header("Access-Control-Allow-Origin", "*"); // non-browser clients
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---------- Helpers ----------
type NonceCookiePayload = {
  t: "nonce";
  wallet: string;
  nonce: string;
  msg: string;
  iat: number;
  exp: number;
  jti: string;
};
type NonceBase = Pick<NonceCookiePayload, "wallet" | "nonce" | "msg">;

function isRequestSecure(req: express.Request) {
  const xfProto = String(req.headers["x-forwarded-proto"] || "");
  return FORCE_SECURE_COOKIES || IS_PROD || xfProto.includes("https");
}

function signNonceCookie(payload: NonceBase) {
  const jti = randomUUID();
  const token = jwt.sign({ t: "nonce", ...payload }, JWT_SECRET, {
    expiresIn: "5m",
    jwtid: jti,
  });
  return { token, jti };
}

function setCookie(
  req: express.Request,
  res: express.Response,
  name: string,
  value: string,
  maxAgeMs: number,
  options: Partial<CookieOptions> = {}
) {
  const base: CookieOptions = {
    httpOnly: true,
    sameSite: "none",
    secure: isRequestSecure(req),
    maxAge: maxAgeMs,
    path: "/",
    ...options,
  };
  res.cookie(name, value as any, base);
}

function clearCookie(req: express.Request, res: express.Response, name: string) {
  const opts: CookieOptions = {
    httpOnly: true,
    sameSite: "none",
    secure: isRequestSecure(req),
    path: "/",
  };
  res.clearCookie(name, opts);
}

function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// ---------- Diagnostics ----------
app.get("/public/healthz", (_req, res) => res.json({ ok: true }));
app.get("/public/debug/cors", (req, res) => {
  res.json({
    ok: true,
    origin: req.headers.origin || null,
    xfwdProto: req.headers["x-forwarded-proto"] || null,
    cookies: Object.keys(req.cookies || {}),
    allowedFromEnv: allowed,
    nodeEnv: NODE_ENV,
  });
});

// ---------- Auth ----------
/**
 * GET /auth/nonce?wallet=<base58>
 * Returns the exact message to sign + sets an HttpOnly "nonce" cookie (JWT, 5m)
 */
app.get("/auth/nonce", async (req, res) => {
  try {
    const wallet = String(req.query.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "Missing wallet param" });

    const nonce = randomUUID();
    const issuedAt = new Date().toISOString();
    const message =
      `${APP_NAME} login\n\n` +
      `Wallet: ${wallet}\n` +
      `Nonce: ${nonce}\n` +
      `Issued At: ${issuedAt}\n` +
      `\nBy signing, you prove ownership of this wallet.`;

    const { token } = signNonceCookie({ wallet, nonce, msg: message });
    setCookie(req, res, "nonce", token, 5 * 60 * 1000);

    return res.json({ wallet, nonce, message, expiresInSec: 300 });
  } catch (err) {
    console.error("nonce error", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /auth/verify
 * Body: { walletAddress: string, signatureBase58: string, message?: string }
 * Verifies signature over the EXACT message from /auth/nonce (or body fallback).
 * Upserts User + Wallet, creates a Session, returns a 30-day JWT.
 */
app.post("/auth/verify", async (req, res) => {
  try {
    const { walletAddress, signatureBase58, message: bodyMessage } = req.body ?? {};
    if (!walletAddress || !signatureBase58) {
      return res.status(400).json({ error: "walletAddress and signatureBase58 are required" });
    }

    // Prefer cookie message; accept body fallback if cookie missing/expired
    const nonceCookie = req.cookies?.nonce;
    let messageFromCookie: string | null = null;

    if (nonceCookie) {
      try {
        const nonceData: any = jwt.verify(nonceCookie, JWT_SECRET);
        if (nonceData.t !== "nonce") return res.status(400).json({ error: "Bad nonce payload" });
        if (nonceData.wallet !== walletAddress) {
          return res.status(400).json({ error: "Wallet mismatch with nonce" });
        }
        messageFromCookie = nonceData.msg;
      } catch {}
    }

    const message = messageFromCookie ?? bodyMessage;
    if (!message) return res.status(400).json({ error: "Missing nonce message" });

    // Verify signature
    const sig = bs58.decode(signatureBase58);
    const pubkey = bs58.decode(walletAddress);
    const ok = nacl.sign.detached.verify(toBytes(message), sig, pubkey);
    if (!ok) return res.status(401).json({ error: "Invalid signature" });

    // Prisma models (cast for TS-safety if schema names differ)
    const db: any = prisma;

    const existingWallet = await db.wallet?.findFirst?.({
      where: { address: walletAddress },
      select: { id: true, userId: true },
    });

    let userId: string;
    let walletId: string;

    if (existingWallet) {
      userId = existingWallet.userId;
      walletId = existingWallet.id;
    } else {
      userId = randomUUID();
      walletId = randomUUID();

      await db.user.create({
        data: {
          id: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          displayName: null,
        },
      });

      await db.wallet.create({
        data: {
          id: walletId,
          address: walletAddress,
          chain: "solana",
          userId,
        },
      });
    }

    const jti = randomUUID();
    const authToken = jwt.sign({ sub: userId, wid: walletId, t: "auth" }, JWT_SECRET, {
      expiresIn: "30d",
      jwtid: jti,
    });

    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.session?.create?.({ data: { id: sessionId, userId, jwtId: jti, expiresAt } });

    clearCookie(req, res, "nonce");
    setCookie(req, res, "auth", authToken, 30 * 24 * 60 * 60 * 1000);

    return res.json({ ok: true, token: authToken, userId, walletId, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    console.error("verify error", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// Example protected route
app.get("/me", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing token" });

    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (payload.t !== "auth") return res.status(401).json({ error: "Bad token type" });

    const db: any = prisma;
    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, displayName: true, createdAt: true, updatedAt: true },
    });
    return res.json({ user });
  } catch (err) {
    console.error("me error", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`API running on :${PORT}`);
});

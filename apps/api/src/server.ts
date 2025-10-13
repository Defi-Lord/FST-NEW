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

// Use 'any' to avoid express@5 TS overload complaints
const anyApp = app as any;

// Middleware (order matters)
anyApp.use(helmet());

// Accept JSON as application/json OR text/plain (some clients send plain text JSON)
anyApp.use(express.json({ type: ["application/json", "text/plain"] }));
// Also accept classic forms
anyApp.use(express.urlencoded({ extended: true }));

anyApp.use(cookieParser());

// --------- Manual CORS (credential-friendly) ----------
function isAllowedOrigin(origin?: string | null) {
  if (!origin) return true; // allow curl/postman
  if (allowed.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.hostname.endsWith(".vercel.app")) return true;
  } catch {}
  return false;
}

anyApp.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const origin = req.headers.origin as string | undefined;
  if (isAllowedOrigin(origin)) {
    if (origin) res.header("Access-Control-Allow-Origin", origin);
    else res.header("Access-Control-Allow-Origin", "*");
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
 * Accepts:
 *   JSON body (application/json or text/plain JSON),
 *   URL-encoded form body,
 *   or query params as a last resort.
 * Fields (any alias accepted):
 *   walletAddress | address | wallet
 *   signatureBase58 | signature | sig
 *   message (required if nonce cookie not available)
 */
app.post("/auth/verify", async (req, res) => {
  try {
    const rawBody = req.body as any;

    // If body came in as a string (e.g., text/plain), try to parse JSON
    let body: any = rawBody;
    if (typeof rawBody === "string") {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = {};
      }
    }

    // Pull from body OR query as fallback
    const q = req.query || {};
    const walletAddress: string =
      (body.walletAddress || body.address || body.wallet || q.walletAddress || q.address || q.wallet || "").toString().trim();
    const signatureStr: string =
      (body.signatureBase58 || body.signature || body.sig || q.signatureBase58 || q.signature || q.sig || "").toString().trim();
    const bodyMessage: string | undefined = (body.message || q.message) ? String(body.message || q.message) : undefined;

    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }
    if (!signatureStr) {
      return res.status(400).json({ error: "signatureBase58 is required" });
    }

    // Prefer nonce cookie message; accept body fallback
    const nonceCookie = req.cookies?.nonce;
    let messageFromCookie: string | null = null;
    if (nonceCookie) {
      try {
        const nonceData: any = jwt.verify(nonceCookie, JWT_SECRET);
        if (nonceData.t !== "nonce") {
          return res.status(400).json({ error: "Bad nonce payload" });
        }
        if (String(nonceData.wallet) !== walletAddress) {
          return res.status(400).json({ error: "Wallet mismatch with nonce" });
        }
        messageFromCookie = String(nonceData.msg || "");
      } catch {
        // ignore; fallback to body message
      }
    }

    const message = messageFromCookie ?? bodyMessage;
    if (!message) {
      return res.status(400).json({
        error: "Missing nonce message",
        hint: "Call GET /auth/nonce first (with credentials), then send the exact 'message' to /auth/verify.",
      });
    }

    // Decode signature (try base58 then base64)
    let sig: Uint8Array | null = null;
    try {
      sig = bs58.decode(signatureStr);
    } catch {
      try {
        sig = new Uint8Array(Buffer.from(signatureStr, "base64"));
      } catch {
        /* ignore */
      }
    }
    if (!sig) {
      return res.status(400).json({
        error: "Bad signature encoding",
        hint: "Provide signatureBase58 (preferred) or Base64 in 'signature'.",
      });
    }

    // Verify signature
    let pubkey: Uint8Array;
    try {
      pubkey = bs58.decode(walletAddress);
    } catch {
      return res.status(400).json({ error: "walletAddress must be base58" });
    }

    const ok = nacl.sign.detached.verify(toBytes(message), sig, pubkey);
    if (!ok) return res.status(401).json({ error: "Invalid signature" });

    // ----- Upsert user + wallet -----
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

    // Create a 30-day auth JWT + Session
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

    return res.json({
      ok: true,
      token: authToken,
      userId,
      walletId,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("verify error", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`API running on :${PORT}`);
});

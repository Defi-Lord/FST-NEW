// apps/api/src/server.ts
import express, { type CookieOptions } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer"; // ✅ ensure Buffer works in ESM build

// ---------- Config ----------
const prisma = new PrismaClient();

const APP_NAME = process.env.APP_NAME ?? "FST";
const JWT_SECRET = process.env.JWT_SECRET || "";
if (!JWT_SECRET) {
  console.error("[auth] Missing JWT_SECRET environment variable.");
  process.exit(1);
}

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const FORCE_SECURE_COOKIES = process.env.FORCE_SECURE_COOKIES === "1";
const PORT = Number(process.env.PORT) || 4000;

// Allow explicit origins + any *.vercel.app
const allowed = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ---------- App ----------
const app = express();
app.set("trust proxy", 1);
const anyApp = app as any;

anyApp.use(helmet());
anyApp.use(express.json({ type: ["application/json", "text/plain"] }));
anyApp.use(express.urlencoded({ extended: true }));
anyApp.use(cookieParser());

// --------- CORS ----------
function isAllowedOrigin(origin?: string | null) {
  if (!origin) return true; // curl/postman/etc.
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
    res.header("Access-Control-Allow-Origin", origin || "*");
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

function isRequestSecure(req: express.Request) {
  const xfProto = String(req.headers["x-forwarded-proto"] || "");
  return FORCE_SECURE_COOKIES || IS_PROD || xfProto.includes("https");
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

function signNonceCookie(payload: Pick<NonceCookiePayload, "wallet" | "nonce" | "msg">) {
  const jti = randomUUID();
  const token = jwt.sign({ t: "nonce", ...payload }, JWT_SECRET, {
    expiresIn: "5m",
    jwtid: jti,
  });
  return { token, jti };
}

const enc = new TextEncoder();
const toBytes = (s: string) => enc.encode(s);

// Robust decoders with explicit errors instead of throwing 500
function decodeBase58(s: string): Uint8Array | null {
  try {
    return bs58.decode(s);
  } catch {
    return null;
  }
}
function decodeBase64(s: string): Uint8Array | null {
  try {
    return new Uint8Array(Buffer.from(s, "base64"));
  } catch {
    return null;
  }
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
    console.error("[nonce] error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

app.post("/auth/verify", async (req, res) => {
  const tag = `[verify ${new Date().toISOString()}]`;
  try {
    // Normalize body even if text/plain
    const raw = req.body as any;
    let body: any = raw;
    if (typeof raw === "string") {
      try {
        body = JSON.parse(raw);
      } catch {
        body = {};
      }
    }

    // Accept aliases & query fallbacks
    const q = req.query || {};
    const walletAddress: string =
      (body.walletAddress || body.address || body.wallet || q.walletAddress || q.address || q.wallet || "")
        .toString()
        .trim();
    const signatureBase58: string =
      (body.signatureBase58 || q.signatureBase58 || "").toString().trim();
    const signatureBase64: string =
      (body.signature || body.sig || q.signature || q.sig || "").toString().trim();
    const bodyMessage: string | undefined =
      (body.message || q.message) ? String(body.message || q.message) : undefined;

    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    // Prefer message from cookie, fall back to body
    const nonceCookie = req.cookies?.nonce;
    let message = bodyMessage ?? null;
    if (nonceCookie) {
      try {
        const data = jwt.verify(nonceCookie, JWT_SECRET) as NonceCookiePayload;
        if (data.t !== "nonce") {
          return res.status(400).json({ error: "Bad nonce payload" });
        }
        if (String(data.wallet) !== walletAddress) {
          return res.status(400).json({ error: "Wallet mismatch with nonce" });
        }
        message = data.msg;
      } catch (e) {
        // fall back to body
      }
    }
    if (!message) {
      return res.status(400).json({ error: "Missing nonce message" });
    }

    // Decode signature: Base64 (preferred) then Base58
    let sig: Uint8Array | null = null;
    let encUsed: "base64" | "base58" | null = null;

    if (signatureBase64) {
      sig = decodeBase64(signatureBase64);
      if (sig) encUsed = "base64";
      else {
        return res.status(400).json({ error: "Bad signature (base64)", hint: "Ensure 'signature' is valid Base64." });
      }
    } else if (signatureBase58) {
      sig = decodeBase58(signatureBase58);
      if (sig) encUsed = "base58";
      else {
        return res.status(400).json({ error: "Bad signature (base58)", hint: "Ensure 'signatureBase58' is valid Base58." });
      }
    } else {
      return res.status(400).json({ error: "Missing signature", hint: "Send 'signature' (Base64) or 'signatureBase58'." });
    }

    if (!(sig instanceof Uint8Array) || sig.length < 64) {
      return res.status(400).json({ error: "Signature length invalid" });
    }

    let pubkey: Uint8Array;
    try {
      pubkey = bs58.decode(walletAddress);
    } catch {
      return res.status(400).json({ error: "walletAddress must be base58" });
    }

    const ok = nacl.sign.detached.verify(toBytes(message), sig, pubkey);
    if (!ok) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // ----- Persist session/user/wallet -----
    // (Use optional chaining to play nice if your Prisma schema differs.)
    const db: any = prisma;

    // Try to find existing wallet
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

      await db.user?.create?.({
        data: {
          id: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          displayName: null,
        },
      });

      await db.wallet?.create?.({
        data: {
          id: walletId,
          address: walletAddress,
          chain: "solana",
          userId,
        },
      });
    }

    // 30d JWT
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
      enc: encUsed,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err: any) {
    // Keep logs short but useful; avoids leaking secrets
    console.error("[verify] error:", err?.message || err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`API running on :${PORT}`);
});

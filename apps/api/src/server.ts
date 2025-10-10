import express from "express";
import helmet from "helmet";
import cors from "cors";
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

const allowed = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const PORT = Number(process.env.PORT) || 4000;

// ---------- App ----------
const app = express();

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// CORS (lock down in prod via CORS_ORIGIN)
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow curl/postman
      if (allowed.length === 0) return cb(null, true); // allow all if not set
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);

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

function signNonceCookie(payload: Omit<NonceCookiePayload, "iat" | "exp" | "jti">) {
  const jti = randomUUID();
  // 5 minutes
  const token = jwt.sign({ t: "nonce", ...payload }, JWT_SECRET, {
    expiresIn: "5m",
    jwtid: jti
  });
  return { token, jti };
}

function setCookie(
  res: express.Response,
  name: string,
  value: string,
  maxAgeMs: number,
  options?: Partial<Parameters<typeof res.cookie>[2]>
) {
  res.cookie(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD, // true in production (HTTPS)
    maxAge: maxAgeMs,
    path: "/",
    ...options
  });
}

function clearCookie(res: express.Response, name: string) {
  res.clearCookie(name, { httpOnly: true, sameSite: "lax", secure: IS_PROD, path: "/" });
}

function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// ---------- Routes ----------
app.get("/public/healthz", (_req, res) => res.json({ ok: true }));

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
    setCookie(res, "nonce", token, 5 * 60 * 1000); // 5 minutes

    return res.json({
      wallet,
      nonce,
      message,
      expiresInSec: 300
    });
  } catch (err) {
    console.error("nonce error", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /auth/verify
 * Body: { walletAddress: string, signatureBase58: string }
 * Verifies signature over the EXACT message from /auth/nonce.
 * Upserts User + Wallet, creates a Session, returns a 30-day JWT.
 */
app.post("/auth/verify", async (req, res) => {
  try {
    const { walletAddress, signatureBase58 } = req.body ?? {};
    if (!walletAddress || !signatureBase58) {
      return res.status(400).json({ error: "walletAddress and signatureBase58 are required" });
    }

    const nonceCookie = req.cookies?.nonce;
    if (!nonceCookie) return res.status(400).json({ error: "Missing nonce cookie" });

    let nonceData: any;
    try {
      nonceData = jwt.verify(nonceCookie, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: "Invalid or expired nonce" });
    }
    if (nonceData.t !== "nonce") return res.status(400).json({ error: "Bad nonce payload" });
    if (nonceData.wallet !== walletAddress) {
      return res.status(400).json({ error: "Wallet mismatch with nonce" });
    }

    const message: string = nonceData.msg;
    const sig = bs58.decode(signatureBase58);
    const pubkey = bs58.decode(walletAddress);
    const ok = nacl.sign.detached.verify(toBytes(message), sig, pubkey);
    if (!ok) return res.status(401).json({ error: "Invalid signature" });

    // Upsert user + wallet
    const existingWallet = await prisma.wallet.findFirst({
      where: { address: walletAddress },
      select: { id: true, userId: true }
    });

    let userId: string;
    let walletId: string;

    if (existingWallet) {
      userId = existingWallet.userId;
      walletId = existingWallet.id;
    } else {
      userId = randomUUID();
      walletId = randomUUID();
      await prisma.user.create({
        data: {
          id: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          displayName: null
        }
      });
      await prisma.wallet.create({
        data: {
          id: walletId,
          address: walletAddress,
          chain: "solana",
          userId
        }
      });
    }

    // Create a 30-day auth JWT + Session row
    const jti = randomUUID();
    const authToken = jwt.sign({ sub: userId, wid: walletId, t: "auth" }, JWT_SECRET, {
      expiresIn: "30d",
      jwtid: jti
    });

    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.session.create({
      data: { id: sessionId, userId, jwtId: jti, expiresAt }
    });

    clearCookie(res, "nonce");
    setCookie(res, "auth", authToken, 30 * 24 * 60 * 60 * 1000);

    return res.json({
      ok: true,
      token: authToken,
      userId,
      walletId,
      expiresAt: expiresAt.toISOString()
    });
  } catch (err) {
    console.error("verify error", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// Example protected route (Authorization: Bearer <token>)
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

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, displayName: true, createdAt: true, updatedAt: true }
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

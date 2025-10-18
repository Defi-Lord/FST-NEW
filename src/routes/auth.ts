import express from "express";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { z } from "zod";
import { logEvent, ensureWallet } from "../utils/audit";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const NONCE_TTL_SEC = 300;

// In-memory map for issued nonces -> message text (optional convenience).
// We also put the nonce inside a signed cookie; this map is just a helper.
const issued: Map<string, string> = new Map();

router.use(cookieParser());

const NonceQuery = z.object({
  wallet: z.string().min(20)
});

router.get("/nonce", async (req, res) => {
  try {
    const { wallet } = NonceQuery.parse(req.query);

    const nonce = crypto.randomUUID();
    const message =
      `FST login\n\nWallet: ${wallet}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}\n\nBy signing, you prove ownership of this wallet.`;

    // cookie (HttpOnly) with signed payload
    const payload = {
      t: "nonce",
      wallet,
      nonce,
      msg: message,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + NONCE_TTL_SEC,
      jti: crypto.randomUUID()
    };
    const cookieJwt = jwt.sign(payload, JWT_SECRET);
    res.cookie("nonce", cookieJwt, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: NONCE_TTL_SEC * 1000
    });

    issued.set(nonce, message);

    await logEvent({
      action: "wallet_connect_nonce_requested",
      walletAddress: wallet,
      subject: nonce,
      metadata: { message },
      req
    });

    return res.json({
      wallet,
      nonce,
      message,
      expiresInSec: NONCE_TTL_SEC
    });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "bad request" });
  }
});

const VerifyBody = z.object({
  walletAddress: z.string().min(20),
  signatureBase58: z.string().min(10)
});

router.post("/verify", express.json(), async (req, res) => {
  try {
    const { walletAddress, signatureBase58 } = VerifyBody.parse(req.body);

    const nonceCookie = req.cookies?.nonce;
    if (!nonceCookie) {
      return res.status(401).json({ error: "missing nonce cookie" });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(nonceCookie, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "invalid_or_expired_nonce" });
    }

    if (decoded?.t !== "nonce" || decoded?.wallet !== walletAddress) {
      return res.status(400).json({ error: "nonce_wallet_mismatch" });
    }

    const expectedMessage: string =
      issued.get(decoded.nonce) || decoded.msg || "";
    if (!expectedMessage) {
      return res.status(400).json({ error: "nonce_message_missing" });
    }

    // Verify the signature
    const msgBytes = new TextEncoder().encode(expectedMessage);
    const sig = bs58.decode(signatureBase58);

    // Solana/Ed25519 verifying
    const pubkeyBytes = bs58.decode(walletAddress);
    const ok = nacl.sign.detached.verify(msgBytes, sig, pubkeyBytes);
    if (!ok) {
      return res.status(401).json({ error: "invalid_signature" });
    }

    // Ensure wallet exists in DB
    const wallet = await ensureWallet(walletAddress);

    // Issue access token
    const access = jwt.sign(
      {
        sub: wallet?.id || walletAddress,
        wallet: walletAddress,
        typ: "access"
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    await logEvent({
      action: "wallet_verified",
      walletAddress,
      subject: wallet?.id,
      metadata: { tokenIssued: true },
      req
    });

    return res.json({ token: access, walletId: wallet?.id, wallet: walletAddress });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "verify_failed" });
  }
});

// A minimal /me that works without a users table
router.get("/me", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.substring(7) : "";
    if (!token) return res.status(401).json({ error: "missing_token" });

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }

    // Return wallet-centric identity
    return res.json({
      wallet: decoded.wallet,
      walletId: decoded.sub,
      tokenExp: decoded.exp
    });
  } catch (e: any) {
    return res.status(500).json({ error: "me_failed" });
  }
});

export default router;

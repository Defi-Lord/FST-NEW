// apps/api/src/auth-nonce.ts
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { Express } from "express";
import { prisma } from "./utils/prisma";
import { z } from "zod";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const nonces = new Map<string, { nonce: string; expiresAt: number }>(); // key = wallet address
const IS_DEV = process.env.NODE_ENV !== "production";

function makeNonce() {
  return crypto.randomBytes(24).toString("base64url");
}

export function registerAuthRoutes(app: Express, JWT_SECRET: string) {
  const NonceReq = z.object({
    address: z.string().optional(),
    walletAddress: z.string().optional(),
  });

  app.post("/auth/nonce", async (req, res) => {
    try {
      if (IS_DEV) {
        console.log(
          "[/auth/nonce] typeof body:",
          typeof req.body,
          "isArray:",
          Array.isArray(req.body),
          "body:",
          req.body
        );
      }

      const parsed = NonceReq.parse(req.body ?? {});
      const address = (parsed.walletAddress ?? parsed.address)?.trim();
      if (!address) return res.status(400).json({ error: "address required" });

      // Validate Solana pubkey
      try {
        new PublicKey(address);
      } catch {
        return res.status(400).json({ error: "Invalid walletAddress" });
      }

      // REUSE: if an unexpired nonce exists, return it instead of creating a new one
      const existing = nonces.get(address);
      const now = Date.now();
      if (existing && existing.expiresAt > now) {
        return res.json({ nonce: existing.nonce });
      }

      const nonce = makeNonce();
      nonces.set(address, { nonce, expiresAt: now + NONCE_TTL_MS });
      return res.json({ nonce });
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || "Bad request" });
    }
  });

  const VerifyReq = z.object({
    address: z.string(),
    signature: z.string(), // base58
    nonce: z.string(),
  });

  app.post("/auth/verify", async (req, res) => {
    try {
      if (IS_DEV) {
        console.log(
          "[/auth/verify] typeof body:",
          typeof req.body,
          "isArray:",
          Array.isArray(req.body),
          "body:",
          req.body
        );
      }

      const { address, signature, nonce } = VerifyReq.parse(req.body ?? {});
      const pub = new PublicKey(address);

      const rec = nonces.get(address);
      if (!rec) return res.status(400).json({ error: "Nonce not found. Get a new nonce." });
      if (rec.expiresAt < Date.now()) {
        nonces.delete(address);
        return res.status(400).json({ error: "Nonce expired. Get a new nonce." });
      }
      if (rec.nonce !== nonce) return res.status(400).json({ error: "Nonce mismatch" });

      const msg = new TextEncoder().encode(nonce);
      const sig = bs58.decode(signature);
      const ok = nacl.sign.detached.verify(msg, sig, pub.toBytes());
      if (!ok) return res.status(401).json({ error: "Invalid signature" });

      // Find or create user
      let userId: string;
      const existingWallet = await prisma.wallet.findFirst({ where: { address } });
      if (existingWallet) {
        userId = existingWallet.userId;
      } else {
        const user = await prisma.user.create({
          data: { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date() },
        });
        await prisma.wallet.create({
          data: { id: crypto.randomUUID(), userId: user.id, address, chain: "solana", createdAt: new Date() },
        });
        userId = user.id;
      }

      const token = jwt.sign({ sub: userId, addr: address }, JWT_SECRET, { expiresIn: "7d" });

      // one-time use
      nonces.delete(address);

      res.cookie("auth", token, {
        httpOnly: true,
        secure: !IS_DEV, // false in dev (http://localhost)
        sameSite: "lax",
        maxAge: 7 * 24 * 3600 * 1000,
      });

      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || "Bad request" });
    }
  });
}

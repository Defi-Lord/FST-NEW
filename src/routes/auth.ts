// apps/api/src/routes/auth.ts
import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import { prisma } from '../utils/prisma';
import { issueJWT } from '../middleware/auth';
import {
  verifySolanaSignatureBase58,
  verifySolanaSignatureBase64,
} from '../utils/solana';

const r = Router();

/** Admin check from env */
function isAdmin(address: string) {
  const raw = process.env.ADMIN_ADDRESSES || '';
  const set = new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
  return set.has(address);
}

/** Create + store a 5-minute nonce for an address */
async function createAndStoreNonce(address: string) {
  // You can collapse to single-line if you prefer shorter messages in the wallet
  // const nonce = `FST login | addr=${address} | n=${crypto.randomBytes(16).toString('hex')} | ts=${Date.now()}`;
  const nonce = [
    'Sign in to FST',
    `Address: ${address}`,
    `Nonce: ${crypto.randomBytes(16).toString('hex')}`,
    `TS:${Date.now()}`,
  ].join('\n');

  // Upsert user (align to your schema — here User.id = wallet address)
  await prisma.user.upsert({
    where: { id: address },
    update: { updatedAt: new Date() },
    create: { id: address, createdAt: new Date(), updatedAt: new Date() },
  });

  // Store a short-lived nonce in Session (id = `nonce:<address>`)
  await prisma.session.upsert({
    where: { id: `nonce:${address}` },
    update: { jwtId: nonce, expiresAt: new Date(Date.now() + 5 * 60_000) },
    create: {
      id: `nonce:${address}`,
      userId: address,
      jwtId: nonce,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      createdAt: new Date(),
    },
  });

  return nonce;
}

/** GET /auth/nonce?address=<base58> -> { nonce } */
r.get('/nonce', async (req, res) => {
  try {
    const address = String(req.query.address || '').trim();
    if (!address) return res.status(400).json({ error: 'address is required' });
    const nonce = await createAndStoreNonce(address);
    res.json({ nonce });
  } catch (e) {
    console.error('[nonce:get] failed', e);
    res.status(500).json({ error: 'nonce failed' });
  }
});

/** POST /auth/nonce { walletAddress } -> { nonce } */
r.post('/nonce', async (req, res) => {
  try {
    const address = String(req.body?.walletAddress || '').trim();
    if (!address) return res.status(400).json({ error: 'walletAddress is required' });
    const nonce = await createAndStoreNonce(address);
    res.json({ nonce });
  } catch (e) {
    console.error('[nonce:post] failed', e);
    res.status(500).json({ error: 'nonce failed' });
  }
});

/** Helper for clean console logging (don’t mutate values) */
function showLen(s?: string) {
  return typeof s === 'string' ? s.length : s;
}

/** POST /auth/verify
 * body: {
 *   address: string,
 *   nonce: string,
 *   signatureBase64?: string,  // preferred
 *   signature58?: string       // optional alternative
 * }
 * -> { token, role }
 */
r.post('/verify', async (req, res) => {
  try {
    const { address, nonce, signatureBase64, signature58 } = req.body || {};
    const hasAll = !!address && !!nonce && (!!signatureBase64 || !!signature58);

    if (!hasAll) {
      console.warn('[verify] missing fields', {
        hasAddress: !!address,
        hasNonce: !!nonce,
        hasSigB64: !!signatureBase64,
        hasSig58: !!signature58,
      });
      return res.status(400).json({ error: 'address, nonce and signature are required' });
    }

    const addr = String(address);
    const n = String(nonce);

    const stored = await prisma.session.findUnique({ where: { id: `nonce:${addr}` } });

    if (!stored) {
      console.warn('[verify] no stored session', { address: addr });
      return res.status(400).json({ error: 'nonce invalid or expired' });
    }
    if (stored.jwtId !== n) {
      console.warn('[verify] nonce mismatch', {
        address: addr,
        storedLen: showLen(stored.jwtId),
        gotLen: showLen(n),
      });
      return res.status(400).json({ error: 'nonce invalid or expired' });
    }
    if (stored.expiresAt < new Date()) {
      console.warn('[verify] nonce expired', {
        address: addr,
        expiresAt: stored.expiresAt.toISOString(),
      });
      return res.status(400).json({ error: 'nonce invalid or expired' });
    }

    let ok = false;
    try {
      if (signatureBase64) {
        ok ||= verifySolanaSignatureBase64(addr, n, String(signatureBase64));
      }
      if (!ok && signature58) {
        ok ||= verifySolanaSignatureBase58(addr, n, String(signature58));
      }
    } catch (e) {
      console.error('[verify] signature verify error', e);
    }

    if (!ok) {
      console.warn('[verify] invalid signature', { address: addr });
      return res.status(400).json({ error: 'invalid signature' });
    }

    // Invalidate nonce (one-time use)
    await prisma.session.delete({ where: { id: `nonce:${addr}` } }).catch(() => {});

    const role = isAdmin(addr) ? 'ADMIN' : undefined;
    const token = issueJWT({ uid: addr, address: addr, role });

    console.log('[verify] ok', { address: addr, role: role ?? 'USER' });
    res.json({ token, role: role ?? 'USER' });
  } catch (e: any) {
    console.error('[verify] failed', e?.message || e);
    res.status(500).json({ error: 'verify failed' });
  }
});

/** POST /auth/introspect { token } -> { ok, payload } (for local debugging) */
r.post('/introspect', (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    res.json({ ok: true, payload });
  } catch (e: any) {
    res.status(401).json({ ok: false, error: e?.message || 'invalid token' });
  }
});

/** GET /auth/debug/nonce/:address  (DEV ONLY – remove in prod) */
r.get('/debug/nonce/:address', async (req, res) => {
  const address = String(req.params.address);
  const s = await prisma.session.findUnique({ where: { id: `nonce:${address}` } });
  res.json({
    exists: !!s,
    expiresAt: s?.expiresAt ?? null,
    jwtIdLen: showLen(s?.jwtId as any),
    startsWith: typeof s?.jwtId === 'string' ? s?.jwtId.slice(0, 40) : null,
  });
});

export default r;

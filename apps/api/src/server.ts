// apps/api/src/server.ts
import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { TextEncoder } from 'util';

/* ---------------- ENV ---------------- */
const PORT = Number(process.env.PORT || 4000);

// Comma-separated list (supports wildcards):
//   CORS_ORIGIN = https://fst-mini-app.vercel.app,https://*.vercel.app
const RAW_ORIGINS = (process.env.CORS_ORIGIN || '').trim();

// Use a LONG random string (≥64 chars) in production!
const JWT_SECRET = process.env.JWT_SECRET || 'PLEASE_SET_A_LONG_RANDOM_SECRET';

/* ------------- ORIGIN MATCH ------------- */
const ALLOWED = RAW_ORIGINS
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

function originAllowed(origin?: string) {
  if (!origin) return false;
  for (const pat of ALLOWED) {
    if (pat.includes('*')) {
      const re = new RegExp('^' + pat.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      if (re.test(origin)) return true;
    } else if (origin === pat) {
      return true;
    }
  }
  return false;
}

/* ---------------- APP ---------------- */
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

// CORS middleware (typed explicitly to avoid TS overload confusion)
const corsHandler: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
};
app.use(corsHandler);

/* -------------- HELPERS -------------- */
const te = new TextEncoder();
const utf8 = (s: string) => te.encode(s);
const signJwt = (sub: string) => jwt.sign({ sub, app: 'FST' }, JWT_SECRET, { expiresIn: '7d' });

function tokenFromAuth(req: Request) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1] : null;
}

/* -------------- ROUTES -------------- */

// Health
app.get('/public/healthz', (_req, res) => {
  res.json({
    ok: true,
    name: 'FST',
    message: 'API is running',
    docs: {
      health: '/public/healthz',
      nonce: '/auth/nonce?wallet=<BASE58_WALLET>',
      verify: 'POST /auth/verify { walletAddress, signatureBase58, nonce? }',
      me: 'GET /me (Authorization: Bearer <token>)',
    },
    allowedOrigins: ALLOWED,
  });
});

/**
 * GET /auth/nonce?wallet=<base58>
 * Sets a cross-site HttpOnly cookie 'nonce' AND returns { nonce, message } in JSON.
 */
app.get('/auth/nonce', (req, res) => {
  const wallet = String(req.query.wallet || '').trim();
  if (!wallet) return res.status(400).json({ error: 'Missing wallet' });

  const nonce = crypto.randomUUID();

  // Best-effort cookie (some browsers block it; we also return nonce in body)
  res.cookie('nonce', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 5 * 60 * 1000,
  });

  const message = `Sign in to FST as ${wallet}\nNonce: ${nonce}`;
  res.json({ wallet, nonce, message, expiresInSec: 300 });
});

/**
 * POST /auth/verify
 * Body: { walletAddress, signatureBase58, nonce? }
 * Accepts nonce from cookie OR body.
 */
app.post('/auth/verify', (req, res) => {
  const { walletAddress, signatureBase58, nonce: nonceFromBody } = req.body || {};

  if (!walletAddress || !signatureBase58) {
    return res.status(400).json({ error: 'Missing walletAddress or signatureBase58' });
  }

  const nonceCookie = req.cookies?.nonce;
  const nonce = nonceCookie || (typeof nonceFromBody === 'string' ? nonceFromBody : '');

  if (!nonce) {
    // Do NOT return "Missing nonce cookie" anymore:
    return res.status(400).json({ error: 'Missing nonce (cookie or body)' });
  }

  const message = `Sign in to FST as ${walletAddress}\nNonce: ${nonce}`;

  let pubkey: Uint8Array, sig: Uint8Array;
  try {
    pubkey = bs58.decode(walletAddress);
    sig = bs58.decode(signatureBase58);
  } catch {
    return res.status(400).json({ error: 'Invalid base58 in walletAddress or signatureBase58' });
  }

  const ok = nacl.sign.detached.verify(utf8(message), sig, pubkey);
  if (!ok) return res.status(401).json({ error: 'Invalid signature' });

  if (nonceCookie) {
    res.clearCookie('nonce', { path: '/', sameSite: 'none', secure: true });
  }

  const token = signJwt(walletAddress);

  // Optional cookie; SPA also stores in localStorage
  res.cookie('auth', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ ok: true, userId: walletAddress, token });
});

/**
 * GET /me  (Authorization: Bearer <token>)
 */
app.get('/me', (req, res) => {
  const token = tokenFromAuth(req);
  if (!token) return res.status(401).json({ error: 'Missing Authorization: Bearer <token>' });

  try {
    const payload: any = jwt.verify(token, JWT_SECRET);
    const id = String(payload?.sub || '');
    if (!id) return res.status(401).json({ error: 'Invalid token' });

    res.json({ ok: true, user: { id, wallet: id } });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

/* -------------- START -------------- */
app.listen(PORT, () => {
  console.log(`FST API listening on :${PORT}`);
  console.log(`Allowed origins: ${ALLOWED.length ? ALLOWED.join(', ') : '(none set)'}`);
});

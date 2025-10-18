// apps/api/src/routes/contests.public.ts
import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { auth } from '../middleware/auth';
import { Connection, PublicKey } from '@solana/web3.js';

// ENV
const TREASURY = process.env.SOL_TREASURY_ADDRESS || '';  // your receiving wallet
const SOL_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOL_RPC, 'confirmed');

// simple $5 in lamports quote (server decides at request time)
// You can later switch to Pyth for on-chain price or pull from Coingecko.
// For now we accept a lamports floor to protect underpayment.
const USD_CENTS = 500;

// You can override min lamports for $5 SOL with env (precomputed) if you prefer fixed.
const MIN_LAMPORTS_FOR_5USD = Number(process.env.MIN_LAMPORTS_FOR_5USD || 0);

const r = Router();

/**
 * PUBLIC: GET /contests/:id/leaderboard?limit=&offset=
 * Already mounted in server. Ranks by points desc.
 */
r.get('/:id/leaderboard', async (req, res) => {
  try {
    const contestId = String(req.params.id);
    const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) return res.status(404).json({ error: 'contest not found' });

    const entries = await prisma.contestEntry.findMany({
      where: { contestId },
      include: { user: true },
      orderBy: [{ points: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      skip: offset,
    });

    let rank = offset + 1;
    const out = entries.map((e) => ({
      rank: rank++,
      userId: e.userId,
      displayName: e.user?.displayName ?? null,
      points: e.points,
      teamName: null as string | null,
      entryId: e.id,
      createdAt: e.createdAt,
    }));

    return res.json({ ok: true, contestId, entries: out, total: out.length, offset, limit });
  } catch (e: any) {
    console.error('[contests.public] leaderboard error:', e?.message || e);
    return res.status(500).json({ error: 'failed to load leaderboard' });
  }
});

/**
 * AUTH: POST /contests/:id/join
 * Free or paid — BUT we will only allow free if entryFee == 0.
 * Body: { team?: any }
 */
r.post('/:id/join', auth, async (req, res) => {
  try {
    const contestId = String(req.params.id);
    const { uid } = (req as any).user || {};
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) return res.status(404).json({ error: 'contest not found' });
    if (!contest.active) return res.status(400).json({ error: 'contest is not active' });

    if (contest.entryFee && contest.entryFee > 0) {
      return res.status(400).json({ error: 'paid contest: use /join/start + /join/verify' });
    }

    const team = (req.body && typeof req.body === 'object') ? (req.body as any).team ?? null : null;

    const existing = await prisma.contestEntry.findUnique({
      where: { userId_contestId: { userId: String(uid), contestId } },
      include: { user: true, contest: true },
    });

    if (existing) {
      if (team !== null) {
        const updated = await prisma.contestEntry.update({
          where: { id: existing.id },
          data: { team },
          include: { user: true, contest: true },
        });
        return res.json({ ok: true, entry: updated, created: false });
      }
      return res.json({ ok: true, entry: existing, created: false });
    }

    const entry = await prisma.contestEntry.create({
      data: {
        userId: String(uid),
        contestId,
        team: team ?? undefined,
      },
      include: { user: true, contest: true },
    });

    return res.status(201).json({ ok: true, entry, created: true });
  } catch (e: any) {
    console.error('[contests.public] join error:', e?.message || e);
    return res.status(500).json({ error: 'failed to join contest' });
  }
});

/**
 * AUTH: POST /contests/:id/join/start
 * Computes lamports target for $5 SOL payment and returns payment instructions.
 * Body: { }
 * Response: { ok, to, amountLamports, memo }
 */
r.post('/:id/join/start', auth, async (req, res) => {
  try {
    const contestId = String(req.params.id);
    const { uid, address } = (req as any).user || {};
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    if (!TREASURY) return res.status(500).json({ error: 'treasury not configured' });

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) return res.status(404).json({ error: 'contest not found' });
    if (!contest.active) return res.status(400).json({ error: 'contest is not active' });
    if (!contest.entryFee || contest.entryFee <= 0) {
      return res.status(400).json({ error: 'free contest: use /join' });
    }

    // You can derive lamports using a price feed; here we accept a configured minimum.
    if (!MIN_LAMPORTS_FOR_5USD) {
      return res.status(500).json({ error: 'pricing not configured (MIN_LAMPORTS_FOR_5USD)' });
    }

    const memo = `JOIN:${contestId}:${uid}:${Date.now()}`;
    return res.json({
      ok: true,
      to: TREASURY,
      amountLamports: MIN_LAMPORTS_FOR_5USD,
      memo,
      from: address,
    });
  } catch (e: any) {
    console.error('[contests.public] join/start error:', e?.message || e);
    return res.status(500).json({ error: 'failed to start checkout' });
  }
});

/**
 * AUTH: POST /contests/:id/join/verify
 * Body: { signature: string, expectedLamports?: number }
 * Verifies the SOL transfer went to TREASURY from the same wallet and amount >= required.
 * On success, creates/returns ContestEntry.
 */
r.post('/:id/join/verify', auth, async (req, res) => {
  try {
    const contestId = String(req.params.id);
    const { uid, address } = (req as any).user || {};
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const { signature } = req.body || {};
    if (!signature) return res.status(400).json({ error: 'signature required' });
    if (!TREASURY) return res.status(500).json({ error: 'treasury not configured' });

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) return res.status(404).json({ error: 'contest not found' });
    if (!contest.active) return res.status(400).json({ error: 'contest is not active' });
    if (!contest.entryFee || contest.entryFee <= 0) {
      return res.status(400).json({ error: 'free contest: use /join' });
    }
    if (!MIN_LAMPORTS_FOR_5USD) {
      return res.status(500).json({ error: 'pricing not configured (MIN_LAMPORTS_FOR_5USD)' });
    }

    // Confirm tx
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
    if (!tx || !tx.meta) {
      return res.status(400).json({ error: 'transaction not found' });
    }
    if (tx.meta.err) {
      return res.status(400).json({ error: 'transaction failed on-chain' });
    }

    // Simple transfer check: ensure a transfer of >= MIN_LAMPORTS_FOR_5USD reached TREASURY from user's wallet
    const toKey = new PublicKey(TREASURY).toBase58();
    const fromKey = new PublicKey(address).toBase58();

    // sum postBalances - preBalances per account (rough heuristic);
    // robust method: parse inner instructions for SystemProgram transfer to treasury.
    let toDelta = 0;
    const pre = tx.meta.preBalances;
    const post = tx.meta.postBalances;
    const keys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58 ? k.pubkey.toBase58() : k.toBase58());
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === toKey) {
        toDelta = (post[i] ?? 0) - (pre[i] ?? 0);
      }
    }

    if (toDelta < MIN_LAMPORTS_FOR_5USD) {
      return res.status(400).json({ error: 'insufficient amount received' });
    }

    // Ensure sender was the same wallet
    let fromMatched = false;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === fromKey) {
        const delta = (pre[i] ?? 0) - (post[i] ?? 0);
        if (delta >= MIN_LAMPORTS_FOR_5USD) {
          fromMatched = true;
          break;
        }
      }
    }
    if (!fromMatched) {
      return res.status(400).json({ error: 'sender mismatch' });
    }

    // Upsert entry
    const existing = await prisma.contestEntry.findUnique({
      where: { userId_contestId: { userId: String(uid), contestId } },
      include: { user: true, contest: true },
    });

    if (existing) {
      return res.json({ ok: true, entry: existing, created: false });
    }

    const entry = await prisma.contestEntry.create({
      data: { userId: String(uid), contestId },
      include: { user: true, contest: true },
    });

    return res.status(201).json({ ok: true, entry, created: true });
  } catch (e: any) {
    console.error('[contests.public] join/verify error:', e?.message || e);
    return res.status(500).json({ error: 'failed to verify checkout' });
  }
});
/**
 * AUTH: GET /contests/:id/my/history
 * Returns this user's entry round-by-round scores (ContestScore).
 */
r.get('/:id/my/history', auth, async (req, res) => {
  try {
    const contestId = String(req.params.id);
    const { uid } = (req as any).user || {};
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const entry = await prisma.contestEntry.findUnique({
      where: { userId_contestId: { userId: String(uid), contestId } },
      select: { id: true, contestId: true, userId: true, contest: true },
    });
    if (!entry) return res.status(404).json({ error: 'no entry for this contest' });

    const scores = await prisma.contestScore.findMany({
      where: { entryId: entry.id },
      orderBy: { round: 'asc' },
      select: { round: true, points: true, createdAt: true },
    });

    return res.json({
      ok: true,
      contest: { id: entry.contestId, realm: entry.contest.realm, title: entry.contest.title },
      scores,
    });
  } catch (e: any) {
    console.error('[contests.public] my/history error:', e?.message || e);
    return res.status(500).json({ error: 'failed to fetch history' });
  }
});

export default r;

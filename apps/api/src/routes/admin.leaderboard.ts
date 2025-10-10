// apps/api/src/routes/admin.leaderboard.ts
import { Router } from 'express';
import { prisma } from '../utils/prisma';

const r = Router();

/**
 * GET /admin/contests/:id/leaderboard
 * Admin view of the leaderboard; same data as public but without limit/offset defaults (can accept query).
 */
r.get('/:id/leaderboard', async (req, res) => {
  try {
    const contestId = String(req.params.id);
    const limit = req.query.limit ? Math.max(1, Math.min(1000, Number(req.query.limit))) : undefined;
    const offset = Math.max(0, Number(req.query.offset ?? 0));

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) return res.status(404).json({ ok: false, error: 'contest not found' });

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

    res.json({ ok: true, contestId, entries: out, total: out.length, offset, limit: limit ?? null });
  } catch (e: any) {
    console.error('[admin/leaderboard] error:', e?.message || e);
    res.status(500).json({ ok: false, error: 'failed to load leaderboard' });
  }
});

export default r;

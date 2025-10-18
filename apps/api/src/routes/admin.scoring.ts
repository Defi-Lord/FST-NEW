// apps/api/src/routes/admin.scoring.ts
import { Router } from 'express';
import { prisma } from '../utils/prisma';
import fetch from 'node-fetch';

/**
 * Team JSON shape we expect to be stored in ContestEntry.team:
 * { picks: [{ elementId: number }, ...] }
 */
type TeamJson = { picks?: Array<{ elementId: number }> };

// helper via your own proxy
async function getElementSummary(apiBase: string, id: number) {
  const r = await fetch(`${apiBase}/fpl/api/element-summary/${id}/`);
  if (!r.ok) throw new Error(`FPL upstream failed for element ${id}`);
  return r.json() as Promise<any>;
}

const r = Router();

/**
 * POST /admin/contests/:id/recalculate
 * Body: { round: number, apiBase?: string }
 * Recomputes scores for a round, upserts ContestScore, and refreshes ContestEntry.points
 */
r.post('/:id/recalculate', async (req, res) => {
  try {
    const contestId = String(req.params.id);
    const round = Number(req.body?.round ?? 0);
    const apiBase = String(req.body?.apiBase || 'http://localhost:4000');

    if (!round || round < 1) return res.status(400).json({ error: 'round required' });

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) return res.status(404).json({ error: 'contest not found' });

    const entries = await prisma.contestEntry.findMany({
      where: { contestId },
      select: { id: true, team: true },
    });

    let updated = 0;

    for (const e of entries) {
      const team = (e.team || {}) as TeamJson;
      const picks = Array.isArray(team.picks) ? team.picks : [];

      let points = 0;

      for (const p of picks) {
        const elementId = Number(p.elementId);
        if (!elementId) continue;
        const summary = await getElementSummary(apiBase, elementId);
        // FPL element summary: { history: [{ round, total_points, ... }], ... }
        const h = Array.isArray(summary?.history) ? summary.history : [];
        const item = h.find((x: any) => Number(x.round) === round);
        if (item && typeof item.total_points === 'number') {
          points += Number(item.total_points);
        }
      }

      await prisma.contestScore.upsert({
        where: { entryId_round: { entryId: e.id, round } },
        create: { entryId: e.id, round, points, details: { picksCount: picks.length } },
        update: { points, details: { picksCount: picks.length } },
      });

      updated++;
    }

    // recompute totals per entry
    const allEntries = await prisma.contestEntry.findMany({ where: { contestId }, select: { id: true } });
    for (const e of allEntries) {
      const sum = await prisma.contestScore.aggregate({
        where: { entryId: e.id },
        _sum: { points: true },
      });
      await prisma.contestEntry.update({
        where: { id: e.id },
        data: { points: sum._sum.points || 0 },
      });
    }

    return res.json({ ok: true, updated, round });
  } catch (e: any) {
    console.error('[admin.scoring] recalc error:', e?.message || e);
    return res.status(500).json({ error: 'failed to recalculate' });
  }
});

export default r;

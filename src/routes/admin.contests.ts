// apps/api/src/routes/admin.contests.ts
import { Router } from 'express';
import * as crypto from 'crypto';
import { prisma } from '../utils/prisma';

const r = Router();

/**
 * POST /admin/contests
 * { title: string, realm: string, entryFee: number, active?: boolean }
 */
r.post('/', async (req, res) => {
  try {
    const { title, realm, entryFee, active } = req.body || {};
    if (!title || !realm || typeof entryFee !== 'number') {
      return res.status(400).json({ error: 'title, realm, entryFee required' });
    }
    const contest = await prisma.contest.create({
      data: {
        id: crypto.randomUUID().replace(/-/g, ''),
        title,
        realm,
        entryFee,
        active: typeof active === 'boolean' ? active : true,
        createdAt: new Date(),
      },
    } as any);
    res.status(201).json({ ok: true, contest });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'create failed' });
  }
});

/** GET /admin/contests */
r.get('/', async (_req, res) => {
  try {
    const list = await prisma.contest.findMany({
      orderBy: { createdAt: 'desc' as const },
      take: 200,
    } as any);
    res.json({ ok: true, contests: list });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'list failed' });
  }
});

/** PATCH /admin/contests/:id/toggle { active: boolean } */
r.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body || {};
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'active required' });
    const updated = await prisma.contest.update({ where: { id }, data: { active } } as any);
    res.json({ ok: true, contest: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'toggle failed' });
  }
});

/** DELETE /admin/contests/:id */
r.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.contest.delete({ where: { id } } as any);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'delete failed' });
  }
});

export default r;

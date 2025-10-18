// apps/api/src/routes/admin.users.ts
import { Router } from 'express';
import { prisma } from '../utils/prisma';

const r = Router();

/**
 * GET /admin/users
 * Returns all users (id, createdAt, updatedAt, displayName).
 * NOTE: If your schema differs, adjust fields accordingly.
 */
r.get('/', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, updatedAt: true, displayName: true },
    });
    res.json({ ok: true, users });
  } catch (e: any) {
    console.error('[admin/users] list error:', e?.message || e);
    res.status(500).json({ ok: false, error: 'failed to list users' });
  }
});

/**
 * GET /admin/users/:id
 * Minimal detail for now; expand with joins (entries/teams) when ready.
 */
r.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, createdAt: true, updatedAt: true, displayName: true },
    });
    if (!user) return res.status(404).json({ ok: false, error: 'not found' });

    // Placeholder: when you add participation/entries, include them here.
    res.json({ ok: true, user, contests: [] });
  } catch (e: any) {
    console.error('[admin/users] detail error:', e?.message || e);
    res.status(500).json({ ok: false, error: 'failed to fetch user' });
  }
});

export default r;

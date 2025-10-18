import express from "express";
import { prisma } from '../utils/prisma.js';

const router = express.Router();

// Super simple admin guard: send header x-admin-key that matches env ADMIN_KEY
function isAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY) return res.status(500).json({ error: "ADMIN_KEY not set" });
  if (key !== process.env.ADMIN_KEY) return res.status(403).json({ error: "forbidden" });
  next();
}

/**
 * GET /admin/activities
 * query: page, perPage, action, wallet, contestId, from, to
 */
router.get("/activities", isAdmin, async (req, res) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1"));
  const perPage = Math.min(100, parseInt((req.query.perPage as string) || "25"));

  const where: any = {};
  if (req.query.action) where.action = String(req.query.action);

  if (req.query.wallet) {
    const w = await prisma.wallet.findUnique({ where: { address: String(req.query.wallet) } });
    if (!w) return res.json({ total: 0, page, perPage, items: [] });
    where.walletId = w.id;
  }

  if (req.query.contestId) where.subject = String(req.query.contestId);

  if (req.query.from || req.query.to) {
    where.createdAt = {};
    if (req.query.from) where.createdAt.gte = new Date(String(req.query.from));
    if (req.query.to) where.createdAt.lte = new Date(String(req.query.to));
  }

  const total = await prisma.activity.count({ where });
  const items = await prisma.activity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * perPage,
    take: perPage
  });

  return res.json({ total, page, perPage, items });
});

export default router;

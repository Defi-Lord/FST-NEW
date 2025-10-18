// apps/api/src/routes/admin.ts
import { Router } from "express";
import { requireUser, requireAdmin } from "../middleware/auth.js";
import { prisma } from "../utils/prisma.js";

const router = Router();

router.get("/healthz", requireUser, requireAdmin, (_req, res) => res.json({ ok: true }));

router.get("/me", requireUser, async (req: any, res, next) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, displayName: true, role: true, updatedAt: true },
    });
    res.json({ me, token: req.user });
  } catch (e) {
    next(e);
  }
});

router.get("/users", requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, displayName: true, role: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    res.json({ users });
  } catch (e) {
    next(e);
  }
});

export default router;

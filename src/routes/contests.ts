// apps/api/src/routes/contests.ts
import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { Connection, PublicKey } from "@solana/web3.js";

const router = Router();

const TREASURY = process.env.SOL_TREASURY_ADDRESS || "";
const SOL_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(SOL_RPC, "confirmed");

const MIN_LAMPORTS_FOR_5USD = Number(process.env.MIN_LAMPORTS_FOR_5USD || 0);

router.get("/:id/leaderboard", async (req, res) => {
  try {
    const contestId = String(req.params.id);
    const limit = Math.min(200, Number(req.query.limit ?? 50));
    const offset = Math.max(0, Number(req.query.offset ?? 0));

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) return res.status(404).json({ error: "contest not found" });

    const entries = await prisma.contestEntry.findMany({
      where: { contestId },
      include: { user: true },
      orderBy: [{ points: "desc" }, { createdAt: "asc" }],
      take: limit,
      skip: offset,
    });

    let rank = offset + 1;
    const out = entries.map((e) => ({
      rank: rank++,
      userId: e.userId,
      displayName: e.user?.displayName ?? null,
      points: e.points,
      entryId: e.id,
      createdAt: e.createdAt,
    }));

    return res.json({ ok: true, contestId, entries: out });
  } catch (e: any) {
    console.error("leaderboard error:", e);
    return res.status(500).json({ error: "failed to load leaderboard" });
  }
});

router.post("/:id/join", requireAuth, async (req: any, res) => {
  try {
    const contestId = String(req.params.id);
    const { uid } = req.user;
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) return res.status(404).json({ error: "contest not found" });

    if (contest.entryFee > 0) {
      return res.status(400).json({ error: "paid contest, use join/start" });
    }

    const team = req.body?.team ?? null;

    const existing = await prisma.contestEntry.findUnique({
      where: { userId_contestId: { userId: String(uid), contestId } },
    });

    if (existing) return res.json({ ok: true, entry: existing });

    const entry = await prisma.contestEntry.create({
      data: { userId: String(uid), contestId, team: team ?? undefined },
    });

    return res.status(201).json({ ok: true, entry });
  } catch (e: any) {
    console.error("join error:", e);
    return res.status(500).json({ error: "failed to join contest" });
  }
});

export default router;

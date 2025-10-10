import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { requireAuth } from '../auth/middleware'

const r = Router()
const realmSchema = z.enum(['free','weekly','monthly','seasonal'])

r.get('/', async (_req, res) => {
  const contests = await prisma.contest.findMany({ where: { active: true } })
  res.json({ contests })
})

r.post('/join', requireAuth, async (req, res) => {
  const body = z.object({ realm: realmSchema }).parse(req.body)

  let contest = await prisma.contest.findFirst({ where: { realm: body.realm, active: true } })
  if (!contest) {
    contest = await prisma.contest.create({
      data: { realm: body.realm, title: `${body.realm} contest`, entryFee: body.realm === 'free' ? 0 : 500 }
    })
  }

  const exists = await prisma.contestEntry.findFirst({
    where: { userId: (req as any).user.id, contestId: contest.id }
  })
  if (exists) return res.json({ ok: true, already: true, contestId: contest.id })

  const entry = await prisma.contestEntry.create({
    data: { userId: (req as any).user.id, contestId: contest.id, realm: body.realm }
  })
  res.json({ ok: true, contestId: contest.id, entryId: entry.id })
})

export default r

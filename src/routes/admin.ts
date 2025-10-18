// apps/api/src/routes/admin.ts
import { Router } from 'express'
import { requireUser, requireAdmin } from '../mw/auth.js'
import prisma from '../utils/prisma.js'

const r = Router()

r.get('/healthz', requireUser, requireAdmin, (_req, res) => res.json({ ok: true }))

r.get('/me', requireUser, async (req: any, res, next) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, displayName: true, role: true, updatedAt: true }
    })
    res.json({ me, token: req.user })
  } catch (e) { next(e) }
})

r.get('/users', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, displayName: true, role: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    })
    res.json({ users })
  } catch (e) { next(e) }
})

r.post('/users/:id/promote', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: 'ADMIN' as any },
      select: { id: true, role: true }
    })
    res.json({ ok: true, user })
  } catch (e) { next(e) }
})

r.post('/wallet-admin/promote-by-address', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const { address } = req.body || {}
    if (!address) return res.status(400).json({ error: 'address required' })
    const wallet = await prisma.wallet.findFirst({ where: { address } })
    if (!wallet) return res.status(404).json({ error: 'wallet not found' })
    const user = await prisma.user.update({
      where: { id: wallet.userId },
      data: { role: 'ADMIN' as any },
      select: { id: true, role: true }
    })
    res.json({ ok: true, user })
  } catch (e) { next(e) }
})

export default r

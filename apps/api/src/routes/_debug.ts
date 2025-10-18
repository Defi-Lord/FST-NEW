// apps/api/src/routes/_debug.ts
import { Router } from 'express'
import prisma from '../utils/prisma.js'

const r = Router()

// Simple DB ping + identity
r.get('/db', async (_req, res, next) => {
  try {
    const [now] = await prisma.$queryRawUnsafe<{ now: string }[]>(`select now() as now`)
    const [who] = await prisma.$queryRawUnsafe<{ db: string; user: string; schema: string }[]>(`
      select current_database() as db, current_user as user, current_schema() as schema
    `)
    res.json({ ok: true, now: now?.now, ...who })
  } catch (e) { next(e) }
})

// Check the three auth tables exist in *this* DB/schema
r.get('/tables', async (_req, res, next) => {
  try {
    const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(`
      select table_name
      from information_schema.tables
      where table_schema = current_schema()
        and table_name in ('User','Wallet','Nonce')
      order by table_name
    `)
    res.json({ ok: true, found: rows.map(r => r.table_name) })
  } catch (e) { next(e) }
})

// Quick lookups (helpful when debugging address)
r.get('/wallet/:addr', async (req, res, next) => {
  try {
    const w = await prisma.wallet.findFirst({ where: { address: req.params.addr } })
    if (!w) return res.status(404).json({ error: 'wallet not found' })
    const u = await prisma.user.findUnique({ where: { id: w.userId } })
    res.json({ ok: true, wallet: w, user: u })
  } catch (e) { next(e) }
})

export default r
// List which Prisma models exist in the generated client (boolean flags)
r.get('/client-models', (_req, res) => {
  const p: any = prisma
  res.json({
    hasUser:  !!p.user,
    hasWallet:!!p.wallet,
    hasNonce: !!p.nonce,
  })
})

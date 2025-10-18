// src/leaderboard/routes.ts
import { Router } from 'express'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const r = Router()
const realmSchema = z.enum(['free','weekly','monthly','seasonal'])

r.get('/:realm', async (req, res) => {
  const realm = realmSchema.parse(req.params.realm)

  const rows = await prisma.team.findMany({
    where: { realm },
    orderBy: { points: 'desc' },
    select: { points: true, user: { select: { displayName: true, id: true } } },
    take: 100
  })

  const table = rows.map(row => ({
    name: row.user.displayName || 'Anon',
    points: Number(row.points || 0)
  }))

  res.json({ realm, table })
})

export default r

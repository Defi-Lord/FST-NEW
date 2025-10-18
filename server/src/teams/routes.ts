import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { requireAuth } from '../auth/middleware'

const r = Router()
const realmSchema = z.enum(['free','weekly','monthly','seasonal'])

r.get('/:realm', requireAuth, async (req, res) => {
  const realm = realmSchema.parse(req.params.realm)
  const team = await prisma.team.findUnique({
    where: { userId_realm: { userId: (req as any).user.id, realm } }
  })
  res.json({ team })
})

r.put('/:realm', requireAuth, async (req, res) => {
  const realm = realmSchema.parse(req.params.realm)
  const body = z.object({
    squad: z.array(z.object({
      id: z.union([z.string(), z.number()]),
      name: z.string(),
      club: z.string(),
      position: z.string(),
      price: z.number(),
      form: z.number().nullable().optional(),
    }))
  }).parse(req.body)

  const team = await prisma.team.upsert({
    where: { userId_realm: { userId: (req as any).user.id, realm } },
    update: { squadJson: body.squad as any },
    create: { userId: (req as any).user.id, realm, squadJson: body.squad as any }
  })
  res.json({ ok: true, team })
})

export default r

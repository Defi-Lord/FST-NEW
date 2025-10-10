import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { PrismaClient } from '@prisma/client'
import { ENV } from './env'

import nonceRoutes from './auth/nonce'
import verifyRoutes from './auth/verify'
import contestRoutes from './contests/routes'
import teamRoutes from './teams/routes'
import lbRoutes from './leaderboard/routes'

export const prisma = new PrismaClient()

const app = express()
app.use(helmet())
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({ windowMs: 60_000, max: 200 }))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/auth/nonce', nonceRoutes)
app.use('/auth/verify', verifyRoutes)
app.use('/contests', contestRoutes)
app.use('/teams', teamRoutes)
app.use('/leaderboard', lbRoutes)

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err)
  res.status(500).json({ error: 'server_error' })
})

app.listen(ENV.PORT, () => {
  console.log(`API listening on http://localhost:${ENV.PORT}`)
})

// src/server.ts
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import prisma from './utils/prisma'
import authRoutes from './routes/auth'
import adminRoutes from './routes/admin'
import userRoutes from './routes/user'

const app = express()

// Trust upstream proxy (Render/Heroku) so rate-limiter sees real IPs
app.set('trust proxy', 1)

app.use(express.json())

// Helmet tuned for JSON API
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))

// Allow multiple origins via comma-separated CORS_ORIGIN
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:3000']

app.use(cors({ origin: corsOrigins, credentials: true }))

// Simple rate limiter
app.use(rateLimit({ windowMs: 60_000, max: 300 }))

// Routes
app.use('/auth', authRoutes)
app.use('/admin', adminRoutes)
app.use('/api', userRoutes)

// Optional: barebones JSON leaderboard for clients that try /leaderboard.json
app.get('/leaderboard.json', (_req, res) => res.json([]))

// Healthz (your Admin page pings '/admin/healthz')
app.get('/admin/healthz', (_req, res) => res.json({ ok: true, admin: true }))

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Server error' })
})

const PORT = Number(process.env.PORT) || 4000
app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`)
})

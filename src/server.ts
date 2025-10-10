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
app.use(express.json())
app.use(helmet())
app.use(cors({ origin: ['https://yourapp.com', 'http://localhost:3000'], credentials: true }))
app.use(rateLimit({ windowMs: 60_000, max: 300 }))

app.use('/auth', authRoutes)
app.use('/admin', adminRoutes)
app.use('/api', userRoutes)

app.use((err:any, _req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Server error' })
})

app.listen(process.env.PORT || 4000, () => {
  console.log('API listening')
})

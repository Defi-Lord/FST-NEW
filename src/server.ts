<<<<<<< HEAD
// apps/api/src/server.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import contestRoutes from './routes/contests.js';
import adminRoutes from './routes/admin.js';

// Load .env variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Mount routes with base paths
app.use('/auth', authRoutes);       // e.g. /auth/nonce, /auth/verify
app.use('/contests', contestRoutes); // e.g. /contests/:id/leaderboard
app.use('/admin', adminRoutes);      // e.g. /admin/me

// Fallback route
app.use((_, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

app.get('/', (req, res) => {
  res.json({ message: 'API is live 🚀' });
});
=======
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
>>>>>>> 388fcd3d710d319afc1664f924593a1d50d8a439

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

import express from 'express';
import { prisma } from '../utils/prisma.js';

const router = express.Router();

// Basic root check
router.get('/', (req, res) => {
  res.send('Welcome to FST Mini App API 🎉');
});

// List all contests
router.get('/contests', async (req, res) => {
  const contests = await prisma.contest.findMany();
  res.json(contests);
});

// Telegram auth
router.post('/auth/telegram', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Missing Telegram username' });

  const user = await prisma.user.upsert({
    where: { id: username },
    update: {},
    create: {
      id: username,
      role: 'USER',
    },
  });

  res.json({ message: 'User authenticated', user });
});

export default router;

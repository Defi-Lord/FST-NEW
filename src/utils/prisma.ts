import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Useful in serverless or hot-reload, but here we’re a long-lived process.
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

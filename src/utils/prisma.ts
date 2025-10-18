// src/utils/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient(); // named export ✅

export default prisma;

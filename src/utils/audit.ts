import { prisma } from "./prisma.ts";

export async function ensureWallet(address?: string) {
  if (!address) return null;
  const normalized = address.trim();
  let w = await prisma.wallet.findUnique({ where: { address: normalized } });
  if (!w) {
    w = await prisma.wallet.create({ data: { address: normalized } });
  }
  return w;
}

export async function logEvent({
  action,
  walletAddress,
  userId,
  subject,
  metadata,
  req
}: {
  action: string;
  walletAddress?: string;
  userId?: string;
  subject?: string;
  metadata?: Record<string, any>;
  req?: any;
}) {
  try {
    let walletId: string | undefined = undefined;
    if (walletAddress) {
      const w = await ensureWallet(walletAddress);
      walletId = w?.id;
    }

    const ip =
      req?.headers?.["x-forwarded-for"]?.split?.(",")?.[0]?.trim() ||
      req?.ip ||
      req?.connection?.remoteAddress;

    const userAgent = req?.headers?.["user-agent"] || undefined;

    await prisma.activity.create({
      data: {
        walletId,
        userId,
        action,
        subject,
        metadata: metadata ?? {},
        ip,
        userAgent
      }
    });
  } catch (err) {
    console.error("audit.logEvent error", err);
  }
}

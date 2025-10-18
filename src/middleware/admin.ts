// apps/api/src/middleware/admin.ts
import type { Request, Response, NextFunction } from 'express';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as { address?: string; role?: string } | undefined;
  if (!user?.address) return res.status(401).json({ error: 'unauthorized' });

  const allowed = new Set((process.env.ADMIN_ADDRESSES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean));

  if (user.role === 'ADMIN' || allowed.has(user.address)) return next();

  return res.status(403).json({ error: 'forbidden: admin only' });
}

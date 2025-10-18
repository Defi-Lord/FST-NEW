import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { ENV } from '../env'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'no_token' })
  try {
    const payload = jwt.verify(token, ENV.JWT_SECRET) as any
    ;(req as any).user = { id: payload.sub as string, address: payload.addr as string }
    next()
  } catch {
    return res.status(401).json({ error: 'bad_token' })
  }
}

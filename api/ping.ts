// api/ping.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Use a supported runtime identifier on Vercel
export const config = { runtime: 'nodejs' }

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.status(200).json({ ok: true, now: Date.now() })
}

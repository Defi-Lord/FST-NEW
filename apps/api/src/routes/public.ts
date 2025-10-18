import { Router } from 'express'
const r = Router()
r.get('/healthz', (_req, res) => res.json({ ok: true }))
export default r

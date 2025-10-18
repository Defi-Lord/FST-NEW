import { Router } from 'express'
import { randomBytes } from 'crypto'

const r = Router()

r.post('/', async (req, res) => {
  const { address } = req.body || {}
  if (!address || typeof address !== 'string') return res.status(400).json({ error: 'bad_address' })

  const nonce = randomBytes(16).toString('hex')
  res.json({
    message: `FST — Verify wallet ownership\n\nAddress: ${address}\nNonce: ${nonce}`,
    nonce
  })
})

export default r

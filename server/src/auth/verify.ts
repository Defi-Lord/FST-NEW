import { Router } from 'express'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../index'
import { ENV } from '../env'

const r = Router()

r.post('/', async (req, res) => {
  const { address, signature, message } = req.body || {}
  if (!address || !signature || !message) return res.status(400).json({ error: 'bad_payload' })

  try {
    const pubKey = bs58.decode(address)
    const sig = bs58.decode(signature)
    const msg = new TextEncoder().encode(message)
    const ok = nacl.sign.detached.verify(msg, sig, pubKey)
    if (!ok) return res.status(401).json({ error: 'invalid_signature' })

    const wallet = await prisma.wallet.upsert({
      where: { address },
      update: {},
      create: { address, chain: 'solana', user: { create: {} } },
      include: { user: true }
    })

    const jwtId = crypto.randomUUID()
    const token = jwt.sign(
      { sub: wallet.user.id, wid: wallet.id, addr: address, jti: jwtId },
      ENV.JWT_SECRET,
      { expiresIn: '7d' }
    )

    await prisma.session.create({
      data: {
        userId: wallet.user.id,
        jwtId,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      }
    })

    res.json({ token, userId: wallet.user.id })
  } catch {
    res.status(500).json({ error: 'verify_failed' })
  }
})

export default r

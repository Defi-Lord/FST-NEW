import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const upstream = 'https://fantasy.premierleague.com/api/fixtures/?future=1'
    const r = await fetch(upstream, { headers: { 'user-agent': 'FST/1.0' } })
    if (!r.ok) return res.status(r.status).json({ error: 'upstream_error', status: r.status })
    const data = await r.json()
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).json(data)
  } catch (e) {
    return res.status(500).json({ error: 'proxy_failed', details: String(e) })
  }
}

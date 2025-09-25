// api/fpl/fixtures.ts
export default async function handler(req: any, res: any) {
  try {
    const url = new URL(req.url || '', 'http://localhost') // ✅ base is required on Vercel
    const future = url.searchParams.get('future')
    const qs = future ? '?future=1' : ''
    const r = await fetch(`https://fantasy.premierleague.com/api/fixtures/${qs}`)
    const data = await r.json()
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300')
    res.status(200).json(data)
  } catch (e: any) {
    res.status(500).json({ error: 'fixtures fetch failed', message: e?.message })
  }
}

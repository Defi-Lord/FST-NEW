// api/fpl/element-summary.ts
export default async function handler(req: any, res: any) {
  try {
    const url = new URL(req.url || '', 'http://localhost') // ✅ base
    const id = url.searchParams.get('id')
    if (!id) {
      res.status(400).json({ error: 'missing id' })
      return
    }
    const r = await fetch(`https://fantasy.premierleague.com/api/element-summary/${id}/`)
    const data = await r.json()
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300')
    res.status(200).json(data)
  } catch (e: any) {
    res.status(500).json({ error: 'element summary fetch failed', message: e?.message })
  }
}

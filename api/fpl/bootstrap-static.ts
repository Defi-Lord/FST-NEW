// api/fpl/bootstrap-static.ts
export default async function handler(req: any, res: any) {
  try {
    const r = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/')
    const data = await r.json()
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300')
    res.status(200).json(data)
  } catch (e: any) {
    res.status(500).json({ error: 'bootstrap fetch failed', message: e?.message })
  }
}

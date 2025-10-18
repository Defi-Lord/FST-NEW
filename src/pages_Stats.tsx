// src/pages_Stats.tsx
import { useEffect, useMemo, useState } from 'react'
import TopBar from './components_TopBar'
import { fetchBootstrap } from './api'

type Props = { onBack?: () => void }

type FplElement = {
  id: number
  web_name: string
  team: number
  now_cost: number
  element_type: number  // 1 GK, 2 DEF, 3 MID, 4 FWD
  form: string
}
type Pos = 'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD'
const typeToPos = (t: number): Exclude<Pos,'ALL'> =>
  (['', 'GK','DEF','MID','FWD'] as const)[t] as any
const formatMoney = (tenth: number) => `£${(tenth / 10).toFixed(1)}m`

export default function Stats({ onBack }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [players, setPlayers] = useState<FplElement[]>([])
  const [teamNameById, setTeamNameById] = useState<Map<number,string>>(new Map())

  const [pos, setPos] = useState<Pos>('ALL')
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true); setError(null)
        const boot = await fetchBootstrap()
        const elements: FplElement[] = boot?.elements ?? []
        const teams: any[] = boot?.teams ?? []
        const teamMap = new Map<number,string>()
        teams.forEach(t => teamMap.set(Number(t.id), String(t.name)))
        if (!alive) return
        setTeamNameById(teamMap)
        setPlayers(elements)
      } catch {
        if (!alive) return
        setError('Could not load stats.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const filtered = useMemo(() => {
    let list = players
    if (pos !== 'ALL') {
      const want = ['GK','DEF','MID','FWD'].indexOf(pos) + 1
      list = list.filter(p => Number(p.element_type) === want)
    }
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(p =>
        p.web_name.toLowerCase().includes(s) ||
        (teamNameById.get(p.team) || '').toLowerCase().includes(s)
      )
    }
    return [...list]
      .sort((a,b) => parseFloat(b.form || '0') - parseFloat(a.form || '0'))
      .slice(0, 50)
  }, [players, pos, q, teamNameById])

  const chip = (label: Pos) => (
    <button
      key={label}
      className={`chip ${pos === label ? 'chip--on' : ''}`}
      onClick={() => setPos(label)}
      style={{ padding: '6px 10px', borderRadius: 14 }}
    >
      {label}
    </button>
  )

  return (
    <div className="screen">
      <div className="container" style={{ padding: 0 }}>
        <TopBar title="Player Stats" onBack={onBack} />

        {/* Gradient header with controls */}
        <div
          className="card"
          style={{
            border: 'none',
            margin: 12,
            padding: 16,
            background:
              'linear-gradient(135deg, rgba(236,72,153,0.25), rgba(99,102,241,0.25))',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginRight: 'auto' }}>
              Form Leaders
            </div>
            {(['ALL','GK','DEF','MID','FWD'] as Pos[]).map(chip)}
          </div>
          <div style={{ marginTop: 12 }}>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search player or club…"
              className="input"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'inherit',
                outline: 'none'
              }}
            />
          </div>
        </div>

        <div style={{ padding: '0 12px 16px' }}>
          {loading && <div className="card subtle">Loading stats…</div>}
          {!loading && error && <div className="card subtle">{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="card subtle">No players match your filters.</div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="list">
              {filtered.map((p, i) => {
                const club = teamNameById.get(p.team) || `Team ${p.team}`
                const form = parseFloat(p.form || '0')
                const posTag = typeToPos(p.element_type)
                return (
                  <div key={p.id} className="card">
                    <div className="row" style={{ alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 28, textAlign: 'right', fontWeight: 900 }}>
                        {i + 1}.
                      </div>
                      <div
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          display: 'grid', placeItems: 'center',
                          fontWeight: 800,
                          background: 'rgba(255,255,255,0.08)',
                        }}
                        title={`${p.web_name} · ${club}`}
                      >
                        {p.web_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.web_name}
                        </div>
                        <div className="subtle" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span>{club}</span>
                          <span className="chip" style={{ padding: '2px 8px', borderRadius: 10 }}>{posTag}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 900 }}>{form.toFixed(1)} form</div>
                        <div className="subtle">{formatMoney(p.now_cost)}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
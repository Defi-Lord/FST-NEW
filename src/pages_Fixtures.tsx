// src/pages_Fixtures.tsx
import { useEffect, useMemo, useState } from 'react'
import TopBar from './components_TopBar'
import { fetchBootstrap, fetchFixtures } from './api'

type FplEvent = {
  id: number
  name: string
  is_current?: boolean
  is_next?: boolean
  finished?: boolean
  data_checked?: boolean
}
type FplFixture = {
  id: number
  event?: number
  team_h: number
  team_a: number
  kickoff_time?: string
}
type Props = { onBack?: () => void }

function fmt(dt?: string) {
  if (!dt) return 'TBD'
  try {
    const d = new Date(dt)
    return d.toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch { return dt }
}

export default function Fixtures({ onBack }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('—')
  const [rows, setRows] = useState<FplFixture[]>([])
  const [teamNameById, setTeamNameById] = useState<Map<number,string>>(new Map())

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true); setError(null)

        const [bootstrap, fixtures] = await Promise.all([
          fetchBootstrap(),
          fetchFixtures(), // your /api proxy
        ])

        const events: FplEvent[] = bootstrap?.events ?? []
        const teams: any[] = bootstrap?.teams ?? []
        const teamMap = new Map<number,string>()
        teams.forEach(t => teamMap.set(Number(t.id), String(t.name)))
        if (!alive) return
        setTeamNameById(teamMap)

        // pick the target gameweek
        let target: FplEvent | undefined =
          events.find(e => e.is_current) || events.find(e => e.is_next)
        if (!target) target = events.find(e => !(e.finished || e.data_checked))

        const all: FplFixture[] = Array.isArray(fixtures) ? fixtures : []
        let week: number | undefined = target?.id
        let list: FplFixture[] = []

        if (week) list = all.filter(f => Number(f.event) === Number(week))

        // fallback: next 7 days
        if (!week || list.length === 0) {
          const now = Date.now()
          const seven = 7 * 24 * 60 * 60 * 1000
          list = all
            .filter(f => f.kickoff_time && (new Date(f.kickoff_time).getTime() - now) <= seven)
            .sort((a,b) => new Date(a.kickoff_time || 0).getTime() - new Date(b.kickoff_time || 0).getTime())
          week = target?.id
        }

        setLabel(target?.name || (week ? `GW ${week}` : 'Upcoming'))
        setRows(list)
      } catch {
        if (!alive) return
        setError('Could not load fixtures.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const grouped = useMemo(() => {
    const byDay = new Map<string, FplFixture[]>()
    for (const f of rows) {
      const key = f.kickoff_time ? new Date(f.kickoff_time).toDateString() : 'TBD'
      const arr = byDay.get(key) || []
      arr.push(f)
      byDay.set(key, arr)
    }
    return Array.from(byDay.entries()).sort(
      (a,b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
    )
  }, [rows])

  return (
    <div className="screen">
      <div className="container" style={{ padding: 0 }}>
        <TopBar title="Fixtures" onBack={onBack} />

        {/* Gradient header */}
        <div
          className="card"
          style={{
            border: 'none',
            margin: 12,
            padding: 16,
            background:
              'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(34,197,94,0.25))',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Premier League</div>
            <div className="subtle">This Week · {label}</div>
          </div>
        </div>

        <div style={{ padding: '0 12px 16px' }}>
          {loading && <div className="card subtle">Loading fixtures…</div>}
          {!loading && error && <div className="card subtle">{error}</div>}
          {!loading && !error && grouped.length === 0 && (
            <div className="card subtle">No upcoming fixtures found.</div>
          )}

          {!loading && !error && grouped.length > 0 && (
            <div className="list">
              {grouped.map(([day, items]) => (
                <div key={day} className="card">
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>
                    {isNaN(new Date(day).getTime())
                      ? day
                      : new Date(day).toLocaleDateString(undefined, {
                          weekday: 'long', month: 'short', day: 'numeric'
                        })}
                  </div>
                  {items
                    .sort((a,b) => new Date(a.kickoff_time || 0).getTime() - new Date(b.kickoff_time || 0).getTime())
                    .map(f => (
                      <div key={f.id} className="row" style={{ alignItems: 'center', padding: '8px 0' }}>
                        <div style={{ fontWeight: 800, flex: 1, display: 'flex', justifyContent: 'space-between' }}>
                          <span>{teamNameById.get(f.team_h) || `Team ${f.team_h}`}</span>
                          <span style={{ opacity: .6 }}>vs</span>
                          <span>{teamNameById.get(f.team_a) || `Team ${f.team_a}`}</span>
                        </div>
                        <div className="subtle" style={{ marginLeft: 12, whiteSpace: 'nowrap' }}>
                          {fmt(f.kickoff_time)}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
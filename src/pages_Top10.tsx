// src/pages_Top10.tsx
import { useEffect, useMemo, useState } from 'react'
import TopBar from './components_TopBar'
import { useApp } from './state'
import { fetchBootstrap, fetchElementSummary } from './api'

/** ───────── Types ───────── */
type LbUser = {
  id: string | number
  name: string
  total: number        // accumulated season points from server (if available)
  gw?: number          // last gameweek included (optional)
}

type FplEvent = { id: number; name: string; finished: boolean; data_checked: boolean }

/** ───────── Helpers ───────── */
function resolveLatestFinishedRound(events: FplEvent[]): { round: number | null; label: string } {
  if (!Array.isArray(events) || events.length === 0) return { round: null, label: '—' }
  const finished = events.filter(e => e.finished || e.data_checked)
  if (finished.length > 0) {
    const r = finished[finished.length - 1]
    return { round: r.id, label: r.name || `GW ${r.id}` }
  }
  return { round: events[0].id, label: events[0].name || `GW ${events[0].id}` }
}

async function sumWeeklyPointsForIds(ids: (string|number)[], round: number): Promise<number> {
  const totals = await Promise.all(
    ids.map(async (id) => {
      try {
        const s = await fetchElementSummary(id)
        const row = Array.isArray(s?.history)
          ? s.history.find((h: any) => Number(h.round) === Number(round))
          : null
        const pts = Number(row?.total_points ?? 0)
        return Number.isFinite(pts) ? pts : 0
      } catch {
        return 0
      }
    })
  )
  return totals.reduce((a, b) => a + b, 0)
}

/** Medal + avatar helpers (nice visuals without extra CSS) */
const medalFor = (rank: number) =>
  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('')

/** ───────── Page ───────── */
export default function Top10({ onBack }: { onBack?: () => void }) {
  const { fullName, team } = useApp()
  const youId = 'you' // replace with real user id when you have auth

  const [loading, setLoading] = useState(true)
  const [serverError, setServerError] = useState(false)
  const [serverList, setServerList] = useState<LbUser[]>([])
  const [gwLabel, setGwLabel] = useState('—')
  const [latestRound, setLatestRound] = useState<number | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    setServerError(false)
    try {
      // 1) Get server leaderboard (if your backend provides it)
      let list: LbUser[] = []
      try {
        const r = await fetch('/leaderboard.json', { cache: 'no-store' })
        if (r.ok) {
          const data = await r.json()
          if (Array.isArray(data)) {
            list = data.map((u: any) => ({
              id: u.id ?? u.userId ?? u.uid,
              name: u.name ?? u.username ?? 'Anonymous',
              total: Number(u.total ?? u.points ?? 0),
              gw: typeof u.gw === 'number' ? u.gw : undefined,
            }))
          }
        } else {
          setServerError(true)
        }
      } catch {
        setServerError(true)
      }

      // 2) Resolve latest finished GW (for labels and local calc)
      const bootstrap = await fetchBootstrap()
      const events: FplEvent[] = bootstrap?.events ?? []
      const { round, label } = resolveLatestFinishedRound(events)
      setLatestRound(round)
      setGwLabel(label || '—')

      setServerList(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  // Compute "you" points for latest finished GW if you’re not on the server list
  const [youGW, setYouGW] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const already = serverList.some(u => String(u.id) === String(youId))
        if (already || !latestRound) { setYouGW(null); return }
        const ids = team.map(p => p.id)
        const total = await sumWeeklyPointsForIds(ids, latestRound)
        if (!alive) return
        setYouGW(total)
      } catch {
        if (!alive) return
        setYouGW(0)
      }
    })()
    return () => { alive = false }
  }, [serverList, latestRound, team])

  // Build final table (Top 10)
  const table = useMemo(() => {
    const base = [...serverList]
    if (youGW !== null) {
      base.push({ id: youId, name: fullName || 'You', total: youGW, gw: latestRound ?? undefined })
    }
    base.sort((a, b) => b.total - a.total)
    const cut = base.slice(0, 10)

    // stable rank with ties
    let lastScore: number | null = null
    let lastRank = 0
    return cut.map((u, i) => {
      const rank = (lastScore !== null && u.total === lastScore) ? lastRank : (i + 1)
      lastScore = u.total; lastRank = rank
      return { ...u, rank }
    })
  }, [serverList, youGW, fullName, latestRound])

  const hasServerData = serverList.length > 0 && !serverError

  return (
    <div className="screen">
      <div className="container" style={{ padding: 0 }}>
        <TopBar title="Top 10" onBack={onBack} />

        {/* Hero header */}
        <div
          className="card"
          style={{
            border: 'none',
            margin: 12,
            padding: 16,
            background:
              'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(236,72,153,0.25))',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 900,
                fontSize: 18,
                background: 'rgba(255,255,255,0.12)',
              }}
              title={fullName || 'You'}
            >
              {initials(fullName || 'You')}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Leaderboard</div>
              <div className="subtle">Latest: {gwLabel}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={fetchAll}>Refresh</button>
            </div>
          </div>

          {!hasServerData && (
            <div className="subtle" style={{ marginTop: 8 }}>
              Showing local preview (server leaderboard not found yet).
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '0 12px 16px' }}>
          {loading && (
            <div className="list">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="card" style={{ opacity: 0.6 }}>
                  <div className="row" style={{ alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 28, textAlign: 'right', fontWeight: 900 }}>…</div>
                    <div
                      style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'rgba(255,255,255,0.08)',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div className="subtle">Loading…</div>
                      <div className="subtle"> </div>
                    </div>
                    <div className="subtle" style={{ fontWeight: 900 }}>… pts</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && table.length === 0 && (
            <div className="card subtle">
              No entries yet. Build your squad to appear on the board.
            </div>
          )}

          {!loading && table.length > 0 && (
            <div className="list">
              {table.map(row => {
                const me = String(row.id) === String(youId)
                return (
                  <div key={String(row.id)} className="card">
                    <div className="row" style={{ alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 28, textAlign: 'right', fontWeight: 900 }}>
                        {medalFor(row.rank)}
                      </div>
                      <div
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          display: 'grid', placeItems: 'center',
                          fontWeight: 800,
                          background: me ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.08)',
                        }}
                        title={row.name}
                      >
                        {initials(row.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {me ? `${row.name} (You)` : row.name}
                        </div>
                        {row.gw ? (
                          <div className="subtle">Up to GW {row.gw}</div>
                        ) : (
                          <div className="subtle">&nbsp;</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 900 }}>{row.total} pts</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!loading && serverError && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row" style={{ alignItems: 'center' }}>
                <div className="subtle">
                  Couldn’t reach server leaderboard. Using local preview.
                </div>
                <button className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={fetchAll}>
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

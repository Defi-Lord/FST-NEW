// src/pages_CreateTeam.tsx
import { useEffect, useMemo, useState } from 'react'
import { useApp, type Player, type Position } from './state'
import TopBar from './components_TopBar'
import { fetchBootstrap } from './api'

// Debug sentinel so you can confirm this exact file is running
export const __CREATE_TEAM_FILE_ID__ = 'CreateTeam.V2.Flow-Leaderboard-Rewards-Home';
if (typeof window !== 'undefined') {
  console.log('SENTINEL:', __CREATE_TEAM_FILE_ID__);
}

/** Squad rules */
const START_BUDGET = 100.0            // shown via context, but kept here for progress calc
const LIMITS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 }
const TOTAL_SQUAD = 15
const CLUB_CAP = 3

/** Helpers */
const formatMoney = (n: number) => `£${n.toFixed(1)}m`
const countBy = <K extends string>(arr: Record<K, any>[], key: K) =>
  arr.reduce<Record<string, number>>((acc, it) => {
    const k = String(it[key]); acc[k] = (acc[k] ?? 0) + 1; return acc
  }, {})

type FplElement = {
  id: number
  web_name: string
  team: number
  now_cost: number        // tenths of a million (e.g. 96 -> £9.6m)
  element_type: number    // 1 GK, 2 DEF, 3 MID, 4 FWD
  form: string
}
type FplTeam = { id: number; name: string }
const mapTypeToPosition = (t: number): Position =>
  (['', 'GK','DEF','MID','FWD'] as const)[t] as Position

export default function CreateTeam({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack?: () => void
}) {
  const { team, addPlayer, removePlayer, budget } = useApp() // budget here is the remaining £
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [all, setAll] = useState<Player[]>([])
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<'ALL' | Position>('ALL')

  // Load live FPL player pool (proxied) with fallback to local JSON
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true); setErr(null)
        const data = await fetchBootstrap()
        const teams: FplTeam[] = data?.teams || []
        const elements: FplElement[] = data?.elements || []
        const teamNameById = new Map(teams.map(t => [t.id, t.name]))
        const mapped: Player[] = elements.map(e => ({
          id: String(e.id),
          name: e.web_name,
          club: teamNameById.get(e.team) || `Team ${e.team}`,
          position: mapTypeToPosition(e.element_type),
          price: Number((e.now_cost || 0) / 10),
          form: Number(parseFloat(e.form || '0')),
        }))
        if (!mounted) return
        setAll(mapped)
      } catch (e) {
        if (!mounted) return
        console.warn('FPL bootstrap failed; falling back to local JSON.', e)
        setErr('Couldn’t load real FPL players. Showing fallback list — check your /api proxy/rewrite.')
        try {
          const r = await fetch('/fallback-players.json', { cache: 'no-store' })
          const arr = await r.json()
          const mapped: Player[] = (arr as any[]).map(p => ({
            id: String(p.id),
            name: p.name,
            club: p.club,
            position: p.position as Position,
            price: Number(p.price),
            form: Number(p.form ?? 0),
          }))
          setAll(mapped)
        } catch {
          setAll([])
        }
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  /** Derived trackers (selected = global context `team`) */
  const posCount = useMemo(() => {
    const c: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
    team.forEach((p: Player) => { c[p.position]++ })
    return c
  }, [team])
  const clubCount = useMemo(() => countBy(team, 'club'), [team])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return all
      .filter(p => pos === 'ALL' || p.position === pos)
      .filter(p =>
        term === '' ||
        p.name.toLowerCase().includes(term) ||
        p.club.toLowerCase().includes(term) ||
        p.position.toLowerCase().includes(term))
      .sort((a, b) => b.price - a.price)
  }, [all, q, pos])

  /** Validate before adding */
  function canAdd(p: Player): { ok: boolean; reason?: string } {
    if (team.find(s => String(s.id) === String(p.id))) return { ok: false, reason: 'Already in squad' }
    if (team.length >= TOTAL_SQUAD) return { ok: false, reason: 'Squad is full' }
    if (budget - p.price < 0) return { ok: false, reason: 'Insufficient budget' }
    if (posCount[p.position] >= LIMITS[p.position]) return { ok: false, reason: `Max ${LIMITS[p.position]} ${p.position}` }
    if ((clubCount[p.club] ?? 0) >= CLUB_CAP) return { ok: false, reason: `Max ${CLUB_CAP} from ${p.club}` }
    return { ok: true }
  }

  /** Actions */
  const add = (p: Player) => {
    const v = canAdd(p)
    if (!v.ok) return alert(v.reason)
    addPlayer(p) // writes to global context + adjusts remaining budget
  }
  const remove = (p: Player) => removePlayer(p.id)

  const complete =
    team.length === TOTAL_SQUAD &&
    (['GK', 'DEF', 'MID', 'FWD'] as Position[]).every(k => posCount[k] === LIMITS[k]) &&
    budget >= 0

  /** Budget progress bar uses starting budget (100) vs used */
  const used = START_BUDGET - budget
  const usedPct = Math.min(100, Math.max(0, (used / START_BUDGET) * 100))

  return (
    <div className="screen">
      <div className="bg bg-field" />
      <div className="scrim" />

      <div className="container">
        {/* Top bar with Back + balance */}
        <div className="topbar">
          <div className="topbar-left">
            {onBack && <button className="btn-back" onClick={onBack}>←</button>}
            <div className="topbar-title">Create Team</div>
          </div>
          <div className="topbar-right">
            <span className="balance-chip">{formatMoney(budget)} left</span>
          </div>
        </div>

        {/* Budget progress */}
        <div className="progress">
          <span style={{ width: `${usedPct}%` }} />
        </div>

        {/* Filters + counters */}
        <div className="form-row">
          <select className="select" value={pos} onChange={e => setPos(e.target.value as any)}>
            <option value="ALL">All</option>
            <option value="GK">GK</option>
            <option value="DEF">DEF</option>
            <option value="MID">MID</option>
            <option value="FWD">FWD</option>
          </select>

          <div style={{ flex: 1 }} />

          <div className="chip">GK {posCount.GK}/{LIMITS.GK}</div>
          <div className="chip">DEF {posCount.DEF}/{LIMITS.DEF}</div>
          <div className="chip">MID {posCount.MID}/{LIMITS.MID}</div>
          <div className="chip">FWD {posCount.FWD}/{LIMITS.FWD}</div>
          <div className="chip">Total {team.length}/{TOTAL_SQUAD}</div>
        </div>

        {/* Search */}
        <div className="search-row">
          <input
            className="input"
            placeholder="Search player, club, or position…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {/* Loading / Error */}
        {loading && <div className="card">Loading players…</div>}
        {err && <div className="card" style={{ borderColor: 'crimson' }}>{err}</div>}

        {/* Table header + rows */}
        {!loading && !err && (
          <div className="list">
            {/* Header uses responsive CSS vars for widths */}
            <div className="card" style={{ fontWeight: 700 }}>
              <div style={{ flex: 1 }}>Player</div>
              <div style={{ width: 'var(--col-pos)', textAlign: 'center' }}>Pos</div>
              <div style={{ width: 'var(--col-club)', textAlign: 'center' }}>Club</div>
              <div style={{ width: 'var(--col-price)', textAlign: 'right' }}>Price</div>
            </div>

            {filtered.map(p => {
              const already = team.some(s => String(s.id) === String(p.id))
              const verdict = canAdd(p)
              const disabled = already || !verdict.ok
              const hint = already ? 'Already selected' : verdict.reason

              return (
                <div key={`${p.id}`} className={`card row ${already ? 'pill-you' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                    <div className="avatar" />
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <strong style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</strong>
                      <span className="subtle" style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {p.club} • {p.position}
                      </span>
                    </div>
                  </div>

                  <div style={{ width: 'var(--col-pos)', textAlign: 'center' }}>{p.position}</div>
                  <div style={{ width: 'var(--col-club)', textAlign: 'center', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.club}</div>

                  <div style={{ width: 'var(--col-price)', display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
                    <span className="price">{formatMoney(p.price)}</span>
                    <button
                      className={already ? 'btn-remove' : 'btn-add'}
                      onClick={() => already ? remove(p) : add(p)}
                      disabled={disabled}
                      title={hint}
                    >
                      {already ? 'Remove' : 'Add'}
                    </button>
                  </div>
                </div>
              )
            })}

            {filtered.length === 0 && <div className="card">No players match your filters.</div>}
          </div>
        )}

        {/* Selected squad summary */}
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Your Squad ({team.length}/{TOTAL_SQUAD})</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 6 }}>
            {team.map(p => (
              <li key={`s-${p.id}`} className="row" style={{ gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                  <div className="avatar" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                    <small className="subtle">{p.club} • {p.position}</small>
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{formatMoney(p.price)}</span>
                  <button className="btn-remove" onClick={() => remove(p)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>

          <div className="row" style={{ marginTop: 8 }}>
            <strong>Remaining:</strong>
            <strong>{formatMoney(budget)}</strong>
          </div>
        </div>

        {/* Confirm */}
        <div className="bottom-actions">
          <button
            className="cta"
            onClick={() => complete ? onNext() : alert('Select 15 players within budget and position limits.')}
            disabled={!complete}
            style={{ opacity: complete ? 1 : 0.6, width: '100%' }}
          >
            {complete ? 'Continue' : 'Select 15 players'}
          </button>
        </div>

        <div className="safe-bottom" />
      </div>
    </div>
  )
}

// src/pages_CreateTeam.tsx
import { useEffect, useMemo, useState } from 'react'
import { useApp, type Player, type Position } from './state'
import TopBar from './components_TopBar'
import { fetchBootstrap } from './api'

// Debug sentinel
export const __CREATE_TEAM_FILE_ID__ = 'CreateTeam.V3.Responsive.CompactNames';

const START_BUDGET = 100.0
const LIMITS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 }
const TOTAL_SQUAD = 15
const CLUB_CAP = 3

const formatMoney = (n: number) => `£${n.toFixed(1)}m`
const countBy = <K extends string>(arr: Record<K, any>[], key: K) =>
  arr.reduce<Record<string, number>>((acc, it) => {
    const k = String(it[key]); acc[k] = (acc[k] ?? 0) + 1; return acc
  }, {})

/** Smart short name: "Erling Braut Haaland" → "E. Haaland"; "Jean-Kévin Augustin" → "J. Augustin" */
function shortName(full: string): string {
  const clean = String(full || '').trim().replace(/\s+/g, ' ')
  if (!clean) return full
  const parts = clean.split(' ')
  const last = parts[parts.length - 1]
  const first = parts[0]
  const initial = first ? (first[0].toUpperCase() + '.') : ''
  // If last looks like an initial (rare), fall back to two parts
  if (last.length <= 2 && parts.length >= 2) {
    return `${initial} ${parts[parts.length - 2]}`
  }
  return `${initial} ${last}`
}

type FplElement = {
  id: number
  web_name: string
  team: number
  now_cost: number
  element_type: number
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
  const { team, addPlayer, removePlayer, budget } = useApp()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [all, setAll] = useState<Player[]>([])
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<'ALL' | Position>('ALL')

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
        setErr('Couldn’t load real FPL players. Showing fallback list — check your /api proxy.')
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

  function canAdd(p: Player): { ok: boolean; reason?: string } {
    if (team.find(s => String(s.id) === String(p.id))) return { ok: false, reason: 'Already in squad' }
    if (team.length >= TOTAL_SQUAD) return { ok: false, reason: 'Squad is full' }
    if (budget - p.price < 0) return { ok: false, reason: 'Insufficient budget' }
    if (posCount[p.position] >= LIMITS[p.position]) return { ok: false, reason: `Max ${LIMITS[p.position]} ${p.position}` }
    if ((clubCount[p.club] ?? 0) >= CLUB_CAP) return { ok: false, reason: `Max ${CLUB_CAP} from ${p.club}` }
    return { ok: true }
  }

  const add = (p: Player) => {
    const v = canAdd(p)
    if (!v.ok) return alert(v.reason)
    addPlayer(p)
  }
  const remove = (p: Player) => removePlayer(p.id)

  const complete =
    team.length === TOTAL_SQUAD &&
    (['GK', 'DEF', 'MID', 'FWD'] as Position[]).every(k => posCount[k] === LIMITS[k]) &&
    budget >= 0

  const used = START_BUDGET - budget
  const usedPct = Math.min(100, Math.max(0, (used / START_BUDGET) * 100))

  return (
    <div className="screen" data-resp="create-team">
      {/* Scoped, more aggressive responsive compaction */}
      <style>{`
        [data-resp="create-team"] {
          --fs-xs: clamp(9px, 2.4vw, 12px);
          --fs-sm: clamp(10px, 2.6vw, 13px);
          --fs-md: clamp(11px, 2.9vw, 14px);
          --fs-lg: clamp(12px, 3.2vw, 16px);
          --col-pos: clamp(34px, 11vw, 56px);
          --col-club: clamp(64px, 23vw, 150px);
          --col-price: clamp(86px, 24vw, 140px);
        }
        [data-resp="create-team"] .container { max-width: 100%; overflow-x: hidden; }
        [data-resp="create-team"] .card { font-size: var(--fs-md); padding: 10px; }
        [data-resp="create-team"] .subtle { font-size: var(--fs-sm); }
        [data-resp="create-team"] .topbar-title { font-size: var(--fs-lg); }
        [data-resp="create-team"] .row { gap: 8px; }
        [data-resp="create-team"] .avatar { width: clamp(24px, 6vw, 32px); height: clamp(24px, 6vw, 32px); border-radius: 999px; background: rgba(255,255,255,0.16); }
        [data-resp="create-team"] .chip { font-size: var(--fs-xs); padding: 2px 6px; }
        [data-resp="create-team"] .price { font-weight: 800; white-space: nowrap; font-size: var(--fs-sm); }
        [data-resp="create-team"] .input, [data-resp="create-team"] .select { font-size: var(--fs-md); padding: 8px 10px; }
        [data-resp="create-team"] .progress { height: 6px; }
        [data-resp="create-team"] .btn-add, [data-resp="create-team"] .btn-remove { font-size: var(--fs-sm); padding: 5px 8px; }
        [data-resp="create-team"] .cta { font-size: var(--fs-md); padding: 9px 10px; }
        @media (max-width: 480px) {
          [data-resp="create-team"] .card { padding: 8px; }
        }
      `}</style>

      <div className="container">
        <div className="topbar" style={{ gap: 6 }}>
          <div className="topbar-left" style={{ minWidth: 0 }}>
            {onBack && <button className="btn-back" onClick={onBack}>←</button>}
            <div className="topbar-title" style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Create Team
            </div>
          </div>
          <div className="topbar-right">
            <span className="balance-chip" style={{ fontSize: 'var(--fs-xs)' }}>{formatMoney(budget)} left</span>
          </div>
        </div>

        <div className="progress"><span style={{ width: `${usedPct}%` }} /></div>

        <div className="form-row" style={{ gap: 6, flexWrap: 'wrap' }}>
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

        <div className="search-row">
          <input
            className="input"
            placeholder="Search player, club, or position…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {loading && <div className="card">Loading players…</div>}
        {err && <div className="card" style={{ borderColor: 'crimson' }}>{err}</div>}

        {!loading && !err && (
          <div className="list">
            {/* Header */}
            <div className="card" style={{ fontWeight: 700, display:'flex', alignItems:'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>Player</div>
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
                <div key={`${p.id}`} className={`card row ${already ? 'pill-you' : ''}`} style={{ alignItems: 'center' }}>
                  {/* NAME (short) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <div className="avatar" />
                    <div style={{ display:'flex', flexDirection:'column', minWidth: 0 }}>
                      <strong
                        title={p.name}
                        style={{
                          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                          lineHeight: 1.05,
                          fontSize: 'var(--fs-lg)',  /* slightly larger for readability */
                          letterSpacing: 0.1
                        }}
                      >
                        {shortName(p.name)}
                      </strong>
                      <span
                        className="subtle"
                        title={`${p.club} • ${p.position}`}
                        style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}
                      >
                        {p.club} • {p.position}
                      </span>
                    </div>
                  </div>

                  {/* POS / CLUB / PRICE */}
                  <div style={{ width: 'var(--col-pos)', textAlign: 'center', fontSize:'var(--fs-sm)' }}>{p.position}</div>
                  <div
                    style={{
                      width: 'var(--col-club)',
                      textAlign: 'center',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      fontSize:'var(--fs-sm)'
                    }}
                    title={p.club}
                  >
                    {p.club}
                  </div>

                  <div style={{ width: 'var(--col-price)', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
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

        {/* Selected squad (also short names) */}
        <div className="card" style={{ marginTop: 10 }}>
          <h3 style={{ marginTop: 0, fontSize: 'var(--fs-lg)' }}>Your Squad ({team.length}/{TOTAL_SQUAD})</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 6 }}>
            {team.map(p => (
              <li key={`s-${p.id}`} className="row" style={{ gap: 6 }}>
                <div style={{ display:'flex', gap: 8, alignItems:'center', minWidth:0, flex:1 }}>
                  <div className="avatar" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontSize:'var(--fs-md)' }} title={p.name}>
                      {shortName(p.name)}
                    </div>
                    <small className="subtle" title={`${p.club} • ${p.position}`}>
                      {p.club} • {p.position}
                    </small>
                  </div>
                </div>
                <div style={{ marginLeft:'auto', display:'flex', gap: 6, alignItems:'center' }}>
                  <span style={{ fontSize:'var(--fs-sm)' }}>{formatMoney(p.price)}</span>
                  <button className="btn-remove" onClick={() => remove(p)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>

          <div className="row" style={{ marginTop: 6, fontSize:'var(--fs-md)' }}>
            <strong>Remaining:</strong>
            <strong>{formatMoney(budget)}</strong>
          </div>
        </div>

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

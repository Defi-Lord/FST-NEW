// src/pages_CreateTeam.tsx
import { useEffect, useMemo, useState } from 'react'
import { useApp, type Player, type Position } from './state'
import TopBar from './components_TopBar'
import { fetchBootstrap } from './api'

export const __CREATE_TEAM_FILE_ID__ = 'CreateTeam.V6.RealmAware+MinPos';

const START_BUDGET = 100.0
const LIMITS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 } // max caps
const MIN_REQ: Record<Position, number> = { GK: 1, DEF: 3, MID: 3, FWD: 1 } // new: realm-friendly mins
const CLUB_CAP = 3

const formatMoney = (n: number) => `£${n.toFixed(1)}m`
const countBy = <K extends string>(arr: Record<K, any>[], key: K) =>
  arr.reduce<Record<string, number>>((acc, it) => {
    const k = String(it[key]); acc[k] = (acc[k] ?? 0) + 1; return acc
  }, {})

/** Short name like “E. Haaland” */
function shortName(full: string): string {
  const clean = String(full || '').trim().replace(/\s+/g, ' ')
  if (!clean) return full
  const parts = clean.split(' ')
  const last = parts[parts.length - 1]
  const first = parts[0]
  const initial = first ? (first[0].toUpperCase() + '.') : ''
  if (last.length <= 2 && parts.length >= 2) return `${initial} ${parts[parts.length - 2]}`
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
  const { team, addPlayer, removePlayer, budget, rules } = useApp()
  const TOTAL_SQUAD = rules.players

  // --- page state ---
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [all, setAll] = useState<Player[]>([])
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<'ALL' | Position>('ALL')

  // --- load players ---
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
      } catch {
        if (!mounted) return
        setErr('Couldn’t load FPL players. Check your /api proxy; using fallback if present.')
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
        } catch { setAll([]) }
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  // --- counts & filters ---
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

  // --- rules ---
  function canAdd(p: Player): { ok: boolean; reason?: string } {
    if (team.find(s => String(s.id) === String(p.id))) return { ok: false, reason: 'Already in squad' }
    if (team.length >= TOTAL_SQUAD) return { ok: false, reason: 'Squad is full' }
    if (budget - p.price < 0) return { ok: false, reason: 'Insufficient budget' }
    if (posCount[p.position] >= LIMITS[p.position]) return { ok: false, reason: `Max ${LIMITS[p.position]} ${p.position}` }
    if ((clubCount[p.club] ?? 0) >= CLUB_CAP) return { ok: false, reason: `Max ${CLUB_CAP} from ${p.club}` }
    return { ok: true }
  }

  // --- add/remove handlers (toggle) ---
  const add = (p: Player) => {
    const v = canAdd(p)
    if (!v.ok) return alert(v.reason)
    addPlayer(p)
  }

  const remove = (p: Player) => {
    try {
      // @ts-ignore – attempt id first
      removePlayer?.(p.id)
    } catch {
      // @ts-ignore
      removePlayer?.(p)
    }
  }

  const isSelected = (p: Player) =>
    team.some(s => String(s.id) === String(p.id))

  // completion rule: exact length + minimum viable shape
  const meetsMinimums =
    posCount.GK >= MIN_REQ.GK &&
    posCount.DEF >= MIN_REQ.DEF &&
    posCount.MID >= MIN_REQ.MID &&
    posCount.FWD >= MIN_REQ.FWD

  const complete = team.length === TOTAL_SQUAD && meetsMinimums && budget >= 0

  const used = START_BUDGET - budget
  const usedPct = Math.min(100, Math.max(0, (used / START_BUDGET) * 100))

  return (
    <div className="screen" data-resp="create-team">
      {/* Page-scoped styles */}
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
        [data-resp="create-team"] .row { gap: 8px; }
        [data-resp="create-team"] .avatar { width: clamp(24px, 6vw, 32px); height: clamp(24px, 6vw, 32px); border-radius: 999px; background: rgba(255,255,255,0.16); }
        [data-resp="create-team"] .price { font-weight: 800; white-space: nowrap; font-size: var(--fs-sm); }
        [data-resp="create-team"] .input, [data-resp="create-team"] .select { font-size: var(--fs-md); padding: 8px 10px; }
        [data-resp="create-team"] .progress { height: 6px; }
        [data-resp="create-team"] .btn-add, [data-resp="create-team"] .btn-remove { font-size: var(--fs-sm); padding: 5px 8px; }
        [data-resp="create-team"] .cta { font-size: var(--fs-md); padding: 9px 10px; }

        /* Sticky header */
        .ct-stick { position: sticky; top: 0; z-index: 45; backdrop-filter: blur(8px);
          background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
          border-bottom: 1px solid rgba(255,255,255,0.12);
        }
        .ct-top { display: grid; gap: 8px; padding: 8px 8px 10px; }
        .ct-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .ct-grow { flex: 1; min-width: 120px; }
        .chip { border:1px solid rgba(255,255,255,0.16); border-radius: 999px; padding:6px 10px; }

        .ct-tabs { display: flex; gap: 8px; padding: 0 8px 8px; overflow-x: auto; }
        .ct-seg-btn {
          appearance: none; border: 1px solid rgba(255,255,255,0.16);
          background: linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          color: #fff; border-radius: 999px; padding: 8px 14px; font-weight: 800; letter-spacing: .2px;
        }
        .ct-seg-btn.is-active { border-color: rgba(255,255,255,0.28); box-shadow: 0 6px 16px rgba(99,102,241,0.25); }

        /* Selected tray */
        .ct-tray { position: sticky; top: 74px; z-index: 44; padding: 6px 8px;
          background: linear-gradient(135deg, rgba(168,85,247,0.10), rgba(59,130,246,0.10));
          border-bottom: 1px solid rgba(255,255,255,0.10);
        }
        .ct-tray-list { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
        .ct-chip { display: flex; align-items: center; gap: 6px; border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06); border-radius: 999px; padding: 6px 8px; color: #fff; white-space: nowrap;
          font-size: var(--fs-xs);
        }
        .ct-chip-text { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
        .ct-chip-x { appearance: none; border: 0; background: transparent; color: #fff; opacity: .9; font-weight: 900; padding: 0 4px; border-radius: 6px; }
        .ct-chip-x:hover { background: rgba(255,255,255,0.10); }

        /* Sticky footer */
        .ct-footer { position: sticky; bottom: 0; z-index: 46; display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 12px; backdrop-filter: blur(8px);
          background: linear-gradient(180deg, rgba(0,0,0,0.00), rgba(0,0,0,0.45));
          border-top: 1px solid rgba(255,255,255,0.14);
        }
        .ct-foot-left { color: #fff; }
        .ct-foot-title { font-weight: 800; }
        .ct-foot-sub { opacity: .85; font-size: 12px; }
        .ct-continue { appearance: none; border: 1px solid rgba(255,255,255,0.22);
          background: linear-gradient(135deg, rgba(99,102,241,0.65), rgba(236,72,153,0.65));
          color: #fff; border-radius: 12px; padding: 10px 16px; font-weight: 900;
        }
        .ct-continue[disabled] { opacity: .5; cursor: not-allowed; }
      `}</style>

      <div className="container">
        {/* Top bar */}
        <TopBar
          title="Create Team"
          onBack={onBack}
          rightSlot={
            <div className="balance-chip" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)'}}>
              {formatMoney(budget)} left
            </div>
          }
        />

        {/* Budget progress */}
        <div className="progress"><span style={{ width: `${usedPct}%` }} /></div>

        {/* Sticky header: Search first, then tabs */}
        <div className="ct-stick">
          <div className="ct-top">
            <div className="ct-row">
              <input
                className="input ct-grow"
                placeholder="Search players…"
                value={q}
                onChange={e => setQ(e.target.value)}
                aria-label="Search players"
              />
              <span className="chip" title="Budget left">{formatMoney(budget)}</span>
            </div>
            <div className="ct-tabs" role="tablist" aria-label="Positions">
              {(['ALL','GK','DEF','MID','FWD'] as const).map(t => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={pos === t}
                  onClick={() => setPos(t as any)}
                  className={`ct-seg-btn ${pos === t ? 'is-active' : ''}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="subtle" style={{ padding: '0 10px 2px' }}>
              {team.length}/{TOTAL_SQUAD} selected
            </div>
          </div>
        </div>

        {/* Mini selected tray */}
        {team.length > 0 && (
          <div className="ct-tray" aria-label="Selected players">
            <div className="ct-tray-list">
              {team.map(p => (
                <div key={`chip-${p.id}`} className="ct-chip" title={p.name}>
                  <span className="ct-chip-text">{shortName(p.name)}</span>
                  <button className="ct-chip-x" onClick={() => remove(p)} aria-label={`Remove ${p.name}`}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Players list */}
        {loading && <div className="card">Loading players…</div>}
        {err && <div className="card" style={{ borderColor: 'crimson' }}>{err}</div>}

        {!loading && !err && (
          <div className="list">
            {/* header row */}
            <div className="card" style={{ fontWeight: 700, display:'flex', alignItems:'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>Player</div>
              <div style={{ width: 'var(--col-pos)', textAlign: 'center' }}>Pos</div>
              <div style={{ width: 'var(--col-club)', textAlign: 'center' }}>Club</div>
              <div style={{ width: 'var(--col-price)', textAlign: 'right' }}>Price</div>
            </div>

            {filtered.map(p => {
              const selected = isSelected(p)
              const verdict = canAdd(p)
              const disabled = !selected && !verdict.ok // only block Add, never block Remove
              const hint = selected ? 'Remove from squad' : verdict.reason

              return (
                <div key={`${p.id}`} className={`card row ${selected ? 'pill-you' : ''}`} style={{ alignItems: 'center' }}>
                  {/* name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <div className="avatar" />
                    <div style={{ display:'flex', flexDirection:'column', minWidth: 0 }}>
                      <strong
                        title={p.name}
                        style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight: 1.05, fontSize: 'var(--fs-lg)', letterSpacing: 0.1 }}
                      >
                        {shortName(p.name)}
                      </strong>
                      <span className="subtle" title={`${p.club} • ${p.position}`} style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {p.club} • {p.position}
                      </span>
                    </div>
                  </div>

                  {/* pos / club / price + Toggle */}
                  <div style={{ width: 'var(--col-pos)', textAlign: 'center', fontSize:'var(--fs-sm)' }}>{p.position}</div>
                  <div
                    style={{ width: 'var(--col-club)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize:'var(--fs-sm)' }}
                    title={p.club}
                  >
                    {p.club}
                  </div>

                  <div style={{ width: 'var(--col-price)', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
                    <span className="price">{formatMoney(p.price)}</span>
                    <button
                      className={selected ? 'btn-remove' : 'btn-add'}
                      onClick={() => (selected ? remove(p) : add(p))}
                      disabled={disabled}
                      title={hint}
                    >
                      {selected ? 'Remove' : 'Add'}
                    </button>
                  </div>
                </div>
              )
            })}

            {filtered.length === 0 && <div className="card">No players match your filters.</div>}
          </div>
        )}

        {/* “Your Squad” */}
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

        {/* Sticky footer (Continue) */}
        <div className="ct-footer">
          <div className="ct-foot-left">
            <div className="ct-foot-title">Squad</div>
            <div className="ct-foot-sub">
              {team.length}/{TOTAL_SQUAD}{team.length < TOTAL_SQUAD ? ` · ${TOTAL_SQUAD - team.length} to go` : ''}
            </div>
          </div>
          <button
            className="ct-continue"
            onClick={() => complete ? onNext() : alert('Select your full squad within budget and position limits.')}
            disabled={!complete}
          >
            Continue
          </button>
        </div>

        <div className="safe-bottom" style={{ height: 12 }} />
      </div>
    </div>
  )
}

// src/pages_TeamSelection.tsx
import { useEffect, useMemo, useState } from 'react'
import { useApp, type Player, type Position } from './state'
import TopBar from './components_TopBar'
import { fetchBootstrap } from './api'

type Mode = 'weekly' | 'monthly' | 'seasonal'

const START_BUDGET = 100.0
const LIMITS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 }
const CLUB_CAP = 3

const SQUAD_BY_MODE: Record<Mode, number> = { weekly: 11, monthly: 13, seasonal: 15 }
const TRANSFERS_BY_MODE: Record<Mode, { quota: number; label: string }> = {
  weekly:   { quota: 0, label: 'Transfers: not allowed' },
  monthly:  { quota: 1, label: 'Transfers: 1 per week' },
  seasonal: { quota: 1, label: 'Transfers: 1 per gameweek' },
}

function getMode(): Mode {
  try {
    const v = (localStorage.getItem('contest_mode') || 'weekly') as Mode
    return (v === 'monthly' || v === 'seasonal') ? v : 'weekly'
  } catch { return 'weekly' }
}
function persistTransferPolicy(mode: Mode) {
  try {
    const p = TRANSFERS_BY_MODE[mode]
    localStorage.setItem('transfer_quota', String(p.quota))
    localStorage.setItem('transfer_period', mode === 'monthly' ? 'week' : (mode === 'seasonal' ? 'gameweek' : 'none'))
  } catch {}
}
const formatMoney = (n: number) => `£${n.toFixed(1)}m`
const countBy = <K extends string>(arr: Record<K, any>[], key: K) =>
  arr.reduce<Record<string, number>>((acc, it) => {
    const k = String(it[key]); acc[k] = (acc[k] ?? 0) + 1; return acc
  }, {})

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
  form?: string
}
type FplTeam = { id: number; name: string }
const mapTypeToPosition = (t: number): Position =>
  (['', 'GK','DEF','MID','FWD'] as const)[t] as Position

export default function TeamSelection({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack?: () => void
}) {
  const mode = getMode()
  const TOTAL_SQUAD = SQUAD_BY_MODE[mode]
  const transferPolicy = TRANSFERS_BY_MODE[mode]
  useEffect(() => { persistTransferPolicy(mode) }, [mode])

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
        })) as unknown as Player[] // satisfy Player type from state
        if (!mounted) return
        setAll(mapped)
      } catch (e: any) {
        if (!mounted) return
        setErr(e?.message || 'Failed to load players.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const posCounts = useMemo(() => countBy(team as any, 'position'), [team])
  const clubCounts = useMemo(() => countBy(team as any, 'club'), [team])
  const picked = team.length
  const complete = picked === TOTAL_SQUAD

  const qLower = q.trim().toLowerCase()
  const filtered = useMemo(() => {
    let list = all
    if (pos !== 'ALL') list = list.filter(p => p.position === pos)
    if (qLower) list = list.filter(p => {
      const inName = p.name.toLowerCase().includes(qLower)
      const inClub = p.club.toLowerCase().includes(qLower)
      const inPos = p.position.toLowerCase().includes(qLower)
      return inName || inClub || inPos
    })
    return list.slice().sort((a, b) => {
      const fb = (b as any).form ?? 0
      const fa = (a as any).form ?? 0
      if (fb !== fa) return fb - fa
      return (b.price as number) - (a.price as number)
    })
  }, [all, pos, qLower])

  function canAdd(p: Player): string | null {
    if (team.find(t => t.id === p.id)) return 'Already in squad.'
    if (picked >= TOTAL_SQUAD) return `Squad full (${TOTAL_SQUAD}).`
    if ((posCounts[p.position] || 0) >= LIMITS[p.position]) return `Max ${LIMITS[p.position]} ${p.position}.`
    if ((clubCounts[p.club] || 0) >= CLUB_CAP) return `Max ${CLUB_CAP} per club.`
    if (budget < (p.price as number)) return 'Insufficient budget.'
    return null
  }

  function toggle(p: Player) {
    if (team.find(t => t.id === p.id)) {
      // FIX: hook expects id (string|number)
      removePlayer(p.id as any)
      return
    }
    const msg = canAdd(p)
    if (msg) { alert(msg); return }
    addPlayer(p as any)
  }

  return (
    <div className="screen">
      <Style />
      <div className="container" style={{ paddingBottom: 110 }}>
        <TopBar
          title="Team Selection"
          onBack={onBack}
          rightSlot={
            <div className="chips">
              <span className="chip chip-ok">Entry confirmed ✓</span>
              <span className="chip">{mode.toUpperCase()}</span>
              <span className="chip">{transferPolicy.label}</span>
              <span className="chip">Budget {formatMoney(budget as number)}</span>
            </div>
          }
        />

        <div className="ribbon">
          Build your squad: <b>{TOTAL_SQUAD}</b> players • Position caps: GK 2, DEF 5, MID 5, FWD 3 • Max <b>3</b> per club
        </div>

        <div className="tabs">
          {(['ALL','GK','DEF','MID','FWD'] as const).map(t => (
            <button
              key={t}
              className={`tab ${pos === t ? 'active' : ''}`}
              onClick={() => setPos(t as any)}
            >
              {t}
              {t !== 'ALL' && <span className="cnt">{posCounts[t as Position] ?? 0}/{LIMITS[t as Position]}</span>}
            </button>
          ))}
          <div className="spacer" />
          <div className="totals">Total {picked}/{TOTAL_SQUAD}</div>
        </div>

        <div className="search">
          <input
            placeholder="Search player, club, or position…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {loading && <div className="card">Loading players…</div>}
        {err && !loading && <div className="card">Error: {err}</div>}
        {!loading && !err && (
          <div className="list">
            {filtered.map(p => {
              const already = team.some(t => t.id === p.id)
              const dis = !already && !!canAdd(p)
              return (
                <div key={p.id} className="card row">
                  <div className="left">
                    <div className="avatar" />
                    <div className="meta">
                      <div className="nm" title={p.name}>{shortName(p.name)}</div>
                      <div className="subtle">{p.club} • {p.position}</div>
                    </div>
                  </div>

                  <div className="right">
                    <div className="price">{formatMoney(p.price as number)}</div>
                    <button
                      className={`btn ${already ? 'btn-remove' : 'btn-add'}`}
                      onClick={() => toggle(p)}
                      disabled={dis}
                      aria-label={already ? 'Remove player' : 'Add player'}
                      title={already ? 'Remove' : (dis ? canAdd(p) ?? '' : 'Add')}
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

        <div className="card" style={{ marginTop: 10 }}>
          <h3 style={{ marginTop: 0, fontSize: 'var(--fs-lg)' }}>Your Squad ({team.length}/{TOTAL_SQUAD})</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 6 }}>
            {team.map(p => (
              <li key={`s-${p.id}`} className="row" style={{ gap: 6 }}>
                <div style={{ display:'flex', gap: 8, alignItems:'center', minWidth:0, flex:1 }}>
                  <div className="avatar" />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ fontWeight: 700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontSize:'var(--fs-md)' }}
                      title={p.name}
                    >
                      {shortName(p.name)}
                    </div>
                    <small className="subtle" title={`${p.club} • ${p.position}`}>
                      {p.club} • {p.position}
                    </small>
                  </div>
                </div>
                <div style={{ marginLeft:'auto', display:'flex', gap: 6, alignItems:'center' }}>
                  <span style={{ fontSize:'var(--fs-sm)' }}>{formatMoney(p.price as number)}</span>
                  <button className="btn-remove" onClick={() => removePlayer(p.id as any)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>

          <div className="row" style={{ marginTop: 6, fontSize:'var(--fs-md)' }}>
            <strong>Remaining:</strong>
            <strong>{formatMoney(budget as number)}</strong>
          </div>
        </div>

        <div className="bottom-actions">
          <button
            className="cta"
            onClick={() => complete ? onNext() : alert(`Select ${TOTAL_SQUAD} players within budget and position limits.`)}
            disabled={!complete}
            style={{ opacity: complete ? 1 : 0.6, width: '100%' }}
          >
            {complete ? 'Continue' : `Select ${TOTAL_SQUAD} players`}
          </button>
        </div>
        <div className="safe-bottom" />
      </div>
    </div>
  )
}

function Style() {
  return (
    <style>{`
      .container { max-width: 980px; margin: 0 auto; padding: 14px; }
      .chips { display:flex; gap:6px; flex-wrap:wrap; }
      .chip {
        border:1px solid rgba(255,255,255,0.18);
        background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05));
        border-radius: 999px; padding:6px 10px; font-size:12px;
      }
      .chip-ok { border-color: rgba(34,197,94,0.6); }

      .ribbon {
        margin: 8px 0 10px;
        border:1px dashed rgba(255,255,255,0.25);
        border-radius: 12px;
        padding: 10px 12px;
        background: radial-gradient(circle at 20% 10%, rgba(34,197,94,0.12), transparent 60%);
      }

      .tabs { display:flex; align-items:center; gap:8px; margin: 8px 0; }
      .tab {
        border-radius:999px; padding:6px 10px; border:1px solid rgba(255,255,255,0.16);
        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
        font-weight:700; font-size:12px;
      }
      .tab.active { border-color: rgba(99,102,241,0.5); box-shadow: 0 0 0 2px rgba(99,102,241,0.15) inset; }
      .cnt { margin-left:6px; opacity:.9; }
      .spacer { flex:1 }
      .totals { font-weight:900; opacity:.95; }

      .search { margin: 8px 0 10px; }
      .search input {
        width:100%; height:38px; border-radius:10px;
        border:1px solid rgba(255,255,255,0.16);
        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
        color:#fff; padding: 0 10px;
      }

      .list { display:grid; gap:8px; }
      .card {
        border:1px solid rgba(255,255,255,0.16);
        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
        border-radius:14px; padding:10px;
      }
      .row { display:flex; align-items:center; justify-content:space-between; }
      .left { display:flex; align-items:center; gap:10px; min-width:0; }
      .avatar { width:34px; height:34px; border-radius:999px; background: rgba(255,255,255,0.18); }
      .meta .nm { font-weight:800; letter-spacing:.2px; }

      .right { display:flex; align-items:center; gap:8px; }
      .price { font-weight:800; min-width: 56px; text-align:right; }
      .btn {
        height:32px; border-radius:10px; border:1px solid rgba(255,255,255,0.22);
        padding: 0 12px; font-weight:900; color:#fff;
        background: linear-gradient(135deg, rgba(99,102,241,0.55), rgba(236,72,153,0.55));
      }
      .btn-remove {
        height:32px; border-radius:10px; border:1px solid rgba(255,255,255,0.22);
        padding: 0 12px; font-weight:900; color:#fff; background: transparent;
      }

      .bottom-actions {
        position: sticky; bottom: 10px; left: 0; right: 0;
        margin-top: 12px; z-index: 10;
      }
      .cta {
        height:44px; border-radius:12px; border:1px solid rgba(255,255,255,0.22);
        font-weight:900; color:#fff;
        background: linear-gradient(135deg, rgba(99,102,241,0.65), rgba(236,72,153,0.65));
      }
      .safe-bottom { height: 60px; }
      .subtle { color: rgba(255,255,255,0.75); }
    `}</style>
  )
}

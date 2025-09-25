// src/pages_CreateTeam.tsx
import { useEffect, useMemo, useState } from 'react'
import TopBar from './components_TopBar'
import { useApp } from './state'
import { fetchBootstrap } from './api'

type Props = {
  onNext?: () => void
  onBack: () => void
}

/** ==== Types from FPL bootstrap ==== */
type FplElement = {
  id: number
  web_name: string
  first_name?: string
  second_name?: string
  team: number
  element_type: 1 | 2 | 3 | 4
  now_cost: number // tenths of a million
}
type FplTeam = { id: number; name: string; short_name: string }

type PlayerLite = {
  id: number
  name: string
  club: string
  short: string
  type: 'GK' | 'DEF' | 'MID' | 'FWD'
  price: number // millions
}

const POS_LABEL: Record<number, 'GK'|'DEF'|'MID'|'FWD'> = {
  1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD'
}

/** Format helpers */
const money = (n: number) => `£${n.toFixed(1)}m`
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0,2).map(s => s[0]?.toUpperCase() ?? '').join('')

/** Kit art (same vibe as ViewTeam) */
function hashHue(key: string) { let h = 0; for (let i=0;i<key.length;i++) h = (h*31 + key.charCodeAt(i))>>>0; return h%360 }
function kitColors(short: string) {
  const hue = hashHue(short || 'TEAM')
  return { primary: `hsl(${hue}, 70%, 45%)`, secondary: `hsl(${(hue+40)%360}, 65%, 55%)`, accent: '#ffffff' }
}
function Jersey({ code }: { code: string }) {
  const { primary, secondary, accent } = kitColors(code || 'TEAM')
  const pid = `stripes-${code}`
  return (
    <svg width="52" height="50" viewBox="0 0 52 50" aria-hidden>
      <path d="M8,10 L16,4 L26,10 L36,4 L44,10 L41,44 Q26,50 11,44 Z"
            fill={primary} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      <defs>
        <pattern id={pid} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="skewX(-20)">
          <rect width="6" height="6" fill="transparent" />
          <rect width="3" height="6" fill={secondary} opacity="0.22" />
        </pattern>
      </defs>
      <path d="M8,10 L16,4 L26,10 L36,4 L44,10 L41,44 Q26,50 11,44 Z" fill={`url(#${pid})`} />
      <circle cx="26" cy="12" r="5.5" fill={accent} opacity="0.9" />
      <text x="26" y="30" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="11" fill={accent}>
        {code || 'FC'}
      </text>
    </svg>
  )
}

export default function CreateTeam({ onNext, onBack }: Props) {
  const app = useApp()
  const { team, budget } = app
  const addPlayer = (app as any).addPlayer as ((p: any) => void) | undefined
  const removePlayer = (app as any).removePlayer as ((id: number) => void) | undefined

  const picked = team.length
  const maxSquad = 15

  /** Load FPL bootstrap → build player pool */
  const [pool, setPool] = useState<PlayerLite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        const data = await fetchBootstrap()
        const teams: FplTeam[] = data?.teams ?? []
        const elements: FplElement[] = data?.elements ?? []

        const byTeam = new Map<number, FplTeam>()
        teams.forEach(t => byTeam.set(t.id, t))

        const mapped: PlayerLite[] = elements.slice(0, 600).map((e) => {
          const t = byTeam.get(e.team)
          const name = e.web_name || [e.first_name, e.second_name].filter(Boolean).join(' ')
          return {
            id: e.id,
            name: name || 'Player',
            club: t?.name || '—',
            short: (t?.short_name || 'TEAM').toUpperCase(),
            type: POS_LABEL[e.element_type],
            price: (e.now_cost ?? 45) / 10, // convert to millions
          }
        })
        if (!alive) return
        setPool(mapped)
      } catch {
        if (!alive) return
        setPool([])
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  /** Filters */
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<'ALL'|'GK'|'DEF'|'MID'|'FWD'>('ALL')
  const [sortBy, setSortBy] = useState<'name'|'price'>('name')

  const filtered = useMemo(() => {
    let list = pool
    if (pos !== 'ALL') list = list.filter(p => p.type === pos)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(s) ||
        p.club.toLowerCase().includes(s) ||
        p.short.toLowerCase().includes(s)
      )
    }
    list = [...list].sort((a, b) => {
      if (sortBy === 'price') return b.price - a.price
      return a.name.localeCompare(b.name)
    })
    return list
  }, [pool, pos, q, sortBy])

  /** Budget & progress */
  const spent = useMemo(() => {
    return team.reduce((acc: number, p: any) => acc + (Number(p.price) || 0), 0)
  }, [team])
  const remaining = Math.max(0, budget - spent)
  const progressPct = Math.min(100, Math.round((picked / maxSquad) * 100))

  /** Actions */
  const inTeam = (id: number) => team.some((p: any) => Number(p.id) === Number(id))
  const canAdd = (p: PlayerLite) =>
    picked < maxSquad && remaining >= p.price && !inTeam(p.id)

  const onAdd = (p: PlayerLite) => {
    if (!addPlayer) return
    if (!canAdd(p)) return
    addPlayer({
      id: p.id,
      name: p.name,
      club: p.club,
      price: p.price,
      position: p.type,
      element_type: { GK:1, DEF:2, MID:3, FWD:4 }[p.type]
    })
  }
  const onRemove = (id: number) => {
    if (!removePlayer) return
    removePlayer(id)
  }

  /** Player card */
  const Card = ({ p }: { p: PlayerLite }) => {
    const selected = inTeam(p.id)
    const can = canAdd(p)
    return (
      <div
        className="card"
        style={{
          padding: 12,
          borderRadius: 16,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          minWidth: 0
        }}
      >
        <div style={{ width: 52, flexShrink:0, display:'grid', placeItems:'center' }}>
          <Jersey code={p.short} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name: white */}
          <div style={{ fontWeight: 900, color: '#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {p.name}
          </div>
          <div className="subtle" style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <span className="chip" style={{ padding:'2px 8px', borderRadius:10 }}>{p.type}</span>
            <span>{p.club}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 900 }}>{money(p.price)}</div>
          {selected ? (
            <button
              className="btn-remove"
              onClick={() => onRemove(p.id)}
              style={{ marginTop: 6 }}
            >
              Remove
            </button>
          ) : (
            <button
              className="btn-add"
              onClick={() => onAdd(p)}
              style={{ marginTop: 6, opacity: can ? 1 : 0.5, pointerEvents: can ? 'auto' : 'none' }}
            >
              Add
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="container" style={{ paddingBottom: 110, overflowX: 'hidden' }}>
        <TopBar
          title="Create Team"
          onBack={onBack}
          rightSlot={
            <div className="balance-chip">
              {money(remaining)} <span className="subtle" style={{ marginLeft:6 }}>/ {money(budget)}</span>
            </div>
          }
        />

        {/* Squad status */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row" style={{ alignItems:'flex-start', gap:10, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontWeight:900, fontSize:18 }}>Your Squad</div>
              <div className="subtle">{picked}/{maxSquad} players selected</div>
              <div className="progress" style={{ marginTop: 10 }}>
                <span style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            <div className="view-team" style={{ gap:10, flex: '0 0 auto' }}>
              <div className="subtle">Remaining</div>
              <div style={{ fontWeight:900 }}>{money(remaining)}</div>
            </div>
          </div>

          {/* Mini list of current players */}
          {picked > 0 && (
            <div className="mini-team">
              {team.slice(0, 8).map((p: any) => (
                <div key={p.id} className="mini-pill">
                  <span className="mini-dot" /> {p.name}
                </div>
              ))}
              {picked > 8 && <div className="mini-more">+{picked - 8} more</div>}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="form-row">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <select className="select" value={pos} onChange={e => setPos(e.target.value as any)}>
                <option value="ALL">All</option>
                <option value="GK">GK</option>
                <option value="DEF">DEF</option>
                <option value="MID">MID</option>
                <option value="FWD">FWD</option>
              </select>

              <select className="select" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                <option value="name">Sort: Name</option>
                <option value="price">Sort: Price</option>
              </select>
            </div>

            <div className="search-row" style={{ flex: 1, minWidth: 180 }}>
              <input
                className="input"
                placeholder="Search players or clubs…"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Players grid — fully responsive */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
        }}>
          {loading && Array.from({ length: 8 }).map((_, i) => (
            <div key={`s-${i}`} className="card" style={{ height: 96, opacity:.5 }} />
          ))}
          {!loading && filtered.slice(0, 200).map(p => (
            <Card key={p.id} p={p} />
          ))}
        </div>
      </div>

      {/* Bottom actions */}
      <nav className="bottom-actions">
        <div className="row" style={{ gap:10 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div className="avatar" style={{ display:'grid', placeItems:'center', background:'rgba(255,255,255,0.12)' }}>
              <span style={{ fontWeight:900 }}>{initials('Your Squad')}</span>
            </div>
            <div>
              <div className="subtle">Progress</div>
              <div style={{ fontWeight:900 }}>{picked}/{maxSquad}</div>
            </div>
          </div>
          <button
            className="cta"
            onClick={onNext}
            disabled={picked < maxSquad}
            style={{
              opacity: picked < maxSquad ? 0.6 : 1,
              pointerEvents: picked < maxSquad ? 'none' : 'auto',
              marginLeft: 'auto'
            }}
          >
            Enter Leaderboard
          </button>
        </div>
      </nav>
    </div>
  )
}

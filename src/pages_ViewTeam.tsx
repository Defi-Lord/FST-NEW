// src/pages_ViewTeam.tsx
import { useEffect, useMemo, useState } from 'react'
import TopBar from './components_TopBar'
import { useApp } from './state'
import { fetchBootstrap } from './api'

type Props = { onBack?: () => void; onCreateTeam?: () => void }

type Group = 'GK' | 'DEF' | 'MID' | 'FWD'
type Formation = '3-4-3' | '3-5-2' | '4-4-2' | '4-3-3' | '4-5-1' | '5-3-2' | '5-4-1'
const FORMATIONS: Formation[] = ['3-4-3','3-5-2','4-4-2','4-3-3','4-5-1','5-3-2','5-4-1']
const parseFormation = (f: Formation) => f.split('-').map(n => Number(n)) as [number, number, number]

function detectGroup(p: any): Group | null {
  const et = Number(p?.element_type ?? p?.type)
  if (et === 1) return 'GK'
  if (et === 2) return 'DEF'
  if (et === 3) return 'MID'
  if (et === 4) return 'FWD'
  const s = String(p?.position ?? p?.pos ?? '').toUpperCase()
  if (!s) return null
  if (s.startsWith('GK') || s === 'G' || s.includes('KEEP')) return 'GK'
  if (s.includes('DEF') || s === 'D' || s.startsWith('B')) return 'DEF'
  if (s.includes('MID') || s === 'M') return 'MID'
  if (s.includes('FWD') || s === 'F' || s.includes('STRIK') || s.includes('ATT')) return 'FWD'
  return null
}

type ElementLite = { id: number; team: number; form: string; ict_index: string }
type TeamMeta    = { id: number; name: string; short_name: string }

const keyOf = (p: any) => String(p?.id ?? p?.code ?? p?.name ?? p?.web_name ?? p?.player_name ?? Math.random())

const getName = (p: any) =>
  String(
    p?.name ??
    p?.web_name ??
    p?.fullName ??
    p?.player_name ??
    p?.short_name ??
    'Player'
  )

const money = (n?: number) => (n !== undefined && Number.isFinite(Number(n))) ? `£${Number(n).toFixed(1)}m` : ''

function hashHue(key: string) { let h = 0; for (let i=0;i<key.length;i++) h = (h*31 + key.charCodeAt(i))>>>0; return h%360 }
function kitColors(short: string) {
  const hue = hashHue(short || 'TEAM')
  return {
    primary:   `hsl(${hue}, 70%, 45%)`,
    secondary: `hsl(${(hue+40)%360}, 65%, 55%)`,
    accent:    '#ffffff'
  }
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

export default function ViewTeam({ onBack, onCreateTeam }: Props) {
  const { team, budget } = useApp()

  const [byElementId, setByElementId] = useState<Map<number, ElementLite>>(new Map())
  const [teamMeta, setTeamMeta] = useState<Map<number, TeamMeta>>(new Map())

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const boot = await fetchBootstrap()
        const elements: any[] = boot?.elements ?? []
        const teams: any[]    = boot?.teams ?? []

        const eMap = new Map<number, ElementLite>()
        for (const e of elements) {
          eMap.set(Number(e.id), {
            id: Number(e.id), team: Number(e.team),
            form: String(e.form ?? '0'), ict_index: String(e.ict_index ?? '0'),
          })
        }
        const tMap = new Map<number, TeamMeta>()
        for (const t of teams) {
          tMap.set(Number(t.id), {
            id: Number(t.id), name: String(t.name),
            short_name: String(t.short_name ?? (t.name || '')).toUpperCase(),
          })
        }
        if (!alive) return
        setByElementId(eMap); setTeamMeta(tMap)
      } catch {}
    })()
    return () => { alive = false }
  }, [])

  const [formation, setFormation] = useState<Formation>(() => {
    const saved = (localStorage.getItem('formation') || '') as Formation
    return (FORMATIONS.includes(saved) ? saved : '4-4-2')
  })
  useEffect(() => { localStorage.setItem('formation', formation) }, [formation])

  const roster = useMemo(() => {
    const by: Record<Group, any[]> = { GK: [], DEF: [], MID: [], FWD: [] }
    for (const p of team) {
      const g = detectGroup(p) ?? 'MID'
      by[g].push(p)
    }
    ;(Object.keys(by) as Group[]).forEach(k => by[k].sort((a,b) => String(getName(a)).localeCompare(String(getName(b)))))

    const [needD, needM, needF] = parseFormation(formation)
    const xi: any[] = []
    const bench: any[] = []

    const take = (bucket: any[], n: number) => bucket.splice(0, n)

    const gkStart = by.GK.shift() || by.DEF.shift() || by.MID.shift() || by.FWD.shift()
    if (gkStart) xi.push(gkStart)

    const fillN = (primary: Group, n: number) => {
      const out = take(by[primary], n)
      const pools: Group[] = (['DEF','MID','FWD','GK'] as Group[]).filter(g => g !== primary)
      while (out.length < n) {
        const fill = pools.reduce<any | undefined>((acc, g) => acc ?? by[g].shift(), undefined)
        if (!fill) break
        out.push(fill)
      }
      return out
    }
    xi.push(...fillN('DEF', needD))
    xi.push(...fillN('MID', needM))
    xi.push(...fillN('FWD', needF))

    const poolsInOrder = [...by.DEF, ...by.MID, ...by.FWD, ...by.GK]
    while (xi.length < 11 && poolsInOrder.length > 0) xi.push(poolsInOrder.shift())

    const benchGK = by.GK.shift(); if (benchGK) bench.push(benchGK)
    const rest = [...by.DEF, ...by.MID, ...by.FWD, ...by.GK]
    bench.push(...rest.slice(0, 3))

    return { xi, bench, need: { d: needD, m: needM, f: needF } }
  }, [team, formation])

  const [xiKeys, setXiKeys] = useState<string[]>([])
  const [benchKeys, setBenchKeys] = useState<string[]>([])
  useEffect(() => {
    setXiKeys(roster.xi.map(p => keyOf(p)))
    setBenchKeys(roster.bench.map(p => keyOf(p)))
  }, [roster.xi, roster.bench])

  const [pending, setPending] = useState<string | null>(null)

  const byKey = useMemo(() => {
    const map = new Map<string, any>()
    team.forEach(p => map.set(keyOf(p), p))
    return map
  }, [team])

  const isGK = (k: string) => detectGroup(byKey.get(k)) === 'GK'
  const isOutfield = (k: string) => {
    const g = detectGroup(byKey.get(k))
    return g === 'DEF' || g === 'MID' || g === 'FWD'
  }

  function onCardClick(k: string, zone: 'XI'|'BENCH') {
    if (!byKey.get(k)) return
    if (pending === null) { setPending(k); return }
    if (pending === k)   { setPending(null); return }

    const aInXi = xiKeys.includes(pending)
    const bInXi = xiKeys.includes(k)
    if (aInXi === bInXi) { setPending(null); return }
    if (isGK(pending) !== isGK(k)) { setPending(null); return }
    if (isOutfield(pending) !== isOutfield(k)) { setPending(null); return }

    const newXi = [...xiKeys]
    const newBench = [...benchKeys]
    if (aInXi) {
      const xiIdx = newXi.indexOf(pending)
      const bIdx  = newBench.indexOf(k)
      if (xiIdx >= 0 && bIdx >= 0) { newXi[xiIdx] = k; newBench[bIdx] = pending }
    } else {
      const xiIdx = newXi.indexOf(k)
      const bIdx  = newBench.indexOf(pending)
      if (xiIdx >= 0 && bIdx >= 0) { newXi[xiIdx] = pending; newBench[bIdx] = k }
    }
    setXiKeys(newXi); setBenchKeys(newBench); setPending(null)
  }

  const xiPlayers = useMemo(() => xiKeys.map(k => byKey.get(k)).filter(Boolean), [xiKeys, byKey])
  const rows = useMemo(() => {
    const { d, m, f } = roster.need
    const groupOf = (p: any) => detectGroup(p) ?? 'MID'
    const gk  = xiPlayers.filter((p: any) => groupOf(p) === 'GK').slice(0, 1)
    const def = xiPlayers.filter((p: any) => groupOf(p) === 'DEF').slice(0, d)
    const mid = xiPlayers.filter((p: any) => groupOf(p) === 'MID').slice(0, m)
    const fwd = xiPlayers.filter((p: any) => groupOf(p) === 'FWD').slice(0, f)
    const pad = (arr: any[], n: number) => { const out = [...arr]; while (out.length < n) out.push(null); return out }
    return { gk: pad(gk, 1), def: pad(def, d), mid: pad(mid, m), fwd: pad(fwd, f) }
  }, [xiPlayers, roster.need])

  const enrich = (p?: any) => {
    if (!p) return { club: '—', form: undefined, ict: undefined, price: undefined, short: 'TEAM' }
    const e = byElementId.get(Number(p.id))
    const t = e ? teamMeta.get(e.team) : undefined
    const form = e ? Number.parseFloat(e.form || '0') : undefined
    const ict  = e ? Number.parseFloat(e.ict_index || '0') : undefined
    return { club: t?.name || p.club || '—', form, ict, price: p.price, short: t?.short_name || 'TEAM' }
  }

  const PlayerCard = ({ k, zone }: { k: string, zone: 'XI'|'BENCH' }) => {
    const p = byKey.get(k)
    if (!p) return null
    const displayName = getName(p)
    const { club, form, ict, price, short } = enrich(p)
    const selected = pending === k
    const g = detectGroup(p)

    return (
      <button
        onClick={() => onCardClick(k, zone)}
        className="card"
        style={{
          borderRadius: 14,
          padding: 10,
          width: '100%',
          border: selected ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.12)',
          background: selected
            ? 'linear-gradient(135deg, rgba(168,85,247,0.30), rgba(99,102,241,0.24))'
            : 'rgba(0,0,0,0.24)',
          boxShadow: selected ? '0 0 0 6px rgba(168,85,247,0.18)' : 'none',
          transition: 'box-shadow 120ms ease, border-color 120ms ease, background 120ms ease',
        }}
        title={`${displayName} (${club})`}
      >
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <div style={{ width: 52, display:'grid', placeItems:'center' }}>
            <Jersey code={short} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            {/* NAME (white, always visible) */}
            <div style={{ fontWeight: 900, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {displayName}
            </div>
            {/* club only when selected */}
            <div className="subtle" style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', minHeight:18 }}>
              {selected ? (
                <>
                  <span>{club}</span>
                  <span className="chip" style={{ padding: '2px 8px', borderRadius: 10 }}>{g ?? 'MID'}</span>
                </>
              ) : (
                <span className="chip" style={{ padding: '2px 8px', borderRadius: 10 }}>{g ?? 'MID'}</span>
              )}
            </div>
          </div>
          <div style={{ textAlign:'right', minWidth:72 }}>
            <div style={{ fontWeight:900 }}>{form !== undefined ? form.toFixed(1) : '—'}</div>
            <div className="subtle">ICT {ict !== undefined ? ict.toFixed(1) : '—'}</div>
            {Number.isFinite(Number(price)) && <div className="subtle">{money(Number(price))}</div>}
          </div>
        </div>
      </button>
    )
  }

  const Ghost = () => (
    <div className="card" style={{
      borderRadius: 14, padding: 10, width: '100%', height: 86,
      border: '1px dashed rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', opacity: 0.6
    }} aria-hidden/>
  )

  const FormationRow = ({ items }: { items: (any|null)[] }) => {
    const cols = Math.max(items.length, 1)
    return (
      <div style={{ display:'grid', placeItems:'center', width: '100%' }}>
        <div
          style={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(140px, 1fr))`, // ← only tweak (from 200px)
            gap: 12,
            maxWidth: '100vw'
          }}
        >
          {items.map((p, i) => p ? <PlayerCard key={keyOf(p)} k={keyOf(p)} zone="XI" /> : <Ghost key={`ghost-${i}`} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="screen" style={{ height: '100vh', overflow: 'hidden', maxWidth: '100vw' }}>
      <div className="container" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column', maxWidth: '100vw', overflowX: 'hidden' }}>
        <TopBar
          title="Your Team"
          onBack={onBack}
          rightSlot={<div className="balance-chip" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)'}}>£{budget.toFixed(1)}m</div>}
        />

        {/* scrollable */}
        <div style={{ overflowY: 'auto', paddingBottom: 18, maxWidth: '100vw', overflowX: 'hidden' }}>
          <div className="card" style={{ border: 'none', margin: 12, padding: 14, background:
            'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(236,72,153,0.22))', backdropFilter: 'blur(4px)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <div style={{ fontWeight: 900, fontSize: 18, marginRight: 'auto' }}>This Week’s XI</div>
              <div className="subtle">Formation</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {FORMATIONS.map(f => (
                  <button
                    key={f}
                    className={`chip ${formation === f ? 'chip--on' : ''}`}
                    onClick={() => setFormation(f)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 14,
                      background: formation === f
                        ? 'linear-gradient(135deg, rgba(168,85,247,0.6), rgba(59,130,246,0.6))'
                        : 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06))',
                      border: '1px solid rgba(255,255,255,0.18)'
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button className="btn-ghost" onClick={onCreateTeam}>Go to Create Team</button>
            </div>
            <div className="subtle" style={{ marginTop: 6 }}>
              Tap a starter and a bench player (GK↔GK, outfield↔outfield) to substitute. Tap again to deselect.
            </div>
          </div>

          <div style={{ display:'grid', gap: 14, padding: '0 12px', maxWidth: '100vw', overflowX: 'hidden' }}>
            <FormationRow items={rows.gk} />
            <FormationRow items={rows.def} />
            <FormationRow items={rows.mid} />
            <FormationRow items={rows.fwd} />
          </div>

          <div style={{ padding: '12px' }}>
            <div style={{ fontWeight: 900, margin: '12px 0 6px' }}>Bench</div>
            <div className="card" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
              <div style={{ display:'flex', gap:10, padding: 8, overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
                {benchKeys.filter(k => byKey.get(k)).map(k => (
                  <div key={k} style={{ flex:'0 0 260px' }}>
                    <PlayerCard k={k} zone="BENCH" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>{/* /scrollable */}
      </div>
    </div>
  )
}

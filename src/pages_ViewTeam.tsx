// src/pages_ViewTeam.tsx
import { useEffect, useMemo, useState } from 'react'
import TopBar from './components_TopBar'
import { useApp } from './state'
import { fetchBootstrap } from './api'

type Props = { onBack?: () => void; onCreateTeam?: () => void }

type Group = 'GK' | 'DEF' | 'MID' | 'FWD'
type Formation =
  | '3-4-3' | '3-5-2'
  | '4-4-2' | '4-3-3' | '4-5-1'
  | '5-3-2' | '5-4-1'

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
const fullNameOf = (p: any) => String(p?.name ?? p?.web_name ?? p?.fullName ?? p?.player_name ?? p?.short_name ?? 'Player')
const money = (n?: number) => (n !== undefined && Number.isFinite(Number(n))) ? `£${Number(n).toFixed(1)}m` : ''

/** Smart short name: "Erling Haaland" → "E. Haaland" (keeps tooltip with full name) */
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

/* ---------- tiny jersey svg so card stays compact ---------- */
function hashHue(key: string) { let h = 0; for (let i=0;i<key.length;i++) h = (h*31 + key.charCodeAt(i))>>>0; return h%360 }
function kitColors(short: string) {
  const hue = hashHue(short || 'TEAM')
  return { primary: `hsl(${hue}, 70%, 45%)`, secondary: `hsl(${(hue+40)%360}, 65%, 55%)`, accent: '#ffffff' }
}
function Jersey({ code }: { code: string }) {
  const { primary, secondary, accent } = kitColors(code || 'TEAM')
  const pid = `stripes-${code}`
  return (
    <svg width="40" height="38" viewBox="0 0 52 50" aria-hidden>
      <path d="M8,10 L16,4 L26,10 L36,4 L44,10 L41,44 Q26,50 11,44 Z"
            fill={primary} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      <defs>
        <pattern id={pid} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="skewX(-20)">
          <rect width="6" height="6" fill="transparent" />
          <rect width="3" height="6" fill={secondary} opacity="0.22" />
        </pattern>
      </defs>
      <path d="M8,10 L16,4 L26,10 L36,4 L44,10 L41,44 Q26,50 11,44 Z" fill={`url(#${pid})`} />
      <text x="26" y="31" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="10" fill={accent}>
        {code || 'FC'}
      </text>
    </svg>
  )
}

export default function ViewTeam({ onBack, onCreateTeam }: Props) {
  const { team, budget } = useApp()

  /* -------- scoped styles: smaller card, all info inside, no overflow -------- */
  const Responsive = (
    <style>{`
      [data-resp="vt"] {
        --fs-xxs: clamp(9px, 2.1vw, 11px);
        --fs-xs:  clamp(10px, 2.3vw, 12px);
        --fs-sm:  clamp(11px, 2.6vw, 13px);
        --fs-md:  clamp(12px, 2.9vw, 14px);
        --fs-lg:  clamp(13px, 3.2vw, 16px);
        --pad:    clamp(8px, 2.2vw, 10px);
        --gap:    clamp(6px, 2vw, 8px);
      }
      [data-resp="vt"] .container { max-width: 100%; overflow-x: hidden; }
      [data-resp="vt"] .card      { font-size: var(--fs-md); padding: var(--pad) !important; }
      [data-resp="vt"] .subtle    { font-size: var(--fs-xs); }
      [data-resp="vt"] .chip      { font-size: var(--fs-xxs); padding: 2px 6px; border-radius: 10px; }
      [data-resp="vt"] .pc-grid   {
        display: grid;
        grid-template-columns: auto 1fr auto;  /* jersey | text | stats */
        align-items: center;
        gap: var(--gap);
        min-width: 0;
      }
      /* text block stays inside card */
      [data-resp="vt"] .pc-text {
        min-width: 0;
      }
      [data-resp="vt"] .pc-name {
        font-weight: 900;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: var(--fs-lg);
        letter-spacing: .1px;
        line-height: 1.05;
      }
      [data-resp="vt"] .pc-meta {
        display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
        margin-top: 2px;
      }
      /* stats column is compact and won’t force overflow */
      [data-resp="vt"] .pc-stats {
        text-align: right;
        min-width: 72px;      /* small, fixed-ish */
      }
      [data-resp="vt"] .pc-stats .val { font-weight: 900; }
      [data-resp="vt"] .pc-stats .lbl { font-size: var(--fs-xxs); opacity: .85; }
      @media (max-width: 430px) {
        /* on tiny phones, stack stats under text to save width */
        [data-resp="vt"] .pc-grid {
          grid-template-columns: auto 1fr;      /* jersey | (text+stats) */
        }
        [data-resp="vt"] .pc-stats {
          grid-column: 2 / 3;
          text-align: left;
          margin-top: 4px;
          min-width: 0;
        }
      }
      /* formation rows never overflow */
      [data-resp="vt"] .FormationRows {
        width: 100%;
        max-width: 100vw;
        display: grid;
        grid-template-columns: repeat(var(--cols, 1), minmax(58px, 1fr));
        gap: 10px;
        align-items: stretch;
        min-width: 0;
      }
    `}</style>
  )

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
    for (const p of team) (by[detectGroup(p) ?? 'MID']).push(p)
    ;(Object.keys(by) as Group[]).forEach(k => by[k].sort((a,b) => fullNameOf(a).localeCompare(fullNameOf(b))))

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

  function onCardClick(k: string, _zone: 'XI'|'BENCH') {
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

  /* ---------- light enrichment for club/form/ict/short name ---------- */
  const [byElementCached, setByElementCached] = useState<Map<string, { club: string; form?: number; ict?: number; price?: number; short: string }>>(new Map())
  useEffect(() => { setByElementCached(new Map()) }, [team])

  const byElementIdMemo = byElementId
  const teamMetaMemo = teamMeta
  const enrich = (p?: any) => {
    if (!p) return { club: '—', form: undefined, ict: undefined, price: undefined, short: 'TEAM' }
    const k = keyOf(p)
    const cached = byElementCached.get(k)
    if (cached) return cached
    const e = byElementIdMemo.get(Number(p.id))
    const t = e ? teamMetaMemo.get(e.team) : undefined
    const val = {
      club: t?.name || p.club || '—',
      form: e ? Number.parseFloat(e.form || '0') : undefined,
      ict:  e ? Number.parseFloat(e.ict_index || '0') : undefined,
      price: p.price,
      short: t?.short_name || 'TEAM'
    }
    byElementCached.set(k, val)
    return val
  }

  /* ---------- card: everything inside, compact, name shows smartly ---------- */
  const PlayerCard = ({ k, zone }: { k: string, zone: 'XI'|'BENCH' }) => {
    const p = byKey.get(k)
    if (!p) return null
    const full = fullNameOf(p)
    const name = shortName(full)
    const g = detectGroup(p) ?? 'MID'
    const { club, form, ict, price, short } = enrich(p)
    const selected = pending === k

    return (
      <button
        onClick={() => onCardClick(k, zone)}
        className="card"
        title={`${full} (${club})`}
        style={{
          borderRadius: 12,
          border: selected ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.12)',
          background: selected
            ? 'linear-gradient(135deg, rgba(168,85,247,0.26), rgba(99,102,241,0.18))'
            : 'rgba(0,0,0,0.20)',
          transition: 'box-shadow 120ms ease, border-color 120ms ease, background 120ms ease',
          width: '100%',
          maxWidth: '100%',
        }}
      >
        <div className="pc-grid">
          {/* jersey */}
          <div style={{ width: 'clamp(34px, 9vw, 40px)', display:'grid', placeItems:'center', flexShrink:0 }}>
            <Jersey code={short} />
          </div>

          {/* text: name + meta (inside card, ellipsis) */}
          <div className="pc-text">
            <div className="pc-name" title={full}>{name}</div>
            <div className="pc-meta">
              <span className="chip">{g}</span>
              <span className="chip" style={{ maxWidth:'48vw', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={club}>
                {club}
              </span>
            </div>
          </div>

          {/* compact stats (inside card) */}
          <div className="pc-stats">
            <div className="val">{form !== undefined ? form.toFixed(1) : '—'}</div>
            <div className="lbl">FORM</div>
            <div className="lbl">ICT {ict !== undefined ? ict.toFixed(1) : '—'}</div>
            {Number.isFinite(Number(price)) && <div className="lbl">{money(Number(price))}</div>}
          </div>
        </div>
      </button>
    )
  }

  const Ghost = () => (
    <div
      className="card"
      style={{
        borderRadius: 12,
        padding: 'var(--pad)',
        width: '100%',
        height: 76,
        border: '1px dashed rgba(255,255,255,0.18)',
        background: 'rgba(255,255,255,0.06)',
        opacity: 0.6
      }}
      aria-hidden
    />
  )

  const FormationRow = ({ items }: { items: (any|null)[] }) => {
    const cols = Math.max(items.length, 1)
    return (
      <div style={{ width:'100%', maxWidth:'100vw' }}>
        <div className="FormationRows" style={{ ['--cols' as any]: cols } as any}>
          {items.map((p, i) => p
            ? <PlayerCard key={keyOf(p)} k={keyOf(p)} zone="XI" />
            : <Ghost key={`ghost-${i}`} />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="screen" data-resp="vt" style={{ height:'100vh', overflow:'hidden', maxWidth:'100vw' }}>
      {Responsive}
      <div className="container" style={{ padding: 0, height:'100%', display:'flex', flexDirection:'column', maxWidth:'100vw', overflowX:'hidden' }}>
        <TopBar
          title="Your Team"
          onBack={onBack}
          rightSlot={
            <div className="balance-chip"
                 style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)', maxWidth:'42vw', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'var(--fs-xs)' }}>
              £{budget.toFixed(1)}m
            </div>
          }
        />

        {/* Scrollable content */}
        <div style={{ overflowY:'auto', paddingBottom: 16, maxWidth:'100vw', overflowX:'hidden' }}>
          {/* header / formation controls */}
          <div
            className="card"
            style={{
              border:'none',
              margin: 10,
              padding: 12,
              background:'linear-gradient(135deg, rgba(99,102,241,0.20), rgba(236,72,153,0.18))',
              backdropFilter:'blur(3px)',
            }}
          >
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <div style={{ fontWeight: 900, fontSize: 'var(--fs-lg)', marginRight: 'auto' }}>This Week’s XI</div>
              <div className="subtle">Formation</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {FORMATIONS.map(f => (
                  <button
                    key={f}
                    className={`chip ${formation === f ? 'chip--on' : ''}`}
                    onClick={() => setFormation(f)}
                    style={{
                      padding:'5px 8px',
                      background: formation === f
                        ? 'linear-gradient(135deg, rgba(168,85,247,0.55), rgba(59,130,246,0.55))'
                        : 'linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.05))',
                      border:'1px solid rgba(255,255,255,0.16)'
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button className="btn-ghost" onClick={onCreateTeam} style={{ fontSize: 'var(--fs-md)' }}>Create Team</button>
            </div>
            <div className="subtle" style={{ marginTop: 4 }}>
              Tap a starter and a bench player (GK↔GK, outfield↔outfield) to substitute.
            </div>
          </div>

          {/* formation rows (cards are fully self-contained) */}
          <div style={{ display:'grid', gap: 12, padding: '0 10px', maxWidth:'100vw' }}>
            <FormationRow items={roster.xi.filter(p => detectGroup(p) === 'GK').concat(new Array(1).fill(null)).slice(0,1)} />
            <FormationRow items={roster.xi.filter(p => detectGroup(p) === 'DEF')} />
            <FormationRow items={roster.xi.filter(p => detectGroup(p) === 'MID')} />
            <FormationRow items={roster.xi.filter(p => detectGroup(p) === 'FWD')} />
          </div>

          {/* bench */}
          <div style={{ padding: '10px', maxWidth:'100vw' }}>
            <div style={{ fontWeight: 900, margin: '8px 0 6px', fontSize: 'var(--fs-lg)' }}>Bench</div>
            <div className="card" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
              <div style={{ display:'flex', gap:8, overflowX:'auto', padding: 8 }}>
                {benchKeys
                  .filter(k => byKey.get(k))
                  .map(k => (
                    <div key={k} style={{ flex:'0 0 clamp(150px, 60vw, 210px)', maxWidth:'90vw' }}>
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

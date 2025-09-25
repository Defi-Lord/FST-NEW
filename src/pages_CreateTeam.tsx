// src/pages_CreateTeam.tsx
import { useEffect, useMemo, useState } from 'react'
import TopBar from './components_TopBar'
import { useApp } from './state'
import { fetchBootstrap } from './api'

type Props = { onNext?: () => void; onBack: () => void }

type Group = 'GK' | 'DEF' | 'MID' | 'FWD'
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

const getName = (p: any) =>
  String(
    p?.name ??
    p?.web_name ??
    p?.fullName ??
    p?.player_name ??
    p?.short_name ??
    'Player'
  )

export default function CreateTeam({ onNext, onBack }: Props) {
  const { team, budget } = useApp()

  const [boot, setBoot] = useState<any>(null)
  useEffect(() => { (async () => setBoot(await fetchBootstrap().catch(() => null)))() }, [])
  const teamById = useMemo(() => {
    const m = new Map<number, any>()
    for (const t of boot?.teams ?? []) m.set(Number(t.id), t)
    return m
  }, [boot])

  const grouped = useMemo(() => {
    const by: Record<Group, any[]> = { GK: [], DEF: [], MID: [], FWD: [] }
    for (const p of team) {
      const g = detectGroup(p) ?? 'MID'
      by[g].push(p)
    }
    ;(['GK','DEF','MID','FWD'] as Group[]).forEach(k => by[k].sort((a,b) => getName(a).localeCompare(getName(b))))
    return by
  }, [team])

  const Row = ({ title, items }: { title: string; items: any[] }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 900, margin: '4px 0 8px' }}>{title}</div>
      <div style={{ display:'flex', gap:10, paddingBottom: 4, overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
        {items.map((p) => {
          const tmeta = teamById.get(Number(p.team))
          const club = tmeta?.name || p.club || '—'
          return (
            <div key={String(p.id ?? p.code ?? p.name)} className="card" style={{ minWidth: 180, padding: 10 }}>
              <div style={{ fontWeight: 900, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {getName(p)}
              </div>
              <div className="subtle" style={{ marginTop: 2 }}>{club}</div>

              {/* your existing add/remove controls go here */}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="screen" style={{ maxWidth:'100vw', overflowX:'hidden' }}>
      <div className="container" style={{ maxWidth:'100vw', overflowX:'hidden', paddingBottom: 80 }}>
        <TopBar
          title="Create Team"
          onBack={onBack}
          rightSlot={<div className="balance-chip">£{budget.toFixed(1)}m</div>}
        />

        <div className="card" style={{
          border:'none', margin:'12px 12px 8px', padding:12,
          background:'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(236,72,153,0.22))',
          backdropFilter:'blur(4px)'
        }}>
          <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginRight:'auto' }}>Pick Your Squad</div>
          </div>
          <div className="subtle" style={{ marginTop:6 }}>
            Tip: scroll each row sideways to see more players.
          </div>
        </div>

        <div style={{ padding:'0 12px' }}>
          <Row title="Goalkeepers" items={grouped.GK} />
          <Row title="Defenders"   items={grouped.DEF} />
          <Row title="Midfielders" items={grouped.MID} />
          <Row title="Forwards"    items={grouped.FWD} />
        </div>

        <div style={{
          position:'fixed', left:0, right:0, bottom:0,
          padding: 12, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)'
        }}>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn-ghost" onClick={onBack} style={{ flex:1 }}>Back</button>
            <button className="cta" onClick={onNext} style={{ flex:2 }}>Continue</button>
          </div>
        </div>
      </div>
    </div>
  )
}

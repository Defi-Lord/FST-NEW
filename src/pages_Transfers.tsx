// src/pages_Transfers.tsx
import React from 'react'
import TopBar from './components_TopBar'
import { useApp } from './state'
import { fetchBootstrap } from './api'

type Player = {
  id: number | string
  name: string
  club: string
  pos: 'GK'|'DEF'|'MID'|'FWD'
  price: number
}

function mapBootstrapToPlayers(bootstrap: any): Player[] {
  const teamsById = new Map<number, string>()
  for (const t of bootstrap.teams || []) teamsById.set(t.id, t.name)

  const out: Player[] = []
  for (const e of bootstrap.elements || []) {
    const posId = e.element_type // 1 GK, 2 DEF, 3 MID, 4 FWD
    const pos: Player['pos'] = posId === 1 ? 'GK' : posId === 2 ? 'DEF' : posId === 3 ? 'MID' : 'FWD'
    out.push({
      id: e.id,
      name: `${e.first_name} ${e.second_name}`,
      club: teamsById.get(e.team) || String(e.team),
      pos,
      price: e.now_cost / 10, // FPL *10 pricing
    })
  }
  return out
}

export default function Transfers({ onBack }: { onBack?: () => void }) {
  const { team, setTeam, budget, setBudget, rules, realm } = useApp()
  const [pool, setPool] = React.useState<Player[]>([])
  const [q, setQ] = React.useState('')
  const [pos, setPos] = React.useState<'ALL'|Player['pos']>('ALL')
  const [club, setClub] = React.useState('ALL')
  const [clubs, setClubs] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const locked = String(realm).toLowerCase() === 'weekly'

  React.useEffect(() => {
    (async () => {
      try {
        setBusy(true)
        const bs = await fetchBootstrap()
        const players = mapBootstrapToPlayers(bs)
        setPool(players)
        setClubs(['ALL', ...Array.from(new Set(players.map(p => p.club))).sort()])
      } catch (e: any) {
        setErr(String(e?.message || e))
      } finally { setBusy(false) }
    })()
  }, [])

  function canAdd(p: Player): { ok: boolean; reason?: string } {
    if (team.find(t => String(t.id) === String(p.id))) return { ok:false, reason:'Already in squad' }
    // position limits from rules
    const counts = team.reduce((acc, t) => (acc[t.pos]=(acc[t.pos]||0)+1, acc), {} as Record<Player['pos'], number>)
    const maxByPos: Record<Player['pos'], number> = { GK: rules.gk, DEF: rules.def, MID: rules.mid, FWD: rules.fwd }
    if ((counts[p.pos] || 0) >= (maxByPos[p.pos] || 0)) return { ok:false, reason:`Max ${p.pos}s reached` }
    // total size
    if (team.length >= rules.players) return { ok:false, reason:'Squad full' }
    // budget
    if (budget < p.price) return { ok:false, reason:'Insufficient budget' }
    return { ok:true }
  }

  function add(p: Player) {
    if (locked) { alert('Transfers are locked for Weekly contests.'); return }
    const c = canAdd(p)
    if (!c.ok) { alert(c.reason); return }
    setTeam([...team, p])
    setBudget(budget - p.price)
  }

  function remove(id: Player['id']) {
    if (locked) { alert('Transfers are locked for Weekly contests.'); return }
    const idx = team.findIndex(t => String(t.id) === String(id))
    if (idx === -1) return
    const pl = team[idx]
    const next = [...team.slice(0, idx), ...team.slice(idx+1)]
    setTeam(next)
    setBudget(budget + (pl.price || 0))
  }

  const filtered = pool.filter(p => {
    if (q && !(`${p.name} ${p.club}`.toLowerCase().includes(q.toLowerCase()))) return false
    if (pos !== 'ALL' && p.pos !== pos) return false
    if (club !== 'ALL' && p.club !== club) return false
    return true
  })

  const counts = team.reduce((acc, t) => (acc[t.pos]=(acc[t.pos]||0)+1, acc), {} as Record<Player['pos'], number>)

  return (
    <div className="screen">
      <style>{css}</style>

      <TopBar title="Transfers" onBack={onBack} rightSlot={
        <div className="balance-chip" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)'}}>
          £{budget.toFixed(1)}m
        </div>
      } />

      <div className="container" style={{ paddingBottom: 110 }}>
        <div className="banner" style={{margin:'8px 0 12px', border:'1px solid rgba(255,255,255,0.12)'}}>
          <div>
            <div style={{fontWeight:900}}>Realm: {String(realm).toUpperCase()}</div>
            <div className="subtle">
              {locked
                ? 'Transfers are locked in Weekly contests.'
                : 'You can add/remove players before the gameweek deadline.'}
            </div>
          </div>
        </div>

        {/* Squad summary */}
        <div className="card" style={{marginBottom:12, border:'1px solid rgba(255,255,255,0.12)'}}>
          <div className="row" style={{alignItems:'center', gap:12}}>
            <div>
              <div className="subtle">Squad Size</div>
              <div style={{fontWeight:900, fontSize:18}}>{team.length}/{rules.players}</div>
            </div>
            <div className="sep" />
            {(['GK','DEF','MID','FWD'] as const).map(k => (
              <div key={k} className="mini-kv">
                <div className="subtle">{k}</div>
                <div style={{fontWeight:900}}>{counts[k] || 0}/{(k==='GK'?rules.gk:k==='DEF'?rules.def:k==='MID'?rules.mid:rules.fwd)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="filters">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search players or clubs…" />
          <select value={pos} onChange={e=>setPos(e.target.value as any)}>
            <option value="ALL">All Positions</option>
            <option value="GK">GK</option>
            <option value="DEF">DEF</option>
            <option value="MID">MID</option>
            <option value="FWD">FWD</option>
          </select>
          <select value={club} onChange={e=>setClub(e.target.value)}>
            {clubs.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Squad list (removals) */}
        <div className="title-xl" style={{margin:'16px 0 8px'}}>Your Squad</div>
        {team.length === 0 ? (
          <div className="card subtle" style={{border:'1px solid rgba(255,255,255,0.12)'}}>No players yet.</div>
        ) : (
          <div className="grid">
            {team.map(p => (
              <div className="card pcard" key={p.id}>
                <div className="pc-title">
                  <span className={`pos ${String(p.pos).toLowerCase()}`}>{p.pos}</span>
                  <b>{p.name}</b>
                </div>
                <div className="pc-meta">
                  <span>{p.club}</span>
                  <span>£{Number(p.price).toFixed(1)}m</span>
                </div>
                <button className="btn-ghost danger" onClick={() => remove(p.id)} disabled={locked}>Remove</button>
              </div>
            ))}
          </div>
        )}

        {/* Transfer pool (additions) */}
        <div className="title-xl" style={{margin:'18px 0 8px'}}>Transfer Pool</div>
        {busy ? (
          <div className="card subtle">Loading players…</div>
        ) : err ? (
          <div className="card subtle">Error: {err}</div>
        ) : (
          <div className="grid">
            {filtered.slice(0, 240).map(p => {
              const can = canAdd(p)
              return (
                <div className="card pcard" key={p.id}>
                  <div className="pc-title">
                    <span className={`pos ${String(p.pos).toLowerCase()}`}>{p.pos}</span>
                    <b>{p.name}</b>
                  </div>
                  <div className="pc-meta">
                    <span>{p.club}</span>
                    <span>£{Number(p.price).toFixed(1)}m</span>
                  </div>
                  <button className="btn" disabled={!can.ok || locked} onClick={() => add(p)}>
                    {locked ? 'Locked' : can.ok ? 'Add' : can.reason}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const css = String.raw`
.filters { display:flex; gap:8px; align-items:center; margin: 10px 0 12px; }
.filters input, .filters select {
  background:#0f1624; color:#fff; border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:8px 10px; outline:none;
}
.grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px; }
@media (min-width: 720px) { .grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
.pcard { border:1px solid rgba(255,255,255,0.12); }
.pc-title { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.pos { font-size:11px; border-radius:6px; padding:2px 6px; border:1px solid rgba(255,255,255,0.16); }
.pos.gk { background:rgba(99,102,241,.16) }
.pos.def { background:rgba(16,185,129,.16) }
.pos.mid { background:rgba(59,130,246,.16) }
.pos.fwd { background:rgba(236,72,153,.16) }
.pc-meta { display:flex; justify-content:space-between; opacity:.85; margin:6px 0 10px; }
.btn { appearance:none; border:none; background:#111827; color:#fff; padding:8px 10px; border-radius:10px; font-weight:800; cursor:pointer; }
.btn-ghost { appearance:none; background:transparent; color:#fff; padding:8px 10px; border-radius:10px; font-weight:800; border:1px solid rgba(255,255,255,.15); cursor:pointer; }
.btn-ghost.danger { border-color: rgba(239,68,68,.35); color: #fecaca; }
.balance-chip { padding:6px 10px; border-radius: 10px; font-weight:800; }
.container { padding: 12px 14px; }
.card { background: rgba(255,255,255,0.04); border-radius: 14px; padding: 12px; }
.title-xl { font-weight:900; letter-spacing:.2px; }
.subtle { opacity:.75; }
.row { display:flex; gap:12px; }
.banner { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px; border-radius:14px; background:linear-gradient(135deg, rgba(99,102,241,0.14), rgba(236,72,153,0.14)); }
.sep { width:1px; height:22px; background: rgba(255,255,255,0.12); margin: 0 6px; }
`;
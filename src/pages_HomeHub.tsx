// src/pages_HomeHub.tsx
import { useEffect, useMemo, useState } from 'react'
import { useApp } from './state'
import TopBar from './components_TopBar'
import { fetchFixtures, fetchBootstrap, fetchElementSummary } from './api' // uses your Vercel /api routes

type Props = {
  onViewTeam?: () => void
  onCreateTeam?: () => void
  onJoinContest?: () => void
  onLeaderboard?: () => void
  onTransfers?: () => void
  onFixtures?: () => void
  onStats?: () => void
  onBack?: () => void
  onTop10?: () => void
}

type LbEntry = { name: string; points: number }

async function loadLeaderboardPreview(timeoutMs = 7000): Promise<LbEntry[] | null> {
  const ctrl = new AbortSignalController(timeoutMs)
  try {
    const r = await fetch('/leaderboard.json', { cache: 'no-store', signal: ctrl.signal })
    if (!r.ok) return null
    const arr = await r.json()
    return Array.isArray(arr) ? arr.slice(0, 3) : null
  } catch { return null }
  finally { ctrl.clear() }
}

class AbortSignalController {
  private controller = new AbortController()
  private timer: any
  constructor(ms: number) {
    this.timer = setTimeout(() => this.controller.abort('timeout'), ms)
  }
  get signal() { return this.controller.signal }
  clear() { clearTimeout(this.timer) }
}

function formatLocal(dtIso: string) {
  try {
    const d = new Date(dtIso)
    return d.toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch { return dtIso }
}

type NextFixtureView = { home: string; away: string; kickoff_utc: string }

async function loadNextFixtureFromFPL(): Promise<NextFixtureView | null> {
  const [fixtures, bootstrap] = await Promise.all([
    fetchFixtures(),        // /api/fpl/fixtures?future=1
    fetchBootstrap()        // /api/fpl/bootstrap-static
  ])

  const teamNameById = new Map<number, string>()
  if (bootstrap?.teams) {
    for (const t of bootstrap.teams) teamNameById.set(t.id, t.name)
  }

  const upcoming = (fixtures || [])
    .filter((f: any) => !!f.kickoff_time)
    .sort((a: any, b: any) =>
      new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
    )[0]

  if (!upcoming) return null

  const home = teamNameById.get(upcoming.team_h) || `Team ${upcoming.team_h}`
  const away = teamNameById.get(upcoming.team_a) || `Team ${upcoming.team_a}`

  return { home, away, kickoff_utc: upcoming.kickoff_time }
}

/* ===== Weekly points helpers ===== */
type FplEvent = { id: number; name: string; finished: boolean; data_checked: boolean }

function resolveLatestFinishedRound(events: FplEvent[]): { round: number | null; label: string } {
  if (!Array.isArray(events) || events.length === 0) return { round: null, label: '—' }
  const finished = events.filter(e => e.finished || e.data_checked)
  if (finished.length > 0) {
    const r = finished[finished.length - 1]
    return { round: r.id, label: r.name || `GW ${r.id}` }
  }
  return { round: events[0].id, label: events[0].name || `GW ${events[0].id}` }
}

async function sumWeeklyPointsForTeam(playerIds: (string|number)[], round: number): Promise<number> {
  const totals = await Promise.all(
    playerIds.map(async (id) => {
      try {
        const s = await fetchElementSummary(id)
        const row = Array.isArray(s?.history)
          ? s.history.find((h: any) => Number(h.round) === Number(round))
          : null
        const pts = Number(row?.total_points ?? 0)
        return Number.isFinite(pts) ? pts : 0
      } catch { return 0 }
    })
  )
  return totals.reduce((a, b) => a + b, 0)
}
/* ===== end helpers ===== */

export default function HomeHub({
  onViewTeam,
  onCreateTeam,
  onJoinContest,
  onLeaderboard,
  onTransfers,
  onFixtures,
  onStats,
  onBack,
  onTop10
}: Props) {
  const { fullName, budget, team } = useApp()
  const picked = team.length
  const progressPct = useMemo(() => Math.min(100, Math.round((picked / 15) * 100)), [picked])

  const [lb, setLb] = useState<LbEntry[] | null | 'error'>(null)
  const [fixture, setFixture] = useState<NextFixtureView | null | 'error'>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const [a, f] = await Promise.all([
        loadLeaderboardPreview().catch(() => 'error' as const),
        loadNextFixtureFromFPL().catch(() => 'error' as const)
      ])
      if (!mounted) return
      setLb(a === 'error' ? 'error' : a)
      setFixture(f === 'error' ? 'error' : f)
    })()
    return () => { mounted = false }
  }, [])

  // sensible fallbacks so your main.tsx can pass only onViewTeam
  const handleViewTeam   = onViewTeam ?? (() => alert('Open Team'))
  const handleCreateTeam = onCreateTeam ?? handleViewTeam
  const handleTransfers  = onTransfers ?? (() => alert('Transfers coming soon'))
  const handleFixtures   = onFixtures ?? (() => alert('Fixtures coming soon')) // ← navigates to Fixtures page
  const handleStats      = onStats ?? (() => alert('Stats coming soon'))
  const handleJoin       = onJoinContest ?? (() => alert('Join contest coming soon'))
  const handleLb         = onLeaderboard ?? (() => alert('Leaderboard coming soon'))
  const handleTop10      = onTop10 ?? (() => alert('Top 10 coming soon'))

  const primaryAction = picked < 15
    ? { label: `Pick ${15 - picked} more`, onClick: handleCreateTeam }
    : { label: 'View Team', onClick: handleViewTeam }

  const clubsInFixture = useMemo(() => {
    if (!fixture || fixture === 'error') return { count: 0, clubs: [] as string[] }
    const clubs = new Set([fixture.home, fixture.away])
    const count = team.filter(p => clubs.has(p.club)).length
    return { count, clubs: Array.from(clubs) }
  }, [fixture, team])

  /* === Weekly points state/effects === */
  const [loadingGW, setLoadingGW] = useState(true)
  const [round, setRound] = useState<number | null>(null)
  const [roundLabel, setRoundLabel] = useState<string>('—')
  const [weeklyPoints, setWeeklyPoints] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoadingGW(true)
        const data = await fetchBootstrap()
        const events: FplEvent[] = data?.events ?? []
        const { round: r, label } = resolveLatestFinishedRound(events)
        if (!mounted) return
        setRound(r)
        setRoundLabel(label)
      } finally {
        if (mounted) setLoadingGW(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!round) return
      setWeeklyPoints(null)
      try {
        const total = await sumWeeklyPointsForTeam(team.map(p => p.id), round)
        if (!mounted) return
        setWeeklyPoints(total)
      } catch {
        if (!mounted) return
        setWeeklyPoints(0)
      }
    })()
    return () => { mounted = false }
  }, [round, team])
  /* === end weekly points state/effects === */

  return (
    <div className="screen">
      <div className="container" style={{ paddingTop: 8, paddingBottom: 110 }}>
        <TopBar
          title="Home"
          onBack={onBack}
          rightSlot={
            <div className="balance-chip" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)'}}>
              £{budget.toFixed(1)}m
            </div>
          }
        />

        {/* Greeting */}
        <div style={{margin:'6px 0 10px'}}>
          <div style={{fontWeight:900,fontSize:20,letterSpacing:.2}}>Welcome</div>
          <div className="subtle">{fullName}</div>
        </div>

        {/* Squad status (polished) */}
        <div className="card" style={{
          marginBottom:14,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(59,130,246,0.12))'
        }}>
          <div className="row" style={{alignItems:'flex-start'}}>
            <div>
              <div style={{fontWeight:900, fontSize:18}}>Your Squad</div>
              <div className="subtle">{picked}/15 players selected</div>
              <div className="progress" style={{marginTop:10}}>
                <span style={{width: `${progressPct}%`}} />
              </div>
            </div>
            <button className="btn-ghost" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </button>
          </div>
          {picked > 0 && (
            <div className="mini-team">
              {team.slice(0,6).map(p => (
                <div key={p.id} className="mini-pill">
                  <span className="mini-dot" /> {p.name}
                </div>
              ))}
              {picked > 6 && <div className="mini-more">+{picked - 6} more</div>}
            </div>
          )}
        </div>

        {/* Next Fixture – via /api (polished) */}
        <div className="title-xl" style={{margin:'18px 0 8px'}}>Next Fixture</div>
        <div className="card" style={{ border: '1px solid rgba(255,255,255,0.12)'}}>
          {fixture === null && <div className="subtle">Loading next match…</div>}
          {fixture === 'error' && <div className="subtle">Couldn’t load fixtures. Check your /api setup.</div>}
          {fixture && fixture !== 'error' && (
            <div className="row" style={{alignItems:'flex-start', gap:16}}>
              <div>
                <div style={{fontWeight:900, fontSize:18}}>{fixture.home} vs {fixture.away}</div>
                <div className="subtle">{formatLocal(fixture.kickoff_utc)}</div>
                {clubsInFixture.count > 0 && (
                  <div className="chip" style={{marginTop:10}}>
                    {clubsInFixture.count} of your player{clubsInFixture.count === 1 ? '' : 's'} will play
                  </div>
                )}
              </div>
              {/* THIS BUTTON navigates to the dedicated Fixtures page */}
              <button className="btn-ghost" onClick={handleFixtures}>View fixtures</button>
            </div>
          )}
        </div>

        {/* Featured (polished) */}
        <div className="title-xl" style={{margin:'18px 0 12px'}}>Featured</div>
        <div className="hero" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(236,72,153,0.18))',
          border: '1px solid rgba(255,255,255,0.12)'
        }}>
          <div style={{fontSize:18,fontWeight:900,marginBottom:6}}>Premier League Weekly</div>
          <div className="subtle" style={{marginBottom:14}}>Set your XI and compete on the global leaderboard.</div>
          <div className="hero-tags">
            <span>Premier League</span><span>Weekly</span><span>Free to play</span>
          </div>
          <div style={{display:'flex',gap:10,marginTop:14}}>
            <button className="cta" onClick={handleJoin}>Enter</button>
            <button className="btn-ghost" onClick={handleTop10}>Leaderboard</button>
          </div>
        </div>

        {/* Weekly Points */}
        <div className="title-xl" style={{margin:'18px 0 12px'}}>Weekly Points</div>
        <div className="list">
          <div className="card" style={{ border: '1px solid rgba(255,255,255,0.12)'}}>
            <div className="row" style={{ alignItems: 'center' }}>
              <div>
                <div style={{fontWeight:800}}>This Week</div>
                <div className="subtle">
                  {loadingGW ? 'Resolving gameweek…' : `Gameweek: ${roundLabel}`}
                </div>
              </div>
              <div style={{marginLeft:'auto', fontWeight:900, fontSize:20}}>
                {weeklyPoints === null ? '…' : weeklyPoints}
              </div>
            </div>
          </div>
          <button className="btn-ghost" onClick={handleTop10}>See all</button>
        </div>

        {/* Finish squad banner */}
        {picked < 15 && (
          <div className="banner" style={{ border: '1px solid rgba(255,255,255,0.12)'}}>
            <div>
              <div style={{fontWeight:900}}>Finish your squad</div>
              <div className="subtle">You need {15 - picked} more player{15 - picked === 1 ? '' : 's'} to enter contests.</div>
            </div>
            <button className="btn-add" onClick={handleCreateTeam}>Complete Squad</button>
          </div>
        )}

        {/* Quick Actions */}
        <div className="title-xl" style={{margin:'18px 0 12px'}}>Quick Actions</div>
        <div className="qa-grid">
          <button className="qa-card qa-green" onClick={handleViewTeam}>
            <div className="qa-icon">👥</div>
            <div className="qa-text">
              <div className="qa-title">View Team</div>
              <div className="subtle">Your current XI</div>
            </div>
          </button>

          <button className="qa-card qa-blue" onClick={handleTransfers}>
            <div className="qa-icon">🔁</div>
            <div className="qa-text">
              <div className="qa-title">Transfers</div>
              <div className="subtle">Swap players weekly</div>
            </div>
          </button>

          <button className="qa-card qa-purple" onClick={handleFixtures}>
            <div className="qa-icon">📅</div>
            <div className="qa-text">
              <div className="qa-title">Fixtures</div>
              <div className="subtle">This week’s matches</div>
            </div>
          </button>

          <button className="qa-card qa-orange" onClick={handleStats}>
            <div className="qa-icon">📊</div>
            <div className="qa-text">
              <div className="qa-title">Stats</div>
              <div className="subtle">Form & price</div>
            </div>
          </button>
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="tabbar">
        <button className="tab active"><span>Home</span></button>
        <button className="tab" onClick={handleJoin}><span>Leagues</span></button>
        <button className="tab" onClick={handleLb}><span>Live</span></button>
        <button className="tab" onClick={handleViewTeam}><span>Profile</span></button>
      </nav>
    </div>
  )
}

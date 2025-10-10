// src/pages_HomeHub.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from './state'
import TopBar from './components_TopBar'
import MenuDrawer from './components/menu-drawer'
import {
  fetchFixtures,
  fetchBootstrap,
  fetchElementSummary,
  listContests,
  joinContest,
  startPaidJoin,
  verifyPaidJoin,
  type Contest,
} from './api'
import JoinContestBar from './components_JoinContestBar'

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
  onHowToPlay?: () => void
  onAboutUs?: () => void
  onContactUs?: () => void
  isAdmin?: boolean
  onAdmin?: () => void
  onHistory?: () => void
  onProfile?: () => void
}

type LbEntry = { name: string; points: number }

class AbortSignalController {
  private controller = new AbortController()
  private timer: any
  constructor(ms: number) { this.timer = setTimeout(() => this.controller.abort('timeout'), ms) }
  get signal() { return this.controller.signal }
  clear() { clearTimeout(this.timer) }
}

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

function formatLocal(dtIso: string) {
  try {
    const d = new Date(dtIso)
    return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return dtIso }
}

/* ============================
   FIXTURE CAROUSEL (GW-aware)
   ============================ */
type FixtureView = { id: string; home: string; away: string; kickoff_utc: string }

async function loadGameweekFixtures(): Promise<FixtureView[]> {
  const [fixtures, bootstrap] = await Promise.all([ fetchFixtures(), fetchBootstrap() ])

  // Build team names map
  const teamNameById = new Map<number, string>()
  if (bootstrap?.teams) for (const t of bootstrap.teams) teamNameById.set(t.id, t.name)

  // Pick the next/current event by FPL "events" (gameweeks)
  const events = Array.isArray(bootstrap?.events) ? bootstrap.events : []
  const now = Date.now()
  const upcoming = events.find((e: any) => !e.finished && !e.data_checked) || events.find((e: any) => !e.finished) || events[0]
  const targetEventId = upcoming?.id

  // If we have an event id, filter fixtures by event; else fallback to next 8 calendar fixtures
  let fx: any[] = []
  if (targetEventId) {
    fx = (fixtures || []).filter((f: any) => Number(f.event) === Number(targetEventId))
  } else {
    fx = (fixtures || [])
      .filter((f: any) => !!f.kickoff_time)
      .sort((a: any, b: any) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
      .slice(0, 8)
  }

  // Final map
  return fx.map((f: any, idx: number) => ({
    id: `gwfx-${idx}-${f.id ?? Math.random()}`,
    home: teamNameById.get(f.team_h) || `Team ${f.team_h}`,
    away: teamNameById.get(f.team_a) || `Team ${f.team_a}`,
    kickoff_utc: f.kickoff_time || f.kickoff_utc || '',
  }))
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
        const row = Array.isArray(s?.history) ? s.history.find((h: any) => Number(h.round) === Number(round)) : null
        const pts = Number(row?.total_points ?? 0)
        return Number.isFinite(pts) ? pts : 0
      } catch { return 0 }
    })
  )
  return totals.reduce((a, b) => a + b, 0)
}

/* ===== Paid join helper (manual signature paste) ===== */
async function doPaidJoinFlow(contest: Contest) {
  const { to, amountLamports, memo } = await startPaidJoin(contest.id)
  const sol = (amountLamports / 1_000_000_000).toFixed(6)

  alert(
    `Paid contest: ${contest.title}\n\n` +
    `1) In Phantom, SEND ${sol} SOL to:\n${to}\n\n` +
    (memo ? `Include Memo:\n${memo}\n\n` : '') +
    `2) After sending, copy the transaction signature and paste it next.`
  )

  const signature = window.prompt('Paste your Solana transaction signature:')
  if (!signature) throw new Error('Signature required to verify join')
  return verifyPaidJoin(contest.id, signature.trim())
}

export default function HomeHub({
  onViewTeam, onCreateTeam, onJoinContest, onLeaderboard, onTransfers, onFixtures, onStats, onBack, onTop10,
  onHowToPlay, onAboutUs, onContactUs, isAdmin, onAdmin, onHistory, onProfile
}: Props) {
  const { fullName, budget, team, realm, setRealm, rules } = useApp()
  const picked = team.length
  const totalNeeded = rules.players
  const progressPct = useMemo(() => Math.min(100, Math.round((picked / totalNeeded) * 100)), [picked, totalNeeded])

  const [lb, setLb] = useState<LbEntry[] | null | 'error'>(null)

  // === Fixture Carousel state ===
  const [fixtures, setFixtures] = useState<FixtureView[] | 'error' | null>(null)
  const [fxIdx, setFxIdx] = useState(0)
  const fxTimerRef = useRef<number | null>(null)
  const fxWrapRef = useRef<HTMLDivElement | null>(null)

  const [menuOpen, setMenuOpen] = useState(false)

  // contests snapshot
  const [contests, setContests] = useState<Contest[]>([])
  const [activeContest, setActiveContest] = useState<Contest | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const [a, f] = await Promise.all([
        loadLeaderboardPreview().catch(() => 'error' as const),
        loadGameweekFixtures().catch(() => 'error' as const),
      ])
      if (!mounted) return
      setLb(a === 'error' ? 'error' : a)
      setFixtures(f === 'error' ? 'error' : (f.length ? f : 'error')) // ensure not null
      setFxIdx(0)
    })()
    return () => { mounted = false }
  }, [])

  // auto-advance fixtures every 4 seconds
  useEffect(() => {
    if (!Array.isArray(fixtures) || fixtures.length <= 1) return
    const tick = () => setFxIdx(i => (i + 1) % fixtures.length)
    fxTimerRef.current = window.setInterval(tick, 4000) as unknown as number
    return () => { if (fxTimerRef.current) window.clearInterval(fxTimerRef.current) }
  }, [fixtures])

  // touch swipe
  useEffect(() => {
    const el = fxWrapRef.current
    if (!el || !Array.isArray(fixtures) || fixtures.length <= 1) return
    let startX = 0, dx = 0, active = false

    const onDown = (e: TouchEvent | MouseEvent) => {
      active = true
      startX = ('touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX)
      dx = 0
    }
    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!active) return
      const x = ('touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX)
      dx = x - startX
    }
    const onUp = () => {
      if (!active) return
      active = false
      if (Math.abs(dx) > 40 && Array.isArray(fixtures) && fixtures.length > 1) {
        setFxIdx(i => (dx < 0 ? (i + 1) % fixtures.length : (i - 1 + fixtures.length) % fixtures.length))
      }
      dx = 0
    }

    el.addEventListener('mousedown', onDown); el.addEventListener('mousemove', onMove); el.addEventListener('mouseup', onUp)
    el.addEventListener('touchstart', onDown, { passive: true }); el.addEventListener('touchmove', onMove, { passive: true }); el.addEventListener('touchend', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown); el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseup', onUp)
      el.removeEventListener('touchstart', onDown); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onUp)
    }
  }, [fixtures])

  // load contests (admin list)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await listContests()
        if (!mounted) return
        setContests(res.contests)
        const active = res.contests.filter(c => c.active)
        const pick = active.find(c => c.realm === 'WEEKLY') || active[0] || res.contests[0] || null
        setActiveContest(pick || null)
      } catch {}
    })()
    return () => { mounted = false }
  }, [])

  const handleViewTeam   = onViewTeam ?? (() => onProfile?.())
  const handleCreateTeam = onCreateTeam ?? (() => onProfile?.())
  const handleTransfers  = onTransfers ?? (() => onProfile?.())
  const handleFixtures   = onFixtures ?? (() => {})
  const handleStats      = onStats ?? (() => {})
  const handleLb         = onLeaderboard ?? (() => {})
  const handleTop10      = onTop10 ?? (() => {})
  const goHowToPlay      = onHowToPlay ?? (() => {})
  const goAboutUs        = onAboutUs   ?? (() => {})
  const goContact        = onContactUs ?? (() => {})
  const goAdmin          = onAdmin     ?? (() => {})
  const goHistory        = onHistory   ?? (() => {})
  const goProfile        = onProfile   ?? (() => {})

  const primaryAction = picked < totalNeeded
    ? { label: `Pick ${totalNeeded - picked} more`, onClick: handleCreateTeam }
    : { label: 'View Team', onClick: handleViewTeam }

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
        const events = data?.events ?? []
        const { round: r, label } = resolveLatestFinishedRound(events)
        if (!mounted) return
        setRound(r); setRoundLabel(label)
      } finally { if (mounted) setLoadingGW(false) }
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

  // ===== Unified Join handler (FREE or PAID) =====
  async function handleJoinUnified() {
    try {
      if (onJoinContest) return onJoinContest()
      if (!activeContest) return alert('No contest available yet.')
      if (picked < totalNeeded) return alert(`Finish your squad first — you need ${totalNeeded - picked} more player${totalNeeded - picked === 1 ? '' : 's'}.`)
      if (activeContest.entryFee > 0) {
        const { created } = await doPaidJoinFlow(activeContest)
        alert(created ? 'Joined paid contest!' : 'Already joined this contest.')
      } else {
        const { created } = await joinContest(activeContest.id, { picks: team.map(p => ({ elementId: Number(p.id) })) })
        alert(created ? 'Joined free contest!' : 'You already joined this contest.')
      }
    } catch (e: any) {
      alert(String(e?.message || e))
    }
  }

  // manual prev/next (helps verify carousel renders)
  const prevFx = () => { if (Array.isArray(fixtures) && fixtures.length>1) setFxIdx(i => (i - 1 + fixtures.length) % fixtures.length) }
  const nextFx = () => { if (Array.isArray(fixtures) && fixtures.length>1) setFxIdx(i => (i + 1) % fixtures.length) }

  return (
    <div className="screen">
      <style>{styles}</style>

      <div className="container" style={{ paddingTop: 8, paddingBottom: 110 }}>
        <TopBar
          title="Home"
          onBack={onBack}
          leftSlot={
            <button className="hamburger-btn" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
              <div className="hamburger-lines"><div /><div /><div /></div>
            </button>
          }
          rightSlot={
            <div className="balance-chip" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)'}}>
              £{budget.toFixed(1)}m
            </div>
          }
        />

        {realm !== 'free' && (
          <div className="banner" style={{ margin: '8px 0 12px', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div>
              <div style={{fontWeight:900}}>You’re in {realm.toUpperCase()} contest</div>
              <div className="subtle">Tap below to go back to the free global hub/leaderboard.</div>
            </div>
            <button className="btn-add" onClick={() => setRealm('free')}>Go to Free Contest</button>
          </div>
        )}

        <div style={{margin:'6px 0 10px'}}>
          <div style={{fontWeight:900,fontSize:20,letterSpacing:.2}}>Welcome</div>
          <div className="subtle">{fullName}</div>
        </div>

        {realm === 'free' && (
          <div style={{ margin: '10px 0 14px' }}>
            <JoinContestBar onClick={handleJoinUnified} />
          </div>
        )}

        {/* ====== FIXTURE CAROUSEL ====== */}
        <div className="title-xl" style={{margin:'18px 0 8px'}}>This Week’s Fixtures</div>
        <div className="carousel" ref={fxWrapRef}>
          {fixtures === 'error' && (
            <div className="subtle" style={{padding:12}}>Couldn’t load fixtures (or no upcoming GW fixtures). Try again later.</div>
          )}
          {Array.isArray(fixtures) && fixtures.length > 0 && (
            <>
              <button className="nav prev" aria-label="Previous" onClick={prevFx}>‹</button>
              <button className="nav next" aria-label="Next" onClick={nextFx}>›</button>

              <div className="track" style={{ transform: `translateX(-${fxIdx * 100}%)` }}>
                {fixtures.map((f) => (
                  <div className="slide" key={f.id}>
                    <div className="card fx-card">
                      <div className="row" style={{alignItems:'flex-start', gap:16}}>
                        <div>
                          <div style={{fontWeight:900, fontSize:18}}>{f.home} vs {f.away}</div>
                          <div className="subtle">{formatLocal(f.kickoff_utc)}</div>
                        </div>
                        <button className="btn-ghost" onClick={onFixtures}>View</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="dots">
                {fixtures.map((_, i) => (
                  <button
                    key={i}
                    className={`dot ${i === fxIdx ? 'active' : ''}`}
                    onClick={() => setFxIdx(i)}
                    aria-label={`Go to slide ${i+1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="title-xl" style={{margin:'18px 0 12px'}}>Featured</div>
        <div className="hero" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(236,72,153,0.18))',
          border: '1px solid rgba(255,255,255,0.12)'}}
        >
          <div style={{fontSize:18,fontWeight:900,marginBottom:6}}>Premier League Weekly</div>
          <div className="subtle" style={{marginBottom:14}}>
            Set your XI and compete on the {realm === 'free' ? 'free global' : realm} leaderboard.
          </div>
          <div className="hero-tags"><span>Premier League</span><span>Weekly</span><span>{realm === 'free' ? 'Free to play' : 'Contest realm'}</span></div>
          <div style={{display:'flex',gap:10,marginTop:14}}>
            <button className="cta" onClick={handleJoinUnified}>Enter</button>
            <button className="btn-ghost" onClick={handleLb}>Leaderboard</button>
          </div>
        </div>

        <div className="title-xl" style={{margin:'18px 0 12px'}}>Weekly Points</div>
        <div className="list">
          <div className="card" style={{ border: '1px solid rgba(255,255,255,0.12)'}}>
            <div className="row" style={{ alignItems: 'center' }}>
              <div>
                <div className="subtle">
                  {loadingGW ? 'Resolving gameweek…' : `Gameweek: ${roundLabel}`}
                </div>
                <div style={{fontWeight:800}}>This Week</div>
              </div>
              <div style={{marginLeft:'auto', fontWeight:900, fontSize:20}}>
                {weeklyPoints === null ? '…' : weeklyPoints}
              </div>
            </div>
          </div>
          <button className="btn-ghost" onClick={goHistory}>See history</button>
        </div>

        {picked < totalNeeded && (
          <div className="banner" style={{ border: '1px solid rgba(255,255,255,0.12)'}}>
            <div>
              <div className="subtle">Finish your squad to enter contests.</div>
              <div style={{fontWeight:900}}>You need {totalNeeded - picked} more player{totalNeeded - picked === 1 ? '' : 's'}.</div>
            </div>
            <button className="btn-add" onClick={handleCreateTeam}>Complete Squad</button>
          </div>
        )}

        <div className="title-xl" style={{margin:'18px 0 12px'}}>Quick Actions</div>
        <div className="qa-grid">
          <button className="qa-card qa-green" onClick={handleViewTeam}>
            <div className="qa-icon">👥</div>
            <div className="qa-text">
              <div className="qa-title">View Team</div>
              <div className="subtle">Your current XI</div>
            </div>
          </button>

          <button className="qa-card qa-blue" onClick={onTransfers}>
            <div className="qa-icon">🔁</div>
            <div className="qa-text">
              <div className="qa-title">Transfers</div>
              <div className="subtle">Swap players weekly</div>
            </div>
          </button>

          <button className="qa-card qa-purple" onClick={onFixtures}>
            <div className="qa-icon">📅</div>
            <div className="qa-text">
              <div className="qa-title">Fixtures</div>
              <div className="subtle">This week’s matches</div>
            </div>
          </button>

          <button className="qa-card qa-orange" onClick={onStats}>
            <div className="qa-icon">📊</div>
            <div className="qa-text">
              <div className="qa-title">Stats</div>
              <div className="subtle">Form & price</div>
            </div>
          </button>

          {isAdmin ? (
            <button className="qa-card" onClick={goAdmin} style={{border:'1px solid rgba(255,255,255,0.18)'}}>
              <div className="qa-icon">🛡️</div>
              <div className="qa-text">
                <div className="qa-title">Admin</div>
                <div className="subtle">Manage users & contests</div>
              </div>
            </button>
          ) : null}
        </div>
      </div>

      <nav className="tabbar">
        <button className="tab active"><span>Home</span></button>
        <button className="tab" onClick={handleJoinUnified}><span>Leagues</span></button>
        <button className="tab" onClick={goHistory}><span>History</span></button>
        <button className="tab" onClick={goProfile}><span>Profile</span></button>
      </nav>

      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onHome={() => { onBack?.(); setMenuOpen(false) }}
        onHowToPlay={() => { goHowToPlay(); setMenuOpen(false) }}
        onContact={() => { goContact(); setMenuOpen(false) }}
        onAbout={() => { goAboutUs(); setMenuOpen(false) }}
      />
    </div>
  )
}

const styles = String.raw`
.carousel { position: relative; overflow: hidden; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); }
.track { display: flex; transition: transform .5s cubic-bezier(.2,.8,.2,1); width: 100%; }
.slide { min-width: 100%; }
.fx-card { background: linear-gradient(135deg, rgba(168,85,247,0.12), rgba(59,130,246,0.12)); }
.dots { position:absolute; left:0; right:0; bottom:8px; display:flex; gap:6px; justify-content:center; }
.dot { width:8px; height:8px; border-radius:999px; background:rgba(255,255,255,0.5); border:none; cursor:pointer; }
.dot.active { background:#fff; }
.nav { position:absolute; top:50%; transform: translateY(-50%); background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.25); color:#fff; width:32px; height:32px; border-radius: 999px; cursor:pointer; }
.nav.prev { left:8px; }
.nav.next { right:8px; }

.container { padding: 12px 14px; }
.card { background: rgba(255,255,255,0.04); border-radius: 14px; padding: 12px; }
.title-xl { font-weight:900; letter-spacing:.2px; }
.subtle { opacity:.75; }
.row { display:flex; gap:12px; }
.banner { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px; border-radius:14px; background:linear-gradient(135deg, rgba(99,102,241,0.14), rgba(236,72,153,0.14)); }
.balance-chip { padding:6px 10px; border-radius: 10px; font-weight:800; }
.qa-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px; }
.qa-card { background: rgba(255,255,255,0.04); border-radius: 14px; padding: 12px; display:flex; gap:10px; align-items:center; border:1px solid rgba(255,255,255,0.12);}
.qa-icon { font-size:18px; }
.qa-title { font-weight:900; }
.btn-ghost { appearance:none; background:transparent; color:#fff; padding:8px 10px; border-radius:10px; font-weight:800; border:1px solid rgba(255,255,255,.15); cursor:pointer; }
.btn-add { appearance:none; border:none; background:#111827; color:#fff; padding:8px 10px; border-radius:10px; font-weight:800; cursor:pointer; }
.cta { appearance:none; border:none; background:#111827; color:#fff; padding:10px 12px; border-radius:12px; font-weight:900; cursor:pointer; }
.hero { border-radius: 16px; padding: 14px; }
.tabbar { position: fixed; left:0; right:0; bottom:0; height: 64px; background: rgba(0,0,0,.6); border-top: 1px solid rgba(255,255,255,.12); display:flex; }
.tab { flex:1; background:transparent; border:none; color:#fff; font-weight:800; }
.tab span { opacity:.9 }
.hamburger-btn { background:transparent; border:none; cursor:pointer; }
.hamburger-lines { display:grid; gap:3px; }
.hamburger-lines div { width:18px; height:2px; background:#fff; }
`;

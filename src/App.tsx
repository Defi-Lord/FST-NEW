import React, { useEffect, useRef, useState } from 'react'
import SignInWithWallet from './components/SignInWithWallet'

/** If you have these pages already, keep them.
 *  You can replace these placeholders with your actual imports. */
import Landing from './pages_Landing'
import HomeHub from './pages_HomeHub'
import ContestTypes from './pages_ContestTypes'
import TeamSelection from './pages_TeamSelection'
import JoinContest from './pages_JoinContest'
import CreateTeam from './pages_CreateTeam'
import Leaderboard from './pages_Leaderboard'
import Rewards from './pages_Rewards'
import ViewTeam from './pages_ViewTeam'
import Top10 from './pages_Top10'
import Fixtures from './pages_Fixtures'
import Stats from './pages_Stats'
import HowToPlay from './pages_HowToPlay'
import AboutUs from './pages_AboutUs'
import ContactUs from './pages_ContactUs'
import AdminPage from './pages_Admin'
import HistoryPage from './pages_History'
import Transfers from './pages_Transfers'
import Profile from './pages_Profile'

type Route =
  | 'landing' | 'connect' | 'home' | 'contestTypes' | 'teamSelect' | 'joinContest'
  | 'create' | 'leaderboard' | 'rewards' | 'viewteam' | 'top10' | 'fixtures'
  | 'stats' | 'howToPlay' | 'about' | 'contact' | 'admin'
  | 'history' | 'transfers' | 'profile'

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  'https://fst-api.onrender.com'

const getToken = () => {
  try { return localStorage.getItem('auth_token') || '' } catch { return '' }
}

function getTG() { return (window as any)?.Telegram?.WebApp }
function supports(min: string) {
  try { return getTG()?.isVersionAtLeast?.(min) === true } catch { return false }
}

export default function App() {
  const [route, setRoute] = useState<Route>('landing')
  const stackRef = useRef<Route[]>(['landing'])
  const [authed, setAuthed] = useState<boolean>(!!getToken())
  const [isAdmin, setIsAdmin] = useState(false)
  const [address, setAddress] = useState<string>('')

  useEffect(() => {
    const tg = getTG()
    try {
      tg?.ready?.()
      tg?.expand?.()
      if (supports('6.1')) {
        tg.setHeaderColor?.('secondary_bg_color')
        tg.setBackgroundColor?.('#0b0c10')
      }
    } catch {}
  }, [])

  useEffect(() => {
    const tg = getTG()
    const showBack = !['landing', 'home'].includes(route)
    if (!supports('6.1')) return
    try { showBack ? tg?.BackButton?.show?.() : tg?.BackButton?.hide?.() } catch {}
  }, [route])

  useEffect(() => {
    const tg = getTG()
    if (!supports('6.1')) return
    const onBack = () => {
      const s = stackRef.current
      if (s.length > 1) {
        s.pop()
        setRoute(s[s.length - 1])
      }
    }
    try {
      tg?.BackButton?.onClick?.(onBack)
      return () => tg?.BackButton?.offClick?.(onBack)
    } catch { return }
  }, [])

  const go = (next: Route) => {
    const s = stackRef.current
    s.push(next); setRoute(next)
  }
  const back = () => {
    const s = stackRef.current
    if (s.length > 1) { s.pop(); setRoute(s[s.length - 1]) }
  }

  // token -> check admin flag (optional; you can remove)
  useEffect(() => {
    const token = getToken()
    if (!token) { setIsAdmin(false); return }
    ;(async () => {
      try {
        const r = await fetch(`${API_BASE}/auth/introspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          credentials: 'include'
        })
        if (r.ok) {
          const j = await r.json().catch(() => null)
          setIsAdmin(String(j?.payload?.role || '').toUpperCase() === 'ADMIN')
        } else {
          setIsAdmin(false)
        }
      } catch { setIsAdmin(false) }
    })()
  }, [authed])

  const handleSignedIn = (addr: string) => {
    setAddress(addr)
    setAuthed(true)
    go('home')
  }

  const onLaunch = () => {
    if (getToken()) { go('home'); return }
    go('connect')
  }

  const onContestJoined = () => { go('teamSelect') }
  const handleAdminNav = () => { if (!isAdmin) return alert('Admin only'); go('admin') }

  return (
    <>
      {route === 'landing' && <Landing onLaunch={onLaunch} />}

      {route === 'connect' && (
        <SignInWithWallet onSignedIn={handleSignedIn} />
      )}

      {route === 'home' && (
        <HomeHub
          onViewTeam={() => go('viewteam')}
          onCreateTeam={() => go('create')}
          onJoinContest={() => go('contestTypes')}
          onLeaderboard={() => go('leaderboard')}
          onTop10={() => go('top10')}
          onTransfers={() => go('transfers')}
          onFixtures={() => go('fixtures')}
          onStats={() => go('stats')}
          onBack={back}
          onHowToPlay={() => go('howToPlay')}
          onAboutUs={() => go('about')}
          onContactUs={() => go('contact')}
          isAdmin={isAdmin}
          onAdmin={handleAdminNav}
          onHistory={() => go('history')}
          onProfile={() => go('profile')}
        />
      )}

      {route === 'contestTypes' && <ContestTypes onBack={back} onJoined={onContestJoined} />}
      {route === 'teamSelect' && <TeamSelection onBack={back} onNext={() => go('leaderboard')} />}
      {route === 'joinContest' && <JoinContest onSelect={() => go('create')} onBack={back} />}
      {route === 'create' && <CreateTeam onNext={() => go('leaderboard')} onBack={back} />}
      {route === 'leaderboard' && <Leaderboard onNext={() => go('rewards')} onBack={back} />}
      {route === 'rewards' && <Rewards onClaim={() => go('home')} />}
      {route === 'viewteam' && <ViewTeam onBack={back} />}
      {route === 'top10' && <Top10 onBack={back} />}
      {route === 'fixtures' && <Fixtures onBack={back} />}
      {route === 'stats' && <Stats onBack={back} />}
      {route === 'howToPlay' && <HowToPlay onBack={back} />}
      {route === 'about' && <AboutUs onBack={back} />}
      {route === 'contact' && <ContactUs onBack={back} />}
      {route === 'admin' && <AdminPage onBack={back} />}
      {route === 'history' && <HistoryPage onBack={back} />}
      {route === 'transfers' && <Transfers onBack={back} />}
      {route === 'profile' && <Profile onBack={back} />}
    </>
  )
}

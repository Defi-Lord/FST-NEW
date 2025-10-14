// src/App.tsx
import React, { useEffect, useRef, useState } from 'react'
import { useApp, type ContestRealm } from './state'

import Landing from './pages_Landing'
// import ConnectWallet from './pages_ConnectWallet'
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
import SignInWithWallet from './components/SignInWithWallet'
import HistoryPage from './pages_History'
import Transfers from './pages_Transfers'
import Profile from './pages_Profile'

import { useWallet } from '@solana/wallet-adapter-react'
import './styles/menu-drawer.css'

type Route =
  | 'landing' | 'connect' | 'home' | 'contestTypes' | 'teamSelect' | 'joinContest'
  | 'create' | 'leaderboard' | 'rewards' | 'viewteam' | 'top10' | 'fixtures'
  | 'stats' | 'howToPlay' | 'about' | 'contact' | 'admin'
  | 'history' | 'transfers' | 'profile'

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  // Fallback to your hosted API so prod builds “just work”.
  'https://fst-api.onrender.com'

const getToken = () => {
  try { return localStorage.getItem('auth_token') || '' } catch { return '' }
}

function getTG() {
  return (window as any)?.Telegram?.WebApp
}

function supports(min: string) {
  try { return getTG()?.isVersionAtLeast?.(min) === true } catch { return false }
}

export default function App() {
  const [route, setRoute] = useState<Route>('landing')
  const stackRef = useRef<Route[]>(['landing'])
  const { setRealm, setWalletAddress } = useApp()
  const wallet = useWallet()
  const [authed, setAuthed] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  // Initialize Telegram WebApp UI
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

  // Toggle/show back button depending on route
  useEffect(() => {
    const tg = getTG()
    const showBack = !['landing', 'home'].includes(route)
    if (!supports('6.1')) return
    try {
      showBack ? tg?.BackButton?.show?.() : tg?.BackButton?.hide?.()
    } catch {}
  }, [route])

  // Handle Telegram back presses using our manual stack
  useEffect(() => {
    const tg = getTG()
    if (!supports('6.1')) return

    const onBack = () => {
      const stack = stackRef.current
      if (stack.length > 1) {
        stack.pop()
        setRoute(stack[stack.length - 1])
      }
    }

    try {
      tg?.BackButton?.onClick?.(onBack)
      return () => tg?.BackButton?.offClick?.(onBack)
    } catch {
      return
    }
  }, [])

  const go = (next: Route) => {
    const stack = stackRef.current
    stack.push(next)
    setRoute(next)
  }

  const back = () => {
    const stack = stackRef.current
    if (stack.length > 1) {
      stack.pop()
      setRoute(stack[stack.length - 1])
    }
  }

  const handleConnected = (addr: string) => {
    try { localStorage.setItem('sol_wallet', addr) } catch {}
    setWalletAddress(addr)
    setRealm('free')
    go('home')
  }

  // If a token already exists (e.g., returned by SignInWithWallet), hydrate auth + admin
  useEffect(() => {
    (async () => {
      setAuthed(false)
      setIsAdmin(false)
      const addr = wallet?.publicKey?.toBase58() || ''
      const token = getToken()
      if (!token) return

      // Resolve /me with Authorization header
      try {
        const me = await fetch(`${API_BASE}/me`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        })
        if (me.ok) {
          const j = await me.json().catch(() => null)
          const effectiveAddr = j?.user?.id || addr || ''
          if (effectiveAddr) handleConnected(effectiveAddr)
          setAuthed(true)
        }
      } catch {}

      // Check admin role from token
      try {
        const r = await fetch(`${API_BASE}/auth/introspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          credentials: 'include',
        })
        if (r.ok) {
          const j = await r.json()
          setIsAdmin(String(j?.payload?.role || '').toUpperCase() === 'ADMIN')
        } else {
          setIsAdmin(false)
        }
      } catch { setIsAdmin(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected, wallet.publicKey?.toBase58()])

  // If a token shows up later, re-run a lightweight “me” to hydrate the address
  useEffect(() => {
    const i = setInterval(() => {
      if (!authed && getToken()) {
        setAuthed(true)
        ;(async () => {
          try {
            const token = getToken()
            const me = await fetch(`${API_BASE}/me`, {
              headers: { Authorization: `Bearer ${token}` },
              credentials: 'include',
            })
            if (me.ok) {
              const j = await me.json().catch(() => null)
              const addr = j?.user?.id
              if (addr) handleConnected(addr)
            }
          } catch {}
        })()
      }
    }, 800)
    return () => clearInterval(i)
  }, [authed])

  const onLaunch = () => {
    const token = getToken()
    if (token) {
      setRealm('free')
      go('home')
      return
    }
    go('connect')
  }

  const onContestJoined = (realm?: ContestRealm) => {
    const picked: ContestRealm = realm || 'weekly'
    setRealm(picked)
    go('teamSelect')
  }

  const handleAdminNav = () => {
    if (!isAdmin) {
      alert('Admin only')
      return
    }
    go('admin')
  }

  return (
    <>
      {route === 'landing' && <Landing onLaunch={onLaunch} />}

      {route === 'connect' && (
        <div style={{ display: 'grid', gap: 12, padding: 16 }}>
          <SignInWithWallet />
          <small>Tip: If you don’t see the wallet popup, click the Phantom icon in your browser toolbar.</small>
        </div>
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

      {route === 'contestTypes' && <ContestTypes onBack={back} onJoined={onContestJoined as any} />}
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

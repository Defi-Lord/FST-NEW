// src/main.tsx
import { Buffer } from 'buffer'
;(window as any).Buffer ??= Buffer

import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider, useApp, type ContestRealm } from './state'

import Landing from './pages_Landing'
// import ConnectWallet from './pages_ConnectWallet' // removed to avoid double popups
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
import Transfers from './pages_Transfers'      // ✅ NEW
import Profile from './pages_Profile'          // ✅ NEW
import './styles/menu-drawer.css'
import './polyfills';

import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import '@solana/wallet-adapter-react-ui/styles.css'

type Route =
  | 'landing' | 'connect' | 'home' | 'contestTypes' | 'teamSelect' | 'joinContest'
  | 'create' | 'leaderboard' | 'rewards' | 'viewteam' | 'top10' | 'fixtures'
  | 'stats' | 'howToPlay' | 'about' | 'contact' | 'admin'
  | 'history' | 'transfers' | 'profile'          // ✅ NEW

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:4000'
const SOLANA_RPC = (import.meta as any).env?.VITE_SOLANA_RPC || 'https://api.devnet.solana.com'

// unified token helpers
const getToken = () => { try { return localStorage.getItem('auth_token') || '' } catch { return '' } }

function AppInner() {
  const [route, setRoute] = useState<Route>('landing')
  const stackRef = useRef<Route[]>(['landing'])
  const { setRealm, setWalletAddress } = useApp()
  const wallet = useWallet()
  const [authed, setAuthed] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const getTG = () => (window as any)?.Telegram?.WebApp
  const supports = (min: string) => { try { return getTG()?.isVersionAtLeast?.(min) === true } catch { return false } }

  useEffect(() => {
    const tg = getTG()
    try {
      tg?.ready?.(); tg?.expand?.()
      if (supports('6.1')) { tg.setHeaderColor?.('secondary_bg_color'); tg.setBackgroundColor?.('#0b0c10') }
    } catch {}
  }, [])

  useEffect(() => {
    const tg = getTG()
    const showBack = !['landing','home'].includes(route)
    if (supports('6.1')) { try { showBack ? tg?.BackButton?.show?.() : tg?.BackButton?.hide?.() } catch {} }
  }, [route])

  useEffect(() => {
    const tg = getTG()
    if (!supports('6.1')) return
    const onBack = () => {
      const stack = stackRef.current
      if (stack.length > 1) { stack.pop(); setRoute(stack[stack.length - 1]) }
    }
    try {
      tg?.BackButton?.onClick?.(onBack)
      return () => tg?.BackButton?.offClick?.(onBack)
    } catch { return }
  }, [])

  const go = (next: Route) => { const stack = stackRef.current; stack.push(next); setRoute(next) }
  const back = () => { const stack = stackRef.current; if (stack.length > 1) { stack.pop(); setRoute(stack[stack.length - 1]) } }

  const handleConnected = (addr: string) => {
    try { localStorage.setItem('sol_wallet', addr) } catch {}
    setWalletAddress(addr); setRealm('free'); go('home')
  }

  // When wallet connection changes or a token is present, try to establish app auth.
  useEffect(() => {
    (async () => {
      setAuthed(false); setIsAdmin(false)
      const addr = wallet?.publicKey?.toBase58() || ''
      const token = getToken()
      if (!token) return

      // Resolve /me with Authorization header (required)
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

      // Determine admin from token (role in payload)
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

  // Also react if a token appears later (e.g., SignInWithWallet saved it)
  useEffect(() => {
    const i = setInterval(() => {
      if (!authed && getToken()) {
        // token just landed; re-run the effect by poking state
        setAuthed(true)
        // best-effort: fetch /me once to get address if we don't have it yet
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
    if (token) { setRealm('free'); go('home'); return }
    go('connect')
  }

  const onContestJoined = (realm?: ContestRealm) => {
    const picked: ContestRealm = realm || 'weekly'; setRealm(picked); go('teamSelect')
  }
  const handleAdminNav = () => { if (!isAdmin) { alert('Admin only'); return } go('admin') }

  return (
    <>
      {route === 'landing' && <Landing onLaunch={onLaunch} />}

      {route === 'connect' && (
        <div style={{ display: 'grid', gap: 12, padding: 16 }}>
          {/* We ONLY show one sign-in path to avoid double popups */}
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
          onTransfers={() => go('transfers')}     // ✅ now routes to Transfers page
          onFixtures={() => go('fixtures')}
          onStats={() => go('stats')}
          onBack={back}
          onHowToPlay={() => go('howToPlay')}
          onAboutUs={() => go('about')}
          onContactUs={() => go('contact')}
          isAdmin={isAdmin}
          onAdmin={handleAdminNav}
          onHistory={() => go('history')}         // ✅ History route
          onProfile={() => go('profile')}         // ✅ Profile tab -> Profile page
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
      {route === 'transfers' && <Transfers onBack={back} />}    {/* ✅ NEW */}
      {route === 'profile' && <Profile onBack={back} />}        {/* ✅ NEW */}
    </>
  )
}

const endpoint = SOLANA_RPC
const wallets = [new PhantomWalletAdapter()]

const root = createRoot(document.getElementById('root')!)
root.render(
  // Keep StrictMode off to avoid double effects/calls in dev
  <ConnectionProvider endpoint={endpoint}>
    <WalletProvider wallets={wallets} /* autoConnect={false} by default */>
      <WalletModalProvider>
        <AppProvider>
          <AppInner />
        </AppProvider>
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
)

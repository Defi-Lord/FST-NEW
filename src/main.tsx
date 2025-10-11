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
import Transfers from './pages_Transfers'
import Profile from './pages_Profile'
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
  | 'history' | 'transfers' | 'profile'

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:4000'
const SOLANA_RPC = (import.meta as any).env?.VITE_SOLANA_RPC || 'https://api.devnet.solana.com'

/** ---- token helpers (reads both keys) ---- */
const getToken = () => {
  try {
    return localStorage.getItem('auth_token') || localStorage.getItem('authToken') || ''
  } catch { return '' }
}
const setToken = (t: string) => {
  try {
    localStorage.setItem('auth_token', t)
    localStorage.setItem('authToken', t)
  } catch {}
}
const clearToken = () => {
  try {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('authToken')
  } catch {}
}

/** Try multiple /me endpoints (different backends) */
async function fetchMe(token: string) {
  if (!API_BASE) return null
  const headers = { Authorization: `Bearer ${token}` }
  const opts: RequestInit = { headers, credentials: 'include' }

  // try in order: /user/me → /auth/me → /me
  const paths = ['/user/me', '/auth/me', '/me']
  for (const p of paths) {
    try {
      const r = await fetch(`${API_BASE}${p}`, opts)
      if (r.ok) return await r.json().catch(() => null)
    } catch {}
  }
  return null
}

function AppInner() {
  const [route, setRoute] = useState<Route>('landing')
  const stackRef = useRef<Route[]>(['landing'])
  const { setRealm, setWalletAddress } = useApp()
  const wallet = useWallet()
  const [authed, setAuthed] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const getTG = () => (window as any)?.Telegram?.WebApp
  const supports = (min: string) => { try { return getTG()?.isVersionAtLeast?.(min) === true } catch { return false } }

  // Telegram init
  useEffect(() => {
    const tg = getTG()
    try {
      tg?.ready?.(); tg?.expand?.()
      if (supports('6.1')) { tg.setHeaderColor?.('secondary_bg_color'); tg.setBackgroundColor?.('#0b0c10') }
    } catch {}
  }, [])

  // Back button visibility
  useEffect(() => {
    const tg = getTG()
    const showBack = !['landing','home'].includes(route)
    if (supports('6.1')) { try { showBack ? tg?.BackButton?.show?.() : tg?.BackButton?.hide?.() } catch {} }
  }, [route])

  // Back button handler
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
  const replaceRoute = (next: Route) => { stackRef.current = [next]; setRoute(next) }

  const handleConnected = (addr: string) => {
    try { localStorage.setItem('sol_wallet', addr) } catch {}
    setWalletAddress(addr)
    setRealm('free')
    replaceRoute('home')
  }

  /** Establish app auth when wallet or token is present */
  const tryAuthFromToken = async () => {
    const token = getToken()
    if (!token) return false
    // Fetch profile
    const me = await fetchMe(token)
    if (me) {
      // pick an id/wallet-like field
      const addr = me?.user?.id || me?.wallet || me?.id || wallet?.publicKey?.toBase58() || ''
      if (addr) handleConnected(addr)
      setAuthed(true)
      // check admin claim if available
      try {
        const r = await fetch(`${API_BASE}/auth/introspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          credentials: 'include',
        })
        if (r.ok) {
          const j = await r.json().catch(() => null)
          setIsAdmin(String(j?.payload?.role || '').toUpperCase() === 'ADMIN')
        } else {
          setIsAdmin(false)
        }
      } catch { setIsAdmin(false) }
      return true
    }
    return false
  }

  // On wallet connect or change → attempt auth with any existing token
  useEffect(() => {
    (async () => {
      setAuthed(false); setIsAdmin(false)
      await tryAuthFromToken()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected, wallet.publicKey?.toBase58()])

  // React if the token appears later (SignInWithWallet sets localStorage)
  useEffect(() => {
    // 1) storage event (cross-tab / same-tab in some browsers on setItem)
    const onStorage = async (e: StorageEvent) => {
      if (!e.key) return
      if (e.key === 'auth_token' || e.key === 'authToken') {
        if (e.newValue) {
          await tryAuthFromToken()
        } else {
          clearToken()
          setAuthed(false)
        }
      }
    }
    window.addEventListener('storage', onStorage)

    // 2) lightweight poll as a fallback (same-tab setItem may not emit 'storage' in all browsers)
    let last = getToken()
    const id = window.setInterval(async () => {
      const cur = getToken()
      if (cur && cur !== last) {
        last = cur
        await tryAuthFromToken()
      }
    }, 700)

    return () => { window.removeEventListener('storage', onStorage); clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Landing CTA
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
          {/* Single sign-in surface to avoid multiple Phantom popups */}
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

const endpoint = SOLANA_RPC
const wallets = [new PhantomWalletAdapter()]

const root = createRoot(document.getElementById('root')!)
root.render(
  // Keep StrictMode off to avoid double effects/calls in dev
  <ConnectionProvider endpoint={endpoint}>
    <WalletProvider wallets={wallets}>
      <WalletModalProvider>
        <AppProvider>
          <AppInner />
        </AppProvider>
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
)

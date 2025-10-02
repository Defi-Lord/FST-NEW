// src/main.tsx
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './state'

import Landing from './pages_Landing'
import ConnectWallet from './pages_ConnectWallet'
import HomeHub from './pages_HomeHub'
import ContestTypes from './pages_ContestTypes'    // ⬅️ NEW flow entry for payments
import TeamSelection from './pages_TeamSelection'  // ⬅️ NEW post-payment builder

// Existing pages
import JoinContest from './pages_JoinContest'
import CreateTeam from './pages_CreateTeam'
import Leaderboard from './pages_Leaderboard'
import Rewards from './pages_Rewards'
import ViewTeam from './pages_ViewTeam'
import Top10 from './pages_Top10'
import Fixtures from './pages_Fixtures'
import Stats from './pages_Stats'

// Hamburger menu pages
import HowToPlay from './pages_HowToPlay'
import AboutUs from './pages_AboutUs'
import ContactUs from './pages_ContactUs'

// keep the drawer styles global
import './styles/menu-drawer.css'

type Route =
  | 'landing'
  | 'connect'
  | 'home'
  | 'contestTypes'   // ⬅️ NEW
  | 'teamSelect'     // ⬅️ NEW (post-payment create)
  | 'joinContest'
  | 'create'
  | 'leaderboard'
  | 'rewards'
  | 'viewteam'
  | 'top10'
  | 'fixtures'
  | 'stats'
  | 'howToPlay'
  | 'about'
  | 'contact'

const hasWallet = () => {
  try { return !!localStorage.getItem('sol_wallet') } catch { return false }
}

function App() {
  const [route, setRoute] = useState<Route>('landing')
  const stackRef = useRef<Route[]>(['landing'])

  // Telegram helpers
  const getTG = () => (window as any)?.Telegram?.WebApp
  const supports = (min: string) => {
    try { return getTG()?.isVersionAtLeast?.(min) === true } catch { return false }
  }

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
    const showBack = !['landing','home'].includes(route)
    if (supports('6.1')) {
      try { showBack ? tg?.BackButton?.show?.() : tg?.BackButton?.hide?.() } catch {}
    }
  }, [route])

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
    } catch { return }
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

  // When wallet connects, jump into contest flow
  const handleConnected = (addr: string) => {
    try { localStorage.setItem('sol_wallet', addr) } catch {}
    go('contestTypes')
  }

  return (
    <>
      {/* Landing: if wallet already connected, skip Connect → go Home */}
      {route === 'landing' && (
        <Landing
          onLaunch={() => go(hasWallet() ? 'home' : 'connect')}
        />
      )}

      {/* Connect Wallet */}
      {route === 'connect' && (
        <ConnectWallet
          onBack={back}
          onConnected={handleConnected}
        />
      )}

      {/* Home hub */}
      {route === 'home' && (
        <HomeHub
          onViewTeam={() => go('viewteam')}
          onCreateTeam={() => go('create')}
          onJoinContest={() => go('contestTypes')}     {/* ⬅️ goes to payment/contest types */}
          onLeaderboard={() => go('leaderboard')}
          onTop10={() => go('top10')}
          onTransfers={() => alert('Transfers coming soon')}
          onFixtures={() => go('fixtures')}
          onStats={() => go('stats')}
          onBack={back}
          onHowToPlay={() => go('howToPlay')}
          onAboutUs={() => go('about')}
          onContactUs={() => go('contact')}
        />
      )}

      {/* Contest Types (payment) */}
      {route === 'contestTypes' && (
        <ContestTypes
          onBack={back}
          onJoined={() => go('teamSelect')}          // ⬅️ after $5 paid, go build team
        />
      )}

      {/* Post-payment squad builder */}
      {route === 'teamSelect' && (
        <TeamSelection
          onBack={back}
          onNext={() => go('leaderboard')}
        />
      )}

      {/* (Optional) Legacy routes if you still use them elsewhere */}
      {route === 'joinContest' && <JoinContest onSelect={() => go('create')} onBack={back} />}
      {route === 'create' && <CreateTeam onNext={() => go('leaderboard')} onBack={back} />}
      {route === 'leaderboard' && <Leaderboard onNext={() => go('rewards')} onBack={back} />}
      {route === 'rewards' && <Rewards onBack={back} onEnterApp={() => go('home')} />}

      {route === 'viewteam' && <ViewTeam onBack={back} />}
      {route === 'top10' && <Top10 onBack={back} />}
      {route === 'fixtures' && <Fixtures onBack={back} />}
      {route === 'stats' && <Stats onBack={back} />}

      {/* Menu pages */}
      {route === 'howToPlay' && <HowToPlay onBack={back} />}
      {route === 'about' && <AboutUs onBack={back} />}
      {route === 'contact' && <ContactUs onBack={back} />}
    </>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
)

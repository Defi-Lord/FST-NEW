// src/main.tsx
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './state'

import Landing from './pages_Landing'
import JoinContest from './pages_JoinContest'
import CreateTeam from './pages_CreateTeam'
import Leaderboard from './pages_Leaderboard'
import Rewards from './pages_Rewards'
import HomeHub from './pages_HomeHub'
import ViewTeam from './pages_ViewTeam'
import Top10 from './pages_Top10'
import Fixtures from './pages_Fixtures'
import Stats from './pages_Stats'

type Route =
  | 'landing'
  | 'contest'
  | 'create'
  | 'leaderboard'
  | 'rewards'
  | 'home'
  | 'viewteam'
  | 'top10'
  | 'fixtures'
  | 'stats'

function App() {
  const [route, setRoute] = useState<Route>('landing')
  const stackRef = useRef<Route[]>(['landing'])

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
        const prev = stack[stack.length - 1]
        setRoute(prev)
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
    } else {
      setRoute('home')
    }
  }

  return (
    <>
      {route === 'landing'     && <Landing onLaunch={() => go('contest')} />}

      {route === 'contest'     && <JoinContest onSelect={() => go('create')} />}

      {route === 'create'      && <CreateTeam onNext={() => go('leaderboard')} />}

      {route === 'leaderboard' && <Leaderboard onNext={() => go('rewards')} />}

      {route === 'rewards'     && <Rewards onClaim={() => go('home')} />}

      {route === 'home' && (
        <HomeHub
          onViewTeam={() => go('viewteam')}
          onTop10={() => go('top10')}
          onLeaderboard={() => go('top10')}
          onFixtures={() => go('fixtures')}
          onStats={() => go('stats')}
        />
      )}

      {route === 'viewteam' && (
        <ViewTeam onBack={back} onCreateTeam={() => go('create')} />
      )}

      {route === 'top10' && (
        <Top10 onBack={back} />
      )}

      {route === 'fixtures' && (
        <Fixtures onBack={back} />
      )}

      {route === 'stats' && (
        <Stats onBack={back} />
      )}
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

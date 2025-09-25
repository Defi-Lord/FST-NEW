// src/ui/App.tsx
import { useEffect, useMemo, useState } from 'react'
import { AppProvider } from './state'

// App.tsx is in src/ui; pages live in src → import from '../'
import Landing from '../pages_Landing'
import Rewards from '../pages_Rewards'
import CreateTeam from '../pages_CreateTeam'
import ViewTeam from '../pages_ViewTeam'
import JoinContest from '../pages_JoinContest'
import Leaderboard from '../pages_Leaderboard'
import HomeHub from '../pages_HomeHub'
import Top10 from '../pages_Top10'

type Route =
  | 'landing'
  | 'rewards'
  | 'home'
  | 'createTeam'
  | 'viewTeam'
  | 'joinContest'
  | 'leaderboard'
  | 'top10'

export default function App() {
  // simple stack so Back works nicely
  const [stack, setStack] = useState<Route[]>(['landing'])
  const route = stack[stack.length - 1]

  const go = (to: Route) => () => setStack(prev => [...prev, to])
  const back = () => setStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev))

  // create once so it’s the identical function we pass down (easy to log & verify)
  const top10Nav = useMemo(() => go('top10'), []) // eslint-disable-line react-hooks/exhaustive-deps

  // debug breadcrumbs so we can *see* the wiring live
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[App] route =', route)
  }, [route])

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[App] onTop10 will be passed as function?', typeof top10Nav === 'function')
  }, [top10Nav])

  return (
    <AppProvider>
      {route === 'landing' && (
        <Landing
          onGetStarted={go('createTeam')}
          onRewards={go('rewards')}
        />
      )}

      {route === 'rewards' && (
        <Rewards
          onBack={back}
          onEnterApp={go('home')}
        />
      )}

      {route === 'home' && (
        <HomeHub
          onViewTeam={go('viewTeam')}
          onCreateTeam={go('createTeam')}
          onJoinContest={go('joinContest')}
          onLeaderboard={go('leaderboard')}
          onTop10={top10Nav}   // ✅ this is the prop HomeHub needs
          onTransfers={() => alert('Transfers coming soon')}
          onFixtures={() => alert('Fixtures coming soon')}
          onStats={() => alert('Stats coming soon')}
          onBack={back}
        />
      )}

      {route === 'createTeam' && (
        <CreateTeam onNext={go('leaderboard')} onBack={back} />
      )}

      {route === 'viewTeam' && <ViewTeam onBack={back} />}

      {route === 'joinContest' && (
        <JoinContest onSelect={go('leaderboard')} onBack={back} />
      )}

      {route === 'leaderboard' && (
        <Leaderboard onNext={go('rewards')} onBack={back} />
      )}

      {route === 'top10' && <Top10 onBack={back} />}
    </AppProvider>
  )
}

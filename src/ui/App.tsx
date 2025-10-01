// src/ui/App.tsx
import { useState } from 'react'
import { AppProvider } from './state'

import Landing from '../pages_Landing'
import Rewards from '../pages_Rewards'
import CreateTeam from '../pages_CreateTeam'
import ViewTeam from '../pages_ViewTeam'
import JoinContest from '../pages_JoinContest'
import Leaderboard from '../pages_Leaderboard'
import HomeHub from '../pages_HomeHub'
import Top10 from '../pages_Top10'
import HowToPlay from '../pages_HowToPlay'
import AboutUs from '../pages_AboutUs'
import ContactUs from '../pages_ContactUs'
import ConnectWallet from '../pages_ConnectWallet' // ⬅️ NEW

type Route =
  | 'landing'
  | 'connect'       // ⬅️ NEW
  | 'home'
  | 'createTeam'
  | 'viewTeam'
  | 'joinContest'
  | 'leaderboard'
  | 'top10'
  | 'howToPlay'
  | 'about'
  | 'contact'
  | 'rewards'

export default function App() {
  const [stack, setStack] = useState<Route[]>(['landing'])
  const route = stack[stack.length - 1]
  const go = (to: Route) => () => setStack(prev => [...prev, to])
  const back = () => setStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev))

  // For storing the connected wallet now (local only).
  const [wallet, setWallet] = useState<string | null>(() => {
    try { return localStorage.getItem('sol_wallet') } catch { return null }
  })

  const handleConnected = (addr: string) => {
    setWallet(addr)
    // Move straight to Join Contest after connecting (as requested)
    setStack(prev => [...prev, 'joinContest'])
  }

  return (
    <AppProvider>
      {route === 'landing' && (
        <Landing
          // After landing, go to Connect Wallet
          onGetStarted={go('connect')}
          onRewards={go('rewards')}
        />
      )}

      {route === 'connect' && (
        <ConnectWallet
          onBack={back}
          onConnected={handleConnected}
        />
      )}

      {route === 'rewards' && (
        <Rewards onBack={back} onEnterApp={go('home')} />
      )}

      {route === 'home' && (
        <HomeHub
          onViewTeam={go('viewTeam')}
          onCreateTeam={go('createTeam')}
          onJoinContest={go('joinContest')}
          onLeaderboard={go('leaderboard')}
          onTop10={go('top10')}
          onTransfers={() => alert('Transfers coming soon')}
          onFixtures={() => alert('Fixtures coming soon')}
          onStats={() => alert('Stats coming soon')}
          onBack={back}
          onHowToPlay={go('howToPlay')}
          onAboutUs={go('about')}
          onContactUs={go('contact')}
        />
      )}

      {route === 'createTeam' && <CreateTeam onNext={go('leaderboard')} onBack={back} />}
      {route === 'viewTeam' && <ViewTeam onBack={back} />}
      {route === 'joinContest' && <JoinContest onSelect={go('leaderboard')} onBack={back} />}
      {route === 'leaderboard' && <Leaderboard onNext={go('rewards')} onBack={back} />}
      {route === 'top10' && <Top10 onBack={back} />}

      {route === 'howToPlay' && <HowToPlay onBack={back} />}
      {route === 'about' && <AboutUs onBack={back} />}
      {route === 'contact' && <ContactUs onBack={back} />}
    </AppProvider>
  )
}

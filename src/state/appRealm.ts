// src/state/appRealm.ts
import { createContext, useContext, useMemo, useState } from 'react'
import type { ContestRealm } from '../types/contest'

// One store per realm, so data never mixes.
type RealmStores = {
  teamByRealm: Record<ContestRealm, { ids: string[] }>
  pointsByRealm: Record<ContestRealm, number>
  // add whatever else you need (budget, transfers, etc)
}

const defaultStores: RealmStores = {
  teamByRealm:   { free:{ids:[]}, weekly:{ids:[]}, monthly:{ids:[]}, seasonal:{ids:[]} } as any,
  pointsByRealm: { free:0, weekly:0, monthly:0, seasonal:0 },
}

type Ctx = {
  realm: ContestRealm
  setRealm: (r: ContestRealm) => void
  stores: RealmStores
  setTeam: (ids: string[]) => void
  addPoints: (delta: number) => void
}

const AppRealmContext = createContext<Ctx>(null as any)

export function AppRealmProvider({ children }: { children: React.ReactNode }) {
  const [realm, setRealm] = useState<ContestRealm>('free')
  const [stores, setStores] = useState<RealmStores>(defaultStores)

  const value = useMemo<Ctx>(() => ({
    realm,
    setRealm,
    stores,
    setTeam: (ids) => setStores(s => ({
      ...s,
      teamByRealm: { ...s.teamByRealm, [realm]: { ids } }
    })),
    addPoints: (d) => setStores(s => ({
      ...s,
      pointsByRealm: { ...s.pointsByRealm, [realm]: s.pointsByRealm[realm] + d }
    })),
  }), [realm, stores])

  return <AppRealmContext.Provider value={value}>{children}</AppRealmContext.Provider>
}

export const useRealm = () => useContext(AppRealmContext)

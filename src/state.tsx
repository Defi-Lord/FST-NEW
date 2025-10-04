// src/state.tsx
import React, { createContext, useContext, useMemo, useState } from 'react'

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD'

export type Player = {
  id: string | number
  name: string
  club: string
  position: Position
  price: number
  form?: number
}

/** Realms = separate worlds */
export type ContestRealm = 'free' | 'weekly' | 'monthly' | 'seasonal'

/** Rules per realm */
export type RealmRules = {
  players: 11 | 13 | 15
  transferpool: 0 | 1 // per GW
}

/** Central rules table */
export const REALM_RULES: Record<ContestRealm, RealmRules> = {
  free:      { players: 15, transferpool: 0 },
  weekly:    { players: 11, transferpool: 0 },
  monthly:   { players: 13, transferpool: 1 },
  seasonal:  { players: 15, transferpool: 1 },
}

const START_BUDGET = 100 // £100m
const MAX_PER_POSITION: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 }
const MIN_PER_POSITION: Record<Position, number> = { GK: 1, DEF: 3, MID: 3, FWD: 1 } // enables 11 & 13-player squads

/* ---------- tiny safe localStorage helpers ---------- */
function lsGet(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, val: string | null) {
  try {
    if (val == null) localStorage.removeItem(key)
    else localStorage.setItem(key, val)
  } catch {}
}

/* ---------- App state shape ---------- */
type AppState = {
  // profile
  fullName: string
  setFullName: (name: string) => void

  // wallet
  walletAddress: string | null
  setWalletAddress: (addr: string | null) => void

  // realm
  realm: ContestRealm
  setRealm: (r: ContestRealm) => void
  rules: RealmRules

  // realm-scoped selectors
  budget: number
  team: Player[]
  formation: '4-4-2' | '4-3-3' | '3-4-3' | '3-5-2' | '5-3-2'
  setFormation: (f: AppState['formation']) => void

  // actions apply to CURRENT realm
  addPlayer: (p: Player) => boolean
  removePlayer: (id: Player['id']) => boolean
  resetTeam: () => void

  // constants (useful in pages)
  START_BUDGET: number
  MAX_PER_POSITION: Record<Position, number>
  MIN_PER_POSITION: Record<Position, number>
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  // profile
  const [fullName, setFullNameState] = useState<string>(() => lsGet('full_name') || '')
  const setFullName = (name: string) => { setFullNameState(name); lsSet('full_name', name) }

  // wallet
  const [walletAddress, setWalletAddressState] = useState<string | null>(() => lsGet('sol_wallet'))
  const setWalletAddress = (addr: string | null) => { setWalletAddressState(addr); lsSet('sol_wallet', addr) }

  // which world are we in?
  const [realm, setRealm] = useState<ContestRealm>('free')

  // realm-specific stores
  const [budgetByRealm, setBudgetByRealm] = useState<Record<ContestRealm, number>>({
    free: START_BUDGET, weekly: START_BUDGET, monthly: START_BUDGET, seasonal: START_BUDGET
  })
  const [teamByRealm, setTeamByRealm] = useState<Record<ContestRealm, Player[]>>({
    free: [], weekly: [], monthly: [], seasonal: []
  })
  const [formationByRealm, setFormationByRealm] = useState<Record<ContestRealm, AppState['formation']>>({
    free: '4-4-2', weekly: '4-4-2', monthly: '4-4-2', seasonal: '4-4-2'
  })

  // derived
  const rules = REALM_RULES[realm]
  const budget = budgetByRealm[realm]
  const team = teamByRealm[realm]
  const formation = formationByRealm[realm]

  const idEq = (a: Player['id'], b: Player['id']) => String(a) === String(b)

  const addPlayer: AppState['addPlayer'] = (p) => {
    const squadSizeLimit = rules.players
    if (team.some(tp => idEq(tp.id, p.id))) return false
    if (team.length >= squadSizeLimit) return false
    if (budget < p.price) return false
    const posCount = team.filter(tp => tp.position === p.position).length
    if (posCount >= MAX_PER_POSITION[p.position]) return false

    const normalizedId = typeof team[0]?.id === 'number' ? Number(p.id) : String(p.id)

    setTeamByRealm(prev => ({
      ...prev,
      [realm]: [...prev[realm], { ...p, id: normalizedId }]
    }))
    setBudgetByRealm(prev => ({
      ...prev,
      [realm]: Number((prev[realm] - p.price).toFixed(1))
    }))
    return true
  }

  const removePlayer: AppState['removePlayer'] = (id) => {
    const idx = team.findIndex(tp => idEq(tp.id, id))
    if (idx === -1) return false
    const player = team[idx]
    setTeamByRealm(prev => ({
      ...prev,
      [realm]: prev[realm].filter((_, i) => i !== idx)
    }))
    setBudgetByRealm(prev => ({
      ...prev,
      [realm]: Number((prev[realm] + (player?.price || 0)).toFixed(1))
    }))
    return true
  }

  const resetTeam = () => {
    setTeamByRealm(prev => ({ ...prev, [realm]: [] }))
    setBudgetByRealm(prev => ({ ...prev, [realm]: START_BUDGET }))
    setFormationByRealm(prev => ({ ...prev, [realm]: '4-4-2' }))
  }

  const setFormation: AppState['setFormation'] = (f) => {
    setFormationByRealm(prev => ({ ...prev, [realm]: f }))
  }

  const value = useMemo<AppState>(() => ({
    // profile
    fullName, setFullName,
    // wallet
    walletAddress, setWalletAddress,
    // realm
    realm, setRealm, rules,
    // current realm view
    budget, team, formation, setFormation,
    // actions
    addPlayer, removePlayer, resetTeam,
    // constants
    START_BUDGET, MAX_PER_POSITION, MIN_PER_POSITION,
  }), [fullName, walletAddress, realm, rules, budget, team, formation])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used within <AppProvider>')
  return v
}

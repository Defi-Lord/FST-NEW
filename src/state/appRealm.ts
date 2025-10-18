// src/state/appRealm.ts

/** Contest "realms" (separate worlds) */
export type ContestRealm = 'free' | 'weekly' | 'monthly' | 'seasonal'

/** Rules per realm */
export type RealmRules = {
  /** Squad size required for that realm */
  players: 11 | 13 | 15
  /** Whether transfer pool is active (1) or not (0) */
  transferpool: 0 | 1
}

/** Central rules table used across the app */
export const REALM_RULES: Record<ContestRealm, RealmRules> = {
  free:      { players: 15, transferpool: 0 },
  weekly:    { players: 11, transferpool: 0 },
  monthly:   { players: 13, transferpool: 1 },
  seasonal:  { players: 15, transferpool: 1 },
}

/** Default starting budget (£ millions) */
export const START_BUDGET = 100

/** Position type used elsewhere */
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD'

/** Per-position maximums (caps) */
export const MAX_PER_POSITION: Record<Position, number> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
}

/** Minimums to make smaller squads (11/13) valid */
export const MIN_PER_POSITION: Record<Position, number> = {
  GK: 1,
  DEF: 3,
  MID: 3,
  FWD: 1,
}

// src/types/contest.ts
export type ContestRealm = 'free' | 'weekly' | 'monthly' | 'seasonal'

export type RealmRules = {
  players: number
  transferpool: 0 | 1
}

export const REALM_RULES: Record<ContestRealm, RealmRules> = {
  free:      { players: 15, transferpool: 0 },     // your free sandbox
  weekly:    { players: 11, transferpool: 0 },
  monthly:   { players: 13, transferpool: 1 },
  seasonal:  { players: 15, transferpool: 1 },
}

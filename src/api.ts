// src/api.ts
export const API_BASE =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE) ||
  'https://fst-api.onrender.com'

// ---- Generic helper
async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: 'include', ...init })
  if (!r.ok) {
    let e = ''
    try { e = (await r.json()).error } catch {}
    throw new Error(e || `${r.status} ${r.statusText}`)
  }
  return r.json()
}

// ---- Admin/User endpoints (match your server routes)
export async function adminHealth() { return j(`${API_BASE}/admin/health`) }
export async function listContests() { return j<{contests:any[]}>(`${API_BASE}/admin/contests`) }
export async function createContest(payload: { title: string; realm: string; entryFee: number }) {
  return j(`${API_BASE}/admin/contests`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  })
}
export async function toggleContest(id: string, active: boolean) {
  return j(`${API_BASE}/admin/contests/${id}/toggle`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active })
  })
}
export async function deleteContest(id: string) {
  return j(`${API_BASE}/admin/contests/${id}`, { method: 'DELETE' })
}
export async function listUsers() { return j<{users:any[]}>(`${API_BASE}/admin/users`) }

export async function getContestLeaderboard(contestId: string) {
  return j<{ entries: any[] }>(`${API_BASE}/api/contests/${contestId}/leaderboard`)
}

export async function getMe() { return j<{user?: any}>(`${API_BASE}/api/me`) }
export function signOut() { try { localStorage.removeItem('fst_jwt') } catch {} }

// ---- FPL bootstrap + fixtures (via Vercel edge proxy)
export async function fetchBootstrap() {
  const r = await fetch('/api/fpl/bootstrap-static', { cache: 'no-store' })
  if (!r.ok) throw new Error('Failed to load FPL bootstrap')
  return r.json()
}
export async function fetchFixtures() {
  const r = await fetch('https://fantasy.premierleague.com/api/fixtures/', { cache: 'no-store' })
  if (!r.ok) throw new Error('Failed to load fixtures')
  return r.json()
}

// ---- Extra helper used in Top10
export async function fetchElementSummary(id: string | number) {
  const r = await fetch(`https://fantasy.premierleague.com/api/element-summary/${id}/`, { cache: 'no-store' })
  if (!r.ok) throw new Error('Failed to load element summary')
  return r.json()
}

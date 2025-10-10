// src/players_loder.ts
// Tries: VITE_FPL_PROXY_URL -> /fpl/api/bootstrap-static/ -> /mock/bootstrap-static.json.

type Bootstrap = any

const DEV_URL = '/fpl/api/bootstrap-static/'
const LOCAL_SNAPSHOT_URL = '/mock/bootstrap-static.json'

const envUrl = import.meta.env.VITE_FPL_PROXY_URL as string | undefined
const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1'

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

export async function loadPlayersLoder(): Promise<Bootstrap | null> {
  // 1) env
  if (envUrl) {
    const u = envUrl.replace(/\/+$/, '')
    const data = await fetchJSON<Bootstrap>(u)
    if (data) return data
  }

  // 2) dev proxy (unless forced mock)
  if (!USE_MOCK) {
    const data = await fetchJSON<Bootstrap>(DEV_URL)
    if (data) return data
  }

  // 3) local
  const local = await fetchJSON<Bootstrap>(LOCAL_SNAPSHOT_URL)
  if (local) return local

  console.warn('[players_loder] Could not load bootstrap-static from any source.')
  return null
}

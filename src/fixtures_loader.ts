// src/fixtures_loader.ts
// Loads real fixtures from FPL via your Vite proxy (/fpl/api/*) with a mock fallback.
// Honors VITE_FPL_PROXY_URL (full base) or VITE_USE_MOCK=1.

type Bootstrap = any
type FplFixture = any

const envUrl = import.meta.env.VITE_FPL_PROXY_URL as string | undefined
const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1'

// If VITE_FPL_PROXY_URL is given (e.g. http://localhost:3300/fpl/bootstrap-static),
// derive its base by removing trailing slashes and "/bootstrap-static".
function deriveBase(url?: string) {
  if (!url) return null
  return url.replace(/\/+$/, '').replace(/\/bootstrap-static$/, '')
}

const derived = deriveBase(envUrl)
const BASE = derived ?? '/fpl/api'   // <— default to Vite proxy base

async function fetchJSON<T>(url: string, ms = 15000): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!r.ok) throw new Error(`${url} failed (${r.status})`)
    return (await r.json()) as T
  } finally {
    clearTimeout(t)
  }
}

export async function loadBootstrap(): Promise<Bootstrap | null> {
  const url = USE_MOCK ? '/mock/bootstrap-static.json' : `${BASE}/bootstrap-static`
  try {
    return await fetchJSON<Bootstrap>(url)
  } catch (e) {
    console.warn('[Fixtures] bootstrap-static fetch failed:', e)
    return null
  }
}

export async function loadFixtures(): Promise<FplFixture[] | null> {
  const url = USE_MOCK ? '/mock/fixtures.json' : `${BASE}/fixtures`
  try {
    const fixtures = await fetchJSON<FplFixture[]>(url)
    if (!Array.isArray(fixtures) || !fixtures.length) {
      console.warn('[Fixtures] fixtures fetch failed or empty')
      return null
    }
    return fixtures
  } catch (e) {
    console.warn('[Fixtures] fixtures fetch failed:', e)
    return null
  }
}

/** Optional: N upcoming fixtures (thin wrapper you already referenced) */
export async function loadUpcomingFixtures(limit = 10): Promise<FplFixture[] | null> {
  const all = await loadFixtures()
  if (!all) return null
  // If you need to filter or sort, do it here. For now, just slice.
  return all.slice(0, limit)
}

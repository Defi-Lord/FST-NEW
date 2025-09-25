// src/api.ts

/**
 * Prefer a proxyable base in dev/prod (e.g. /api/fpl),
 * but allow overriding with VITE_FPL_BASE when needed.
 *
 * In Vercel, add a rewrite:
 *   { "source": "/api/fpl/(.*)", "destination": "https://fantasy.premierleague.com/api/$1" }
 */
const DEFAULT_BASE = import.meta.env?.VITE_FPL_BASE ?? '/api/fpl';
const UPSTREAM = 'https://fantasy.premierleague.com/api';

// normalize: no trailing slash on the base(s); we add them per-endpoint
const trimSlash = (s: string) => (s.endsWith('/') ? s.slice(0, -1) : s);
const API_BASE = trimSlash(DEFAULT_BASE);
const UPSTREAM_BASE = trimSlash(UPSTREAM);

// Basic fetch options for JSON endpoints
const baseOpts: RequestInit = {
  // Avoid stale CDN/browser caches while developing/testing
  cache: 'no-store',
  headers: {
    Accept: 'application/json',
  },
};

// Small timeout helper (prevents hanging forever on bad networks)
function withTimeout(ms: number, signal?: AbortSignal) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(new DOMException('Timeout', 'TimeoutError')), ms);
  const composite = new AbortController();

  const onAbort = () => composite.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });

  // When composite aborts, clear timeout
  composite.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(id);
      signal?.removeEventListener('abort', onAbort);
    },
    { once: true }
  );

  return { signal: composite.signal, abort: () => composite.abort() , relay: ctrl };
}

async function getFrom(urls: string[], init?: RequestInit) {
  let lastErr: unknown = null;

  for (const url of urls) {
    try {
      // Per-attempt timeout (10s)
      const { signal, relay } = withTimeout(10_000, init?.signal as AbortSignal | undefined);
      const r = await fetch(url, { ...baseOpts, ...init, signal: relay.signal ?? signal });
      if (!r.ok) {
        // Try to capture some context
        const text = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} ${r.statusText} @ ${url} :: ${text.slice(0, 160)}`);
      }
      // Some FPL endpoints can 200 with empty body on rare incidents; guard parse
      const text = await r.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 160)}`);
      }
    } catch (e) {
      lastErr = e;
      // try the next URL in the list
    }
  }
  throw lastErr ?? new Error('All fetch attempts failed');
}

/**
 * The big metadata payload: teams, elements (players), etc.
 * FPL prefers a trailing slash: /bootstrap-static/
 */
export function fetchBootstrap() {
  return getFrom([
    `${API_BASE}/bootstrap-static/`,
    `${UPSTREAM_BASE}/bootstrap-static/`,
  ]);
}

/**
 * Fixtures. Use future=1 by default to keep payload smaller.
 * Example: /fixtures/?future=1
 */
export function fetchFixtures(future: boolean = true) {
  const q = future ? '?future=1' : '';
  return getFrom([
    `${API_BASE}/fixtures/${q}`,
    `${UPSTREAM_BASE}/fixtures/${q}`,
  ]);
}

/**
 * Optional helper: element summary (per-player, fixtures & history)
 * Example usage: fetchElementSummary(123)
 */
export function fetchElementSummary(elementId: number | string) {
  const id = String(elementId).trim();
  return getFrom([
    `${API_BASE}/element-summary/${id}/`,
    `${UPSTREAM_BASE}/element-summary/${id}/`,
  ]);
}

// src/api.ts

/** Base URL for your API (Vite env or localhost) */
export const API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE || 'http://localhost:4000';

/** Read JWT from localStorage (safe) */
export function getToken(): string {
  try {
    return localStorage.getItem('auth_token') || '';
  } catch {
    return '';
  }
}

/** Build headers with Authorization + JSON when body is present */
function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers || {});
  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

/** Core fetch wrapper with consistent error handling */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: buildHeaders(init),
  });

  if (res.ok) {
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // Collect best possible error message
  let message = `HTTP ${res.status}`;
  try {
    const txt = await res.text();
    if (txt) {
      try {
        const j = JSON.parse(txt);
        message = j?.error || txt;
      } catch {
        message = txt;
      }
    }
  } catch {}
  throw new Error(message);
}

/* ==========================================================
   Convenience layer
   ========================================================== */
export const api = {
  get:  <T>(p: string, init?: RequestInit) =>
    request<T>(p, { ...(init || {}), method: 'GET' }),

  post: <T>(p: string, body?: unknown, init?: RequestInit) =>
    request<T>(p, {
      ...(init || {}),
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch:<T>(p: string, body?: unknown, init?: RequestInit) =>
    request<T>(p, {
      ...(init || {}),
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete:<T>(p: string, init?: RequestInit) =>
    request<T>(p, { ...(init || {}), method: 'DELETE' }),
};

/* ==========================================================
   Auth / Session
   ========================================================== */
export type IntrospectResponse = { ok: boolean; payload?: any; error?: string };

export function getMe() {
  return api.get<{ ok: true; user: { id: string; createdAt?: string; updatedAt?: string; displayName?: string | null } }>(
    '/me'
  );
}

export function authIntrospect(token?: string) {
  const t = token || getToken();
  return api.post<IntrospectResponse>('/auth/introspect', { token: t });
}

/* ==========================================================
   Admin: Health, Contests, Users, Leaderboard
   ========================================================== */
export function adminHealth() {
  return api.get<{ ok: true; admin: true }>('/admin/healthz');
}

export type Contest = {
  id: string;
  title: string;
  realm: 'FREE' | 'WEEKLY' | 'MONTHLY' | 'SEASONAL' | string;
  entryFee: number;
  active: boolean;
  createdAt: string;
};

export function listContests() {
  return api.get<{ ok: true; contests: Contest[] }>('/admin/contests');
}

export function createContest(input: {
  title: string;
  realm: Contest['realm'];
  entryFee: number;
  active?: boolean;
}) {
  return api.post<{ ok: true; contest: Contest }>('/admin/contests', input);
}

export function toggleContest(id: string, active: boolean) {
  return api.patch<{ ok: true; contest: Contest }>(
    `/admin/contests/${id}/toggle`,
    { active }
  );
}

export function deleteContest(id: string) {
  return api.delete<{ ok: true }>(`/admin/contests/${id}`);
}

/* ===== Leaderboard (admin + public) ===== */
export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName?: string | null;
  points: number;
  teamName?: string | null;
  entryId?: string;
  createdAt?: string;
};

export function getContestLeaderboardAdmin(
  contestId: string,
  opts?: { limit?: number; offset?: number }
) {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  if (opts?.offset != null) q.set('offset', String(opts.offset));
  const qs = q.toString() ? `?${q}` : '';
  return api.get<{
    ok: true;
    contestId: string;
    entries: LeaderboardEntry[];
    total: number;
    offset: number;
    limit: number | null;
  }>(`/admin/contests/${encodeURIComponent(contestId)}/leaderboard${qs}`);
}

export function getPublicLeaderboard(
  contestId: string,
  opts?: { limit?: number; offset?: number }
) {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  if (opts?.offset != null) q.set('offset', String(opts.offset));
  const qs = q.toString() ? `?${q}` : '';
  return api.get<{
    ok: true;
    contestId: string;
    entries: LeaderboardEntry[];
    total: number;
    offset: number;
    limit: number;
  }>(`/contests/${encodeURIComponent(contestId)}/leaderboard${qs}`);
}

/** ✅ Compat alias (if your Admin page still imports this name) */
export function getContestLeaderboard(
  contestId: string,
  opts?: { limit?: number; offset?: number }
) {
  return getContestLeaderboardAdmin(contestId, opts);
}

/* ===== Admin: Users ===== */
export type AdminUser = {
  id: string;
  createdAt: string;
  updatedAt: string;
  displayName: string | null;
};

export function listUsers() {
  return api.get<{ ok: true; users: AdminUser[] }>('/admin/users');
}

export function getUserDetail(id: string) {
  return api.get<{ ok: true; user: AdminUser; contests: any[] }>(
    `/admin/users/${encodeURIComponent(id)}`
  );
}

/* ==========================================================
   Public: Join Flow (FREE + PAID)
   ========================================================== */

/** FREE join (entryFee = 0 contests) */
export function joinContest(contestId: string, team?: any) {
  return api.post<{ ok: true; entry: any; created: boolean }>(
    `/contests/${encodeURIComponent(contestId)}/join`,
    team ? { team } : undefined
  );
}

/** Start PAID join ($5 worth of SOL) — server returns instructions */
export function startPaidJoin(contestId: string) {
  return api.post<{
    ok: true;
    to: string;               // treasury address
    amountLamports: number;   // lamports to send (>= MIN_LAMPORTS_FOR_5USD)
    memo: string;             // optional memo to include
    from: string;             // your wallet (server echoes it)
  }>(`/contests/${encodeURIComponent(contestId)}/join/start`);
}

/** Verify PAID join — you pass the on-chain signature after user sends SOL */
export function verifyPaidJoin(contestId: string, signature: string) {
  return api.post<{ ok: true; entry: any; created: boolean }>(
    `/contests/${encodeURIComponent(contestId)}/join/verify`,
    { signature }
  );
}

/* ==========================================================
   History (per-user, per-contest) — rounds & points
   ========================================================== */

/** Returns this user's round-by-round scores for a contest */
export function getMyHistory(contestId: string) {
  return api.get<{
    ok: true;
    contest: { id: string; realm: string; title: string };
    scores: Array<{ round: number; points: number; createdAt: string }>;
  }>(`/contests/${encodeURIComponent(contestId)}/my/history`);
}

/* ==========================================================
   FPL proxies (used by your HomeHub)
   ========================================================== */
export function fetchBootstrap() {
  return api.get<any>('/fpl/api/bootstrap-static/');
}

export function fetchFixtures(query?: Record<string, string | number | boolean>) {
  const q =
    query && Object.keys(query).length
      ? `?${new URLSearchParams(
          Object.entries(query).map(([k, v]) => [k, String(v)])
        )}`
      : '';
  return api.get<any>(`/fpl/api/fixtures/${q}`);
}

export function fetchElementSummary(id: string | number) {
  return api.get<any>(`/fpl/api/element-summary/${id}/`);
}

/* ==========================================================
   Utilities
   ========================================================== */
export function signOut() {
  try {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('sol_wallet');
  } catch {}
}

export async function withAuthGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (String(e?.message || '').startsWith('HTTP 401')) {
      signOut();
    }
    throw e;
  }
}
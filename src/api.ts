// src/api.ts — production-safe API helpers (NO React, NO JSX)

// ---------- API base ----------
function computeApiBase() {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
  const isProd = !!import.meta.env?.PROD;

  let base: string | undefined = envBase;

  if (!base || base.trim().length === 0) {
    if (isProd) {
      base = "";
      if (typeof window !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn(
          "VITE_API_BASE is not set in production. Set it to your Render API URL in Vercel → Settings → Environment Variables."
        );
      }
    } else {
      base = "http://localhost:4000";
    }
  }
  return base.replace(/\/+$/, "");
}

export const API_BASE = computeApiBase();
export const isProd = !!import.meta.env?.PROD;

// ---------- Small utils ----------
export const toBytes = (s: string) => new TextEncoder().encode(s);

/** base58 encoder (bitcoin alphabet) — no external deps */
export function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const input = bytes.slice();
  const digits: number[] = [];
  for (let i = zeros; i < input.length; i++) {
    let carry = input[i];
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j] * 256 + carry;
      digits[j] = Math.floor(x / 58);
      carry = x % 58;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  for (let k = 0; k < zeros; k++) digits.push(0);
  return digits.reverse().map((d) => ALPHABET[d]).join("");
}

/** Safe JSON parse from fetch error bodies */
export async function safeJson(r: Response) {
  try {
    return await r.json();
  } catch {
    return undefined;
  }
}

// ---------- Generic fetchers ----------
async function apiGet<T>(path: string): Promise<T> {
  if (!API_BASE) throw new Error("VITE_API_BASE is missing in production.");
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    const err = await safeJson(res);
    throw new Error(err?.error || `GET ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  if (!API_BASE) throw new Error("VITE_API_BASE is missing in production.");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const err = await safeJson(res);
    throw new Error(err?.error || `POST ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ---- Authenticated (JWT) helpers ----
function getAuthToken(): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem("authToken") : null;
  } catch {
    return null;
  }
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error("VITE_API_BASE is missing in production.");
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await safeJson(res);
    throw new Error(err?.error || `${init?.method || "GET"} ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function authGet<T>(path: string): Promise<T> {
  return authFetch<T>(path, { method: "GET" });
}
async function authPost<T>(path: string, body?: unknown): Promise<T> {
  return authFetch<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}
async function authPut<T>(path: string, body?: unknown): Promise<T> {
  return authFetch<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) });
}
async function authDelete<T>(path: string): Promise<T> {
  return authFetch<T>(path, { method: "DELETE" });
}

// ---------- Auth endpoints ----------
export async function getNonce(wallet: string) {
  return apiGet<{ wallet: string; nonce: string; message: string; expiresInSec: number }>(
    `/auth/nonce?wallet=${encodeURIComponent(wallet)}`
  );
}

export async function verifySignature(payload: { walletAddress: string; signatureBase58: string }) {
  return apiPost<{
    ok: true;
    token?: string;
    userId: string;
    walletId: string;
    expiresAt?: string;
  }>(`/auth/verify`, payload);
}

// ---------- Public (FPL-style) data ----------
export async function fetchFixtures(): Promise<any> {
  try {
    return await apiGet<any>("/public/fixtures");
  } catch {
    const r = await fetch("/mock/fixtures.json");
    if (!r.ok) throw new Error(`fixtures mock not found (${r.status})`);
    return r.json();
  }
}

export async function fetchBootstrap(): Promise<any> {
  try {
    return await apiGet<any>("/public/bootstrap");
  } catch {
    const r = await fetch("/mock/bootstrap-static.json");
    if (!r.ok) throw new Error(`bootstrap mock not found (${r.status})`);
    return r.json();
  }
}

export async function fetchElementSummary(elementId: number | string): Promise<any> {
  return apiGet<any>(`/public/player/${encodeURIComponent(String(elementId))}/summary`);
}

// ---------- Contests (public) ----------
export type Contest = {
  id: string;
  name: string;
  status?: "upcoming" | "live" | "completed";
  entryFee?: number;
  currency?: string;
  startsAt?: string; // ISO
  endsAt?: string;   // ISO
  [k: string]: any;
};

export async function listContests(): Promise<Contest[]> {
  return apiGet<Contest[]>("/public/contests");
}

export async function joinContest(contestId: string, payload?: Record<string, any>) {
  return apiPost<{ ok: true; entryId: string }>(
    `/public/contests/${encodeURIComponent(contestId)}/join`,
    payload ?? {}
  );
}

export async function startPaidJoin(contestId: string, payload?: Record<string, any>) {
  return apiPost<{ ok: true; reference?: string; paymentUrl?: string }>(
    `/public/contests/${encodeURIComponent(contestId)}/join/start`,
    payload ?? {}
  );
}

export async function verifyPaidJoin(contestId: string, reference: string) {
  return apiGet<{ ok: true; entryId: string }>(
    `/public/contests/${encodeURIComponent(contestId)}/join/verify?reference=${encodeURIComponent(reference)}`
  );
}

// ---------- Admin (JWT required) ----------
export type NewContestInput = {
  name: string;
  entryFee?: number;
  currency?: string;
  startsAt?: string; // ISO
  endsAt?: string;   // ISO
  [k: string]: any;
};

export type UpdateContestInput = Partial<NewContestInput> & { status?: Contest["status"] };

export type User = {
  id: string;
  wallet?: string;
  email?: string;
  createdAt?: string;
  [k: string]: any;
};

export async function adminHealth(): Promise<{ ok: boolean; [k: string]: any }> {
  try {
    return await authGet<{ ok: boolean }>("/admin/healthz");
  } catch {
    return apiGet<{ ok: boolean }>("/public/healthz");
  }
}

export async function createContest(input: NewContestInput) {
  return authPost<Contest>("/admin/contests", input);
}

export async function updateContest(id: string, patch: UpdateContestInput) {
  return authPut<Contest>(`/admin/contests/${encodeURIComponent(id)}`, patch);
}

export async function deleteContest(id: string) {
  return authDelete<{ ok: true }>(`/admin/contests/${encodeURIComponent(id)}`);
}

/** Toggle contest active/visibility/status */
export async function toggleContest(id: string, enabled?: boolean) {
  return authPost<Contest>(`/admin/contests/${encodeURIComponent(id)}/toggle`, enabled === undefined ? {} : { enabled });
}

/** Admin: list all users */
export async function listUsers(): Promise<User[]> {
  return authGet<User[]>("/admin/users");
}

/** Contest leaderboard (admin preferred, public fallback) */
export async function getContestLeaderboard(contestId: string): Promise<any> {
  try {
    return await authGet<any>(`/admin/contests/${encodeURIComponent(contestId)}/leaderboard`);
  } catch {
    return apiGet<any>(`/public/contests/${encodeURIComponent(contestId)}/leaderboard`);
  }
}

// ---------- User (JWT required) ----------
export type HistoryItem = {
  id?: string;
  contestId: string;
  entryId?: string;
  position?: number;
  points?: number;
  prize?: number;
  createdAt?: string; // ISO
  [k: string]: any;
};

/** Returns the authenticated user's contest history */
export async function getMyHistory(): Promise<HistoryItem[]> {
  // Primary: protected endpoint
  try {
    return await authGet<HistoryItem[]>("/user/history");
  } catch (e) {
    // Optional fallback if you expose a public history view
    return apiGet<HistoryItem[]>("/public/user/history");
  }
}

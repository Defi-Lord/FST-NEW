// src/api.ts — production-safe API helpers (NO React, NO JSX)

// ---------- API base ----------
/**
 * In production, you MUST set VITE_API_BASE in Vercel to your Render API URL
 *   e.g. https://your-api.onrender.com
 * In dev, defaults to http://localhost:4000 if unset.
 * We intentionally DO NOT fall back to window.location.origin in prod.
 */
function computeApiBase() {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
  const isProd = !!import.meta.env?.PROD;

  let base: string | undefined = envBase;

  if (!base || base.trim().length === 0) {
    if (isProd) {
      base = ""; // force explicit config in prod
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

// ---------- Low-level HTTP ----------
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

// ---------- Auth endpoints ----------
export async function getNonce(wallet: string) {
  return apiGet<{ wallet: string; nonce: string; message: string; expiresInSec: number }>(
    `/auth/nonce?wallet=${encodeURIComponent(wallet)}`
  );
}

export async function verifySignature(payload: { walletAddress: string; signatureBase58: string }) {
  return apiPost<{ ok: true; token?: string; userId: string; walletId: string; expiresAt?: string }>(
    "/auth/verify",
    payload
  );
}

// ---------- FPL/public data helpers (used by HomeHub) ----------
/** Fetch all fixtures, with local mock fallback */
export async function fetchFixtures(): Promise<any> {
  try {
    return await apiGet<any>("/public/fixtures");
  } catch {
    const r = await fetch("/mock/fixtures.json");
    if (!r.ok) throw new Error(`fixtures mock not found (${r.status})`);
    return r.json();
  }
}

/** Fetch bootstrap static, with local mock fallback */
export async function fetchBootstrap(): Promise<any> {
  try {
    return await apiGet<any>("/public/bootstrap");
  } catch {
    const r = await fetch("/mock/bootstrap-static.json");
    if (!r.ok) throw new Error(`bootstrap mock not found (${r.status})`);
    return r.json();
  }
}

/** Fetch a player's summary (API only) */
export async function fetchElementSummary(elementId: number | string): Promise<any> {
  return apiGet<any>(`/public/player/${encodeURIComponent(String(elementId))}/summary`);
}

// ---------- Contest types + endpoints (expected by HomeHub) ----------
export type Contest = {
  id: string;
  title: string;
  description?: string | null;
  entryFee?: number | null; // in your currency units
  currency?: string | null; // e.g. "NGN", "USDC"
  status?: "upcoming" | "open" | "closed" | "settled";
  startsAt?: string | null;
  endsAt?: string | null;
  // add/relax fields as your API returns; TS is structural and will accept supersets
};

/** List public contests */
export async function listContests(): Promise<Contest[]> {
  // your repo contained apps/api/src/routes/contests.public.ts — exposing /public/contests
  return apiGet<Contest[]>("/public/contests");
}

/** Join a contest (free or paid — server decides) */
export async function joinContest(contestId: string, payload?: Record<string, unknown>) {
  // assumes an authenticated user (JWT cookie or Authorization header on server side)
  return apiPost<{ ok: true; joinId: string; requiresPayment?: boolean; reference?: string }>(
    `/contests/${encodeURIComponent(contestId)}/join`,
    payload ?? {}
  );
}

/** Start a paid join flow (creates a payment intent / reference) */
export async function startPaidJoin(contestId: string) {
  // some backends expose /payments/start or /contests/:id/pay/start — choose the common one:
  try {
    return await apiPost<{ ok: true; reference: string; redirectUrl?: string }>(
      "/payments/start",
      { contestId }
    );
  } catch {
    // fallback to a contest-scoped endpoint if your API uses it
    return apiPost<{ ok: true; reference: string; redirectUrl?: string }>(
      `/contests/${encodeURIComponent(contestId)}/payments/start`,
      {}
    );
  }
}

/** Verify a paid join (called after user completes payment) */
export async function verifyPaidJoin(reference: string) {
  // common pattern: /payments/verify with { reference }
  try {
    return await apiPost<{ ok: true; status: "paid" | "pending" | "failed"; joinId?: string }>(
      "/payments/verify",
      { reference }
    );
  } catch {
    // fallback to alt path
    return apiPost<{ ok: true; status: "paid" | "pending" | "failed"; joinId?: string }>(
      `/payments/verify/${encodeURIComponent(reference)}`,
      {}
    );
  }
}

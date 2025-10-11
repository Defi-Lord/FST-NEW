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

// Generic GET with credentials (for cookie-based flows)
async function apiGet<T>(path: string): Promise<T> {
  if (!API_BASE) throw new Error("VITE_API_BASE is missing in production.");
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    const err = await safeJson(res);
    throw new Error(err?.error || `GET ${path} failed (${res.status})`);
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
  if (!API_BASE) throw new Error("VITE_API_BASE is missing in production.");
  const res = await fetch(`${API_BASE}/auth/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await safeJson(res);
    throw new Error(err?.error || `Verify failed (${res.status})`);
  }
  return (await res.json()) as {
    ok: true;
    token?: string;
    userId: string;
    walletId: string;
    expiresAt?: string;
  };
}

// ---------- FPL-style data helpers expected by pages_HomeHub.tsx ----------
// We’ll try your API endpoints first; if they 404/fail, we fall back to local mock JSON:
//   public/mock/fixtures.json
//   public/mock/bootstrap-static.json
// (These files exist in your repo per your earlier commit.)

/** Fetch all fixtures */
export async function fetchFixtures(): Promise<any> {
  try {
    return await apiGet<any>("/public/fixtures");
  } catch {
    // fallback to local mock
    const r = await fetch("/mock/fixtures.json");
    if (!r.ok) throw new Error(`fixtures mock not found (${r.status})`);
    return r.json();
  }
}

/** Fetch bootstrap (static metadata) */
export async function fetchBootstrap(): Promise<any> {
  try {
    return await apiGet<any>("/public/bootstrap");
  } catch {
    const r = await fetch("/mock/bootstrap-static.json");
    if (!r.ok) throw new Error(`bootstrap mock not found (${r.status})`);
    return r.json();
  }
}

/** Fetch per-player summary; falls back to API-only (no local mock for a specific id) */
export async function fetchElementSummary(elementId: number | string): Promise<any> {
  return apiGet<any>(`/public/player/${encodeURIComponent(String(elementId))}/summary`);
}

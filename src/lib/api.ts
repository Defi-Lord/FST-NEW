/* eslint-disable @typescript-eslint/no-explicit-any */
import bs58 from "bs58";

/**
 * Base URL for your API on Render.
 * In Vite, env vars must be prefixed with VITE_ to reach the client bundle.
 */
export const API_BASE: string =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (typeof process !== "undefined" ? (process as any)?.env?.VITE_API_BASE : "") ||
  "https://fst-api.onrender.com";

export const AUTH_PATHS = {
  nonce: "/auth/nonce",
  verify: "/auth/verify",
  me: "/auth/me",
  logout: "/auth/logout"
} as const;

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status = 500, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function looksLikeBase58(address: string): boolean {
  return !!address && BASE58_RE.test(address) && address.length >= 32 && address.length <= 44;
}

export function u8ToBase64(u8: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  if (typeof btoa === "function") return btoa(binary);
  // eslint-disable-next-line no-undef
  return Buffer.from(u8).toString("base64");
}

export function base58ToBase64(sig58: string): string {
  const bytes = bs58.decode(sig58);
  return u8ToBase64(bytes);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function parseSmart(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type NonceShape = { nonce?: string; nonceToken?: string; token?: string; value?: string } | string;

function pickNonce(payload: NonceShape): string {
  if (typeof payload === "string") return payload.trim();
  const v =
    (payload as any)?.nonce ??
    (payload as any)?.nonceToken ??
    (payload as any)?.token ??
    (payload as any)?.value ??
    "";
  return String(v).trim();
}

/** Get nonce (POST first, fallback to GET) */
export async function getNonce(address: string, opts?: { timeoutMs?: number }): Promise<string> {
  if (!address) throw new ApiError("Missing wallet address", 400);
  if (!looksLikeBase58(address)) throw new ApiError("Invalid Solana address", 400);
  const timeoutMs = opts?.timeoutMs ?? 15000;

  // 1) Try POST
  const postRes = await fetchWithTimeout(`${API_BASE}${AUTH_PATHS.nonce}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ address })
  }, timeoutMs);

  if (postRes.ok) {
    const data = await parseSmart(postRes);
    const nonce = pickNonce(data);
    if (!nonce) throw new ApiError("Nonce missing in POST response", 500, data);
    return nonce;
  }

  // 2) Fallback GET when POST not allowed / returns 400/404/405/etc.
  if ([400, 404, 405, 422, 501].includes(postRes.status)) {
    const url = new URL(`${API_BASE}${AUTH_PATHS.nonce}`);
    url.searchParams.set("address", address);
    const getRes = await fetchWithTimeout(url.toString(), { method: "GET", credentials: "include" }, timeoutMs);
    const payload = await parseSmart(getRes);
    if (!getRes.ok) {
      throw new ApiError(`Nonce GET failed (${getRes.status})`, getRes.status, payload);
    }
    const nonce = pickNonce(payload);
    if (!nonce) throw new ApiError("Nonce missing in GET response", 500, payload);
    return nonce;
  }

  throw new ApiError(
    `Nonce POST failed (${postRes.status})`,
    postRes.status,
    await parseSmart(postRes)
  );
}

export function buildAuthMessage(params: {
  address: string;
  nonce: string;
  domain?: string;
  origin?: string;
  chain?: string;
  version?: string;
  apiBase?: string;
  statement?: string;
}): string {
  const {
    address,
    nonce,
    domain = (typeof window !== "undefined" ? window.location.host : "localhost"),
    origin = (typeof window !== "undefined" ? window.location.origin : "http://localhost"),
    chain = "solana",
    version = "1",
    apiBase = API_BASE,
    statement = "Sign in to FST"
  } = params;

  const issuedAt = new Date().toISOString();

  return [
    statement,
    `Domain: ${domain}`,
    `Address: ${address}`,
    `Chain: ${chain}`,
    `Version: ${version}`,
    `Nonce: ${nonce}`,
    `Origin: ${origin}`,
    `API: ${apiBase}`,
    `Issued At: ${issuedAt}`
  ].join("\n");
}

export type VerifyRequest = {
  address: string;
  message: string;
  signature?: string;        // base64
  signatureBase58?: string;  // optional input form
  [k: string]: any;
};

export type VerifyResponse = {
  ok: boolean;
  token?: string;
  user?: any;
  [k: string]: any;
};

export async function verifySignature(req: VerifyRequest, opts?: { timeoutMs?: number }): Promise<VerifyResponse> {
  const timeoutMs = opts?.timeoutMs ?? 20000;

  if (!req?.address) throw new ApiError("address is required", 400);
  if (!looksLikeBase58(req.address)) throw new ApiError("Invalid Solana address", 400);
  if (!req?.message) throw new ApiError("message is required", 400);

  let signatureBase64 = req.signature;
  if (!signatureBase64 && req.signatureBase58) signatureBase64 = base58ToBase64(req.signatureBase58);
  if (!signatureBase64) throw new ApiError("signature (base64) or signatureBase58 is required", 400);

  const body = { ...req, signature: signatureBase64 };
  delete (body as any).signatureBase58;

  const res = await fetchWithTimeout(`${API_BASE}${AUTH_PATHS.verify}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  }, timeoutMs);

  const payload = await parseSmart(res);
  if (!res.ok) throw new ApiError(`Verify failed (${res.status})`, res.status, payload);

  return { ok: true, ...(typeof payload === "object" ? payload : { raw: payload }) };
}

export async function me(opts?: { timeoutMs?: number }): Promise<any | null> {
  const timeoutMs = opts?.timeoutMs ?? 15000;
  try {
    const res = await fetchWithTimeout(`${API_BASE}${AUTH_PATHS.me}`, {
      method: "GET",
      credentials: "include"
    }, timeoutMs);
    if (!res.ok) return null;
    return await parseSmart(res);
  } catch {
    return null;
  }
}

export async function logout(opts?: { timeoutMs?: number }): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 15000;
  try {
    await fetchWithTimeout(`${API_BASE}${AUTH_PATHS.logout}`, {
      method: "POST",
      credentials: "include"
    }, timeoutMs);
  } catch {
    // ignore network errors on logout
  }
}

/** One-shot helper */
export async function signInWithWalletFlow(params: {
  address: string;
  signBytes: (message: Uint8Array) => Promise<Uint8Array>;
}): Promise<{ verify: VerifyResponse; message: string; signatureBase64: string }> {
  const { address, signBytes } = params;
  const nonce = await getNonce(address);
  const message = buildAuthMessage({ address, nonce });
  const sig = await signBytes(new TextEncoder().encode(message));
  const signatureBase64 = u8ToBase64(sig);
  const verify = await verifySignature({ address, message, signature: signatureBase64 });
  return { verify, message, signatureBase64 };
}

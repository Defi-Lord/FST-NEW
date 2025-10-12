// src/components/SignInWithWallet.tsx
import React, { useCallback, useMemo, useState } from "react";

/**
 * API base:
 * - In production, set VITE_API_BASE to your Render API URL (e.g. https://fst-api.onrender.com).
 * - In dev (vite), defaults to http://localhost:4000 if not set.
 */
function computeApiBase() {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
  const isProd = !!import.meta.env?.PROD;

  let base: string | undefined = envBase;

  if (!base || base.trim().length === 0) {
    base = isProd ? "" : "http://localhost:4000";
    if (isProd && typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("VITE_API_BASE is not set in production.");
    }
  }
  return base.replace(/\/+$/, "");
}
const API_BASE = computeApiBase();

/** Minimal helpers */
const toBytes = (s: string) => new TextEncoder().encode(s);

/** base58 encoder (bitcoin alphabet) — no external deps */
function base58Encode(bytes: Uint8Array): string {
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

/** Phantom (subset) */
type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58?: () => string; toString?: () => string };
  connect: (opts?: any) => Promise<{ publicKey: { toBase58?: () => string; toString?: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, displayEncoding?: string) => Promise<{ signature: Uint8Array }>;
};

declare global {
  interface Window {
    solana?: PhantomProvider;
    phantom?: { solana?: PhantomProvider };
  }
}

function detectPhantom(): PhantomProvider | undefined {
  const w = typeof window !== "undefined" ? (window as any) : undefined;
  if (!w) return undefined;
  if (w?.solana?.isPhantom) return w.solana as PhantomProvider;
  if (w?.phantom?.solana?.isPhantom) return w.phantom.solana as PhantomProvider;
  return undefined;
}

type Status =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "gettingNonce" }
  | { kind: "signing" }
  | { kind: "verifying" }
  | { kind: "success"; userId?: string; token?: string }
  | { kind: "error"; message: string; hint?: string };

export default function SignInWithWallet({ onSignedIn }: { onSignedIn?: () => void }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [address, setAddress] = useState<string>("");

  const phantom = useMemo(detectPhantom, []);

  const connectWallet = useCallback(async (): Promise<string> => {
    if (!phantom || !phantom.connect) {
      throw new Error("Phantom wallet not found. Install Phantom and refresh.");
    }
    setStatus({ kind: "connecting" });
    const res = await phantom.connect({ onlyIfTrusted: false });
    const pkAny = res?.publicKey as any;
    const pub = pkAny?.toBase58?.() ?? pkAny?.toString?.() ?? "";
    if (!pub) throw new Error("Could not read wallet address.");
    setAddress(pub);
    return pub;
  }, [phantom]);

  const signIn = useCallback(async () => {
    try {
      if (!API_BASE) {
        throw new Error("VITE_API_BASE is missing.");
      }
      const wallet = address || (await connectWallet());

      // 1) Get nonce MESSAGE (server also sets cookie; we’ll still pass message explicitly)
      setStatus({ kind: "gettingNonce" });
      const nonceUrl = `${API_BASE}/auth/nonce?wallet=${encodeURIComponent(wallet)}`;
      const nonceRes = await fetch(nonceUrl, { method: "GET", credentials: "include" });
      if (!nonceRes.ok) {
        let hint: string | undefined;
        if (nonceRes.status === 400 || nonceRes.status === 500) {
          hint =
            "If this is a preview domain, ensure Render CORS includes https://*.vercel.app and cookies use SameSite=None; Secure.";
        }
        throw { message: `Nonce request failed (${nonceRes.status})`, hint };
      }
      const nonceData = (await nonceRes.json()) as { message: string; expiresInSec?: number };
      const message = nonceData?.message;
      if (!message || typeof message !== "string") throw new Error("Nonce response missing message.");

      // 2) Sign exact message
      if (!phantom?.signMessage) {
        throw {
          message: "Phantom `signMessage` is not available.",
          hint: "Enable ‘Message Signing’ in Phantom → Settings → Developer.",
        };
      }
      setStatus({ kind: "signing" });
      const { signature } = await phantom.signMessage!(toBytes(message), "utf8");
      const signatureBase58 = base58Encode(signature);

      // 3) Verify signature (body contains wallet + signature; server may read nonce from cookie or message)
      setStatus({ kind: "verifying" });
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, signatureBase58, message }),
      });

      if (!verifyRes.ok) {
        const txt = await verifyRes.text().catch(() => "");
        let hint: string | undefined;
        if (verifyRes.status === 400) hint = "Missing/invalid nonce. Ensure the same domain is allowed in CORS and cookies aren’t blocked.";
        if (verifyRes.status === 500) hint = "Server error. Check Render logs for /auth/verify.";
        throw { message: `Verify failed (${verifyRes.status})${txt ? `: ${txt}` : ""}`, hint };
      }

      const data = (await verifyRes.json()) as {
        ok: boolean;
        token?: string;
        userId?: string;
      };
      if (data?.token && typeof window !== "undefined") {
        try {
          window.localStorage.setItem("authToken", data.token);
        } catch {}
      }
      setStatus({ kind: "success", userId: data.userId, token: data.token });

      // let parent know so router can advance
      onSignedIn?.();
    } catch (e: any) {
      const msg = e?.message || "Something went wrong";
      setStatus({ kind: "error", message: msg, hint: e?.hint });
    }
  }, [address, connectWallet, phantom, onSignedIn]);

  const disconnect = useCallback(async () => {
    try {
      await phantom?.disconnect?.();
    } catch {}
    setAddress("");
    setStatus({ kind: "idle" });
  }, [phantom]);

  const disabled =
    status.kind === "connecting" ||
    status.kind === "gettingNonce" ||
    status.kind === "signing" ||
    status.kind === "verifying";

  const isProd = !!import.meta.env?.PROD;

  return (
    <div className="signin-wrap">
      <style>{css}</style>
      <div className="card">
        <div className="logo">FST</div>
        <h1>Sign in with Solana</h1>
        <p className="sub">Secure sign in using your Phantom wallet.</p>

        {address ? (
          <div className="pill">
            <div className="pill-label">Wallet</div>
            <div className="pill-value">{address}</div>
          </div>
        ) : (
          <div className="pill muted">No wallet connected.</div>
        )}

        <div className="btn-row">
          {!address ? (
            <button className="btn-primary" onClick={connectWallet} disabled={disabled}>
              {status.kind === "connecting" ? "Connecting…" : "Connect Phantom"}
            </button>
          ) : (
            <>
              <button className="btn-muted" onClick={disconnect} disabled={disabled}>
                Disconnect
              </button>
              <button className="btn-primary" onClick={signIn} disabled={disabled}>
                {status.kind === "gettingNonce"
                  ? "Getting nonce…"
                  : status.kind === "signing"
                  ? "Signing…"
                  : status.kind === "verifying"
                  ? "Verifying…"
                  : "Sign In"}
              </button>
            </>
          )}
        </div>

        <div className="state">
          {status.kind === "error" && (
            <div className="alert">
              <div><strong>Auth error:</strong> {status.message}</div>
              {status.hint && <div className="hint">{status.hint}</div>}
              <div className="hint">
                If it fails at “Getting nonce…” or “Verifying…”, ensure your API CORS allows your Vercel domain and sets cookies with <code>SameSite=None; Secure</code>.
              </div>
            </div>
          )}

          {status.kind === "success" && (
            <div className="ok">
              <div>✅ Signed in!</div>
              {status.token && (
                <div className="tiny">
                  JWT stored locally (auth cookie may also be set).
                </div>
              )}
            </div>
          )}

          {(status.kind === "connecting" ||
            status.kind === "gettingNonce" ||
            status.kind === "signing" ||
            status.kind === "verifying") && <div className="ghost">Working…</div>}
        </div>

        {!isProd && (
          <div className="tiny dev">
            Dev: API = <code>{API_BASE || "(missing VITE_API_BASE)"}</code>
          </div>
        )}

        <div className="tiny tip">
          Tip: If you don’t see the wallet popup, click the Phantom icon in your browser toolbar.
        </div>
      </div>
      <div className="bg" />
    </div>
  );
}

const css = String.raw`
.signin-wrap { min-height:100dvh; display:grid; place-items:center; position:relative; overflow:hidden; background:#0b1020; color:#e7e9ee; }
.bg { position:absolute; inset:-20%; background:
  radial-gradient(60% 40% at 20% 10%, rgba(99,102,241,.25), transparent 60%),
  radial-gradient(50% 40% at 80% 20%, rgba(236,72,153,.25), transparent 60%),
  radial-gradient(40% 30% at 40% 80%, rgba(16,185,129,.25), transparent 60%); filter: blur(80px); }
.card { position:relative; z-index:1; width:min(92vw,520px); border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:22px; background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03)); backdrop-filter: blur(6px); box-shadow:0 10px 50px rgba(0,0,0,.4); }
.logo { width:56px; height:56px; border-radius:14px; display:grid; place-items:center; background:linear-gradient(135deg,#6366f1,#ec4899); color:#fff; font-weight:900; letter-spacing:.5px; }
h1 { margin: 12px 0 4px; font-size: 22px; font-weight: 900; }
.sub { margin: 0 0 16px; opacity:.8; }
.pill { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); }
.pill.muted { opacity:.7; }
.pill-label { opacity:.7; font-size:12px; }
.pill-value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break:break-all; }
.btn-row { display:flex; gap:10px; margin-top:12px; }
.btn-primary { padding:10px 14px; border-radius:10px; border:1px solid #6b46c1; background:linear-gradient(180deg,#7c3aed,#5b21b6); color:#fff; cursor:pointer; font-weight:700; box-shadow:0 6px 20px rgba(124,58,237,.35); }
.btn-muted { padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,.25); background:transparent; color:#e7e9ee; cursor:pointer; }
.alert { background:rgba(255,0,0,0.08); border:1px solid rgba(255,0,0,0.3); color:#ffd5d5; padding:10px; border-radius:10px; margin-top:12px; }
.ok { background:rgba(0,180,0,0.08); border:1px solid rgba(0,180,0,0.35); color:#d5ffe0; padding:10px; border-radius:10px; margin-top:12px; }
.ghost { margin-top:12px; padding:10px 12px; border-radius:12px; border:1px dashed rgba(255,255,255,.2); opacity:.8; }
.tiny { margin-top:8px; opacity:.75; font-size:12px; }
.tiny.dev { margin-top:12px; }
.tip { margin-top:4px; opacity:.7; font-size:12px; }
code { background: rgba(0,0,0,.35); padding:1px 4px; border-radius:6px; }
`;

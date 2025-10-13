// src/pages/SolanaSignIn.tsx
import React, { useCallback, useMemo, useState } from "react";

/** ──────────────────────────────────────────────────────────────────────────────
 * CONFIG
 *  - VITE_API_BASE must be set to your API (e.g. https://fst-api.onrender.com)
 *  - This page assumes two endpoints:
 *      GET  /auth/nonce?wallet=<base58>
 *      POST /auth/verify { walletAddress, signatureBase58, message }
 * ────────────────────────────────────────────────────────────────────────────── */
const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "").replace(/\/+$/, "");

/** utils */
const toBytes = (s: string) => new TextEncoder().encode(s);

/** base58 encoder (no external deps) */
function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (!bytes.length) return "";
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

/** Phantom types */
type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58?: () => string; toString?: () => string };
  connect: (opts?: any) => Promise<{ publicKey: { toBase58?: () => string; toString?: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>;
};
declare global {
  interface Window {
    solana?: PhantomProvider;
    phantom?: { solana?: PhantomProvider };
  }
}
function usePhantom(): PhantomProvider | undefined {
  return useMemo(() => {
    const w = typeof window !== "undefined" ? (window as any) : undefined;
    if (!w) return undefined;
    if (w?.solana?.isPhantom) return w.solana as PhantomProvider;
    if (w?.phantom?.solana?.isPhantom) return w.phantom.solana as PhantomProvider;
    return undefined;
  }, []);
}

/** UI state */
type State =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "gettingNonce" }
  | { kind: "signing" }
  | { kind: "verifying" }
  | { kind: "success"; userId?: string }
  | { kind: "error"; message: string; hint?: string };

/** MAIN COMPONENT */
export default function SolanaSignIn({ onSignedIn }: { onSignedIn?: () => void }) {
  const phantom = usePhantom();
  const [addr, setAddr] = useState<string>("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const connect = useCallback(async () => {
    if (!phantom?.connect) {
      setState({
        kind: "error",
        message: "Phantom wallet not detected.",
        hint: "Install Phantom from https://phantom.app and refresh this page.",
      });
      return;
    }
    try {
      setState({ kind: "connecting" });
      const res = await phantom.connect({ onlyIfTrusted: false });
      const pk: any = res?.publicKey;
      const base58 = pk?.toBase58?.() ?? pk?.toString?.();
      if (!base58) throw new Error("Could not read wallet address.");
      setAddr(base58);
      setState({ kind: "idle" });
    } catch (e: any) {
      setState({ kind: "error", message: e?.message || "Failed to connect Phantom." });
    }
  }, [phantom]);

  const signIn = useCallback(async () => {
    try {
      if (!API_BASE) throw new Error("VITE_API_BASE is not configured.");
      const wallet = addr || (await (async () => {
        const res = await phantom!.connect({ onlyIfTrusted: false });
        const pk: any = res?.publicKey;
        const base58 = pk?.toBase58?.() ?? pk?.toString?.();
        if (!base58) throw new Error("Could not read wallet address.");
        setAddr(base58);
        return base58;
      })());

      // 1) Fetch nonce + message
      setState({ kind: "gettingNonce" });
      const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${encodeURIComponent(wallet)}`, {
        method: "GET",
        credentials: "include",
      });
      if (!nonceRes.ok) {
        throw {
          message: `Nonce request failed (${nonceRes.status})`,
          hint: "Ensure API CORS allows your Vercel domain and uses SameSite=None; Secure cookies.",
        };
      }
      const { message } = await nonceRes.json();
      if (!message) throw new Error("Nonce response missing message.");

      // 2) Wallet signs exact message
      if (!phantom?.signMessage) {
        throw {
          message: "Phantom 'signMessage' unavailable.",
          hint: "Enable Message Signing in Phantom → Settings → Developer.",
        };
      }
      setState({ kind: "signing" });
      const { signature } = await phantom.signMessage(toBytes(message), "utf8");
      const signatureBase58 = base58Encode(signature);

      // 3) Verify
      setState({ kind: "verifying" });
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, signatureBase58, message }),
      });
      if (!verifyRes.ok) {
        const txt = await verifyRes.text().catch(() => "");
        throw {
          message: `Verify failed (${verifyRes.status})${txt ? `: ${txt}` : ""}`,
          hint: verifyRes.status === 400
            ? "Nonce or message missing/invalid. Open DevTools → Network and inspect /auth/nonce + /auth/verify."
            : "Server error. Check API logs.",
        };
      }
      const j = await verifyRes.json();
      if (j?.token) {
        try { localStorage.setItem("authToken", j.token); } catch {}
      }
      setState({ kind: "success", userId: j?.userId });
      onSignedIn?.();
    } catch (e: any) {
      setState({ kind: "error", message: e?.message || "Sign-in failed.", hint: e?.hint });
    }
  }, [addr, phantom, onSignedIn]);

  const disconnect = useCallback(async () => {
    try { await phantom?.disconnect?.(); } catch {}
    setAddr("");
    setState({ kind: "idle" });
  }, [phantom]);

  const busy = ["connecting", "gettingNonce", "signing", "verifying"].includes(state.kind);

  return (
    <div className="wrap">
      <style>{styles}</style>

      {/* animated background */}
      <div className="glow g1" />
      <div className="glow g2" />
      <div className="grid" />
      <div className="noise" />

      <div className="card">
        {/* brand */}
        <div className="brand">
          <div className="logo">F</div>
          <div className="titles">
            <h1>Sign in with Solana</h1>
            <p>Secure access with your Phantom wallet.</p>
          </div>
        </div>

        {/* wallet pill */}
        {addr ? (
          <div className="pill">
            <span className="pill-key">Wallet</span>
            <span className="pill-val">{addr}</span>
            <button className="pill-btn" onClick={disconnect} disabled={busy}>Disconnect</button>
          </div>
        ) : (
          <div className="pill faded">
            <span className="pill-key">Wallet</span>
            <span className="pill-val">Not connected</span>
          </div>
        )}

        {/* actions */}
        <div className="actions">
          {!addr ? (
            <button className="btn primary" onClick={connect} disabled={busy}>
              {state.kind === "connecting" ? "Connecting…" : "Connect Phantom"}
            </button>
          ) : (
            <button className="btn primary" onClick={signIn} disabled={busy}>
              {state.kind === "gettingNonce" ? "Preparing…" :
               state.kind === "signing"       ? "Signing…"   :
               state.kind === "verifying"     ? "Verifying…" : "Sign In"}
            </button>
          )}
        </div>

        {/* feedback */}
        <div className="status">
          {state.kind === "error" && (
            <div className="alert error">
              <div>Auth error: {state.message}</div>
              {state.hint && <div className="hint">{state.hint}</div>}
            </div>
          )}
          {state.kind === "success" && (
            <div className="alert ok">
              <div>✅ Signed in successfully</div>
              {state.userId && <div className="hint">User: {state.userId}</div>}
            </div>
          )}
          {busy && <div className="spinner" aria-label="Working…" />}
        </div>

        {/* tips */}
        <div className="tips">
          <div>Tip: If the Phantom popup doesn’t appear, click the Phantom extension icon in your toolbar.</div>
          {!API_BASE && <div className="warn">Missing VITE_API_BASE – set it in your Vercel project env.</div>}
        </div>
      </div>
    </div>
  );
}

/** CSS: neon glassmorphism + subtle animation, responsive */
const styles = String.raw`
:root {
  --bg: #070a13;
  --card: rgba(255,255,255,0.06);
  --stroke: rgba(255,255,255,0.14);
  --text: #e9ecf3;
  --muted: #aab1c3;
  --accentA: #7c3aed;  /* violet */
  --accentB: #06b6d4;  /* cyan */
  --accentC: #22c55e;  /* green */
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, "Helvetica Neue", Arial; }
.wrap { position: relative; min-height: 100dvh; display: grid; place-items: center; overflow: hidden; }

/* ambient effects */
.glow { position: absolute; width: 70vmax; height: 70vmax; filter: blur(90px); opacity: .55; border-radius: 50%; pointer-events: none; }
.g1 { background: radial-gradient(circle at 30% 30%, var(--accentA), transparent 60%); top:-25vmax; left:-25vmax; animation: float1 18s ease-in-out infinite; }
.g2 { background: radial-gradient(circle at 70% 60%, var(--accentB), transparent 60%); bottom:-30vmax; right:-30vmax; animation: float2 22s ease-in-out infinite; }
@keyframes float1 { 0%,100%{ transform: translate3d(0,0,0);} 50%{ transform: translate3d(4vmax,2vmax,0);} }
@keyframes float2 { 0%,100%{ transform: translate3d(0,0,0);} 50%{ transform: translate3d(-3vmax,-2vmax,0);} }

.grid { position:absolute; inset:-10%; background:
  linear-gradient(to right, rgba(255,255,255,.06) 1px, transparent 1px) 0 0/32px 32px,
  linear-gradient(to bottom, rgba(255,255,255,.06) 1px, transparent 1px) 0 0/32px 32px;
  mask-image: radial-gradient(circle at 50% 50%, #000, transparent 70%); opacity:.25; }
.noise { position:absolute; inset:-10%; background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>' ); opacity:.04; mix-blend-mode: overlay; }

/* card */
.card { position: relative; z-index: 1; width: min(92vw, 560px); padding: 24px; border-radius: 18px;
  background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.06));
  border: 1px solid var(--stroke); backdrop-filter: blur(8px); box-shadow: 0 20px 80px rgba(0,0,0,.45);
}

/* brand */
.brand { display:flex; align-items:center; gap:14px; margin-bottom: 14px; }
.logo { width:56px; height:56px; border-radius:14px; display:grid; place-items:center;
  background: conic-gradient(from 220deg, var(--accentA), var(--accentB), var(--accentC));
  color:#fff; font-weight:900; font-size:20px; }
.titles h1 { margin:0; font-size:22px; font-weight:900; letter-spacing:.3px; }
.titles p { margin:2px 0 0; color: var(--muted); }

/* pill */
.pill { display:flex; align-items:center; gap:10px; margin-top: 8px; padding:12px; border-radius:12px;
  border:1px solid var(--stroke); background: rgba(255,255,255,.05); }
.pill.faded { color: var(--muted); }
.pill-key { opacity:.8; font-size:12px; }
.pill-val { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; word-break:break-all; flex:1; }
.pill-btn { border:1px solid var(--stroke); background: transparent; color: var(--text); border-radius:10px; padding:8px 10px; cursor:pointer; }

/* actions */
.actions { display:flex; gap:12px; margin-top: 16px; }
.btn { position:relative; display:inline-flex; align-items:center; justify-content:center; gap:8px;
  padding:12px 16px; border-radius:12px; border:1px solid transparent; cursor:pointer; font-weight:800; }
.btn.primary {
  background: linear-gradient(90deg, var(--accentA), var(--accentB));
  color:#fff; box-shadow: 0 10px 30px rgba(124,58,237,.35);
}
.btn.primary:hover { filter: brightness(1.05); transform: translateY(-1px); }
.btn[disabled] { opacity:.6; cursor: not-allowed; transform:none !important; }

/* feedback */
.status { min-height: 48px; display:grid; align-items:center; margin-top: 14px; }
.alert { border-radius:12px; padding:12px; border:1px solid; }
.alert.error { border-color: rgba(255,60,60,.4); background: rgba(255,0,0,.08); color:#ffdcdc; }
.alert.ok    { border-color: rgba(34,197,94,.4); background: rgba(34,197,94,.10); color:#d8ffe7; }
.hint { opacity:.85; font-size:12px; margin-top: 6px; }

/* spinner */
.spinner {
  width: 22px; height: 22px; margin: 6px auto; border-radius: 50%;
  border: 3px solid rgba(255,255,255,.25); border-top-color: #fff; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(1turn); } }

/* tips */
.tips { margin-top: 10px; color: var(--muted); font-size: 12px; }
.warn { margin-top:6px; color: #ffc9c9; }

/* responsive */
@media (max-width: 420px) {
  .card { padding: 18px; }
  .logo { width:48px; height:48px; border-radius:12px; }
  .titles h1 { font-size: 20px; }
}
`;

// src/pages/SolanaSignIn.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";

/** API base resolver: env → window.__API_BASE__ → fallback */
function resolveApiBase(): { base: string; usedFallback: boolean } {
  const envBase =
    (import.meta as any)?.env?.VITE_API_BASE ||
    (typeof window !== "undefined" && (window as any).__API_BASE__) ||
    "";
  const trimmed = String(envBase || "").trim().replace(/\/+$/, "");
  if (trimmed) return { base: trimmed, usedFallback: false };

  const isDev =
    typeof window !== "undefined" &&
    /localhost|127\.0\.0\.1/.test(window.location.hostname);

  const fallback = isDev ? "http://localhost:4000" : "https://fst-api.onrender.com";
  return { base: fallback, usedFallback: true };
}
const { base: API_BASE, usedFallback: USED_FALLBACK } = resolveApiBase();

/** utils */
const toBytes = (s: string) => new TextEncoder().encode(s);

// robust base64 for Uint8Array (no Buffer, no deps)
function toBase64(u8: Uint8Array): string {
  let bin = "";
  // build in chunks to avoid stack issues on large arrays
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    const sub = u8.subarray(i, i + CHUNK);
    bin += String.fromCharCode.apply(null, Array.from(sub) as any);
  }
  // btoa expects binary string
  return btoa(bin);
}

/** Phantom typings */
type PhantomPublicKey = { toBase58?: () => string; toString?: () => string };
type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: PhantomPublicKey | null;
  connect?: (opts?: any) => Promise<{ publicKey: PhantomPublicKey }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>;
  on?: (ev: "connect" | "disconnect" | "accountChanged", cb: (...a: any[]) => void) => void;
  providers?: Record<string, PhantomProvider>;
};

declare global {
  interface Window {
    solana?: PhantomProvider & { isPhantom?: boolean };
    phantom?: { solana?: PhantomProvider };
    __API_BASE__?: string;
  }
}

/** Provider detection */
function usePhantom(): PhantomProvider | undefined {
  return useMemo(() => {
    const w = typeof window !== "undefined" ? (window as any) : undefined;
    if (!w) return undefined;
    const multi = w?.solana?.providers;
    if (multi && typeof multi === "object") {
      const phantom = Object.values(multi as Record<string, PhantomProvider>).find(p => p?.isPhantom);
      if (phantom) return phantom;
    }
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

export default function SolanaSignIn({ onSignedIn }: { onSignedIn?: () => void }) {
  const phantom = usePhantom();
  const [addr, setAddr] = useState<string>("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = ["connecting", "gettingNonce", "signing", "verifying"].includes(state.kind);

  // events
  useEffect(() => {
    if (!phantom?.on) return;
    const onConnect = () => {
      const pk: any = phantom.publicKey;
      const base58 = pk?.toBase58?.() ?? pk?.toString?.();
      if (base58) setAddr(base58);
    };
    const onDisconnect = () => setAddr("");
    const onAccount = (pk: PhantomPublicKey | string | null) => {
      const anyPk: any = pk;
      const base58 = anyPk?.toBase58?.() ?? anyPk?.toString?.();
      setAddr(base58 || "");
    };
    phantom.on("connect", onConnect);
    phantom.on("disconnect", onDisconnect);
    phantom.on("accountChanged", onAccount);
    return () => {};
  }, [phantom]);

  const connect = useCallback(async () => {
    if (!phantom?.connect) {
      setState({
        kind: "error",
        message: "Phantom not detected",
        hint: "Desktop: install the Phantom extension. Mobile: open this site inside the Phantom app.",
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
      const msg = e?.message || "Failed to connect Phantom.";
      const rejected = /User rejected/i.test(msg);
      setState({
        kind: "error",
        message: rejected ? "Connection cancelled" : msg,
        hint: rejected ? "Click Connect Phantom again and approve the request in the extension." : undefined,
      });
    }
  }, [phantom]);

  const signIn = useCallback(async () => {
    try {
      const wallet = addr || (await (async () => {
        const res = await phantom!.connect?.({ onlyIfTrusted: false });
        const pk: any = res?.publicKey;
        const base58 = pk?.toBase58?.() ?? pk?.toString?.();
        if (!base58) throw new Error("Could not read wallet address.");
        setAddr(base58);
        return base58;
      })());

      // 1) Nonce + message
      setState({ kind: "gettingNonce" });
      const r = await fetch(`${API_BASE}/auth/nonce?wallet=${encodeURIComponent(wallet)}`, {
        credentials: "include",
      });
      if (!r.ok) {
        throw {
          message: `Nonce request failed (${r.status})`,
          hint: "Ensure API CORS allows your domain and cookies are SameSite=None; Secure.",
        };
      }
      const j = await r.json();
      const message = j?.message;
      if (!message) throw new Error("Nonce response missing message.");

      // 2) Sign exact message
      if (!phantom?.signMessage) {
        throw {
          message: "Phantom 'signMessage' unavailable.",
          hint: "Enable Message Signing in Phantom → Settings → Developer.",
        };
      }
      setState({ kind: "signing" });
      const { signature } = await phantom.signMessage(toBytes(message), "utf8");

      // Sanity: signature should be 64 bytes for ed25519
      if (!(signature instanceof Uint8Array) || signature.length < 64) {
        console.warn("Unexpected signature shape/length:", signature);
      }

      // ✅ Send Base64 (server accepts 'signature' as Base64)
      const signatureBase64 = toBase64(signature);

      // 3) Verify (with debug logs)
      setState({ kind: "verifying" });
      const verifyPayload = { walletAddress: wallet, signature: signatureBase64, message };
      console.log("[verify payload]", verifyPayload);

      const v = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verifyPayload),
      });

      const bodyText = await v.text().catch(() => "");
      console.log("[verify response]", v.status, bodyText);

      if (!v.ok) {
        throw {
          message: `Verify failed (${v.status})${bodyText ? `: ${bodyText}` : ""}`,
          hint:
            v.status === 400
              ? "Nonce/message/signature issue. Check the payload printed above."
              : "Server error. Check API logs.",
        };
      }

      const out = bodyText ? JSON.parse(bodyText) : {};
      if (out?.token) {
        try { localStorage.setItem("authToken", out.token); } catch {}
      }
      setState({ kind: "success", userId: out?.userId });
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

  // mobile helpers
  const here = typeof window !== "undefined" ? window.location.origin : "";
  const mobilePhantomDeepLink = `phantom://browse/${encodeURIComponent(here)}`;
  const mobilePhantomUniversal = `https://phantom.app/ul/browse/${encodeURIComponent(here)}`;

  return (
    <div className="wrap">
      <style>{styles}</style>

      <div className="glow g1" />
      <div className="glow g2" />
      <div className="grid" />

      <div className="card">
        <div className="brand">
          <div className="logo">F</div>
          <div className="titles">
            <h1>Sign in with Solana</h1>
            <p>Professional, secure sign-in with your Phantom wallet.</p>
          </div>
        </div>

        <div className="tiny">
          API: <code>{API_BASE}</code>
          {USED_FALLBACK && <span className="hint"> (fallback in use; set VITE_API_BASE to override)</span>}
        </div>

        {!phantom && (
          <div className="install">
            <div className="alert note">
              <div><strong>Phantom not detected.</strong></div>
              <div className="hint">Desktop: install the Phantom extension and refresh. Mobile: open this site inside the Phantom app.</div>
            </div>
            <div className="cta-row">
              <a className="btn primary" href="https://phantom.app/" target="_blank" rel="noreferrer">Install Phantom</a>
              <a className="btn muted" href={mobilePhantomUniversal}>Open in Phantom</a>
              <a className="btn muted" href={mobilePhantomDeepLink}>phantom:// link</a>
            </div>
          </div>
        )}

        {addr ? (
          <div className="pill">
            <span className="pill-key">Wallet</span>
            <span className="pill-val">{addr}</span>
            <button className="pill-btn" onClick={disconnect} disabled={busy}>Disconnect</button>
          </div>
        ) : (
          phantom && (
            <div className="pill faded">
              <span className="pill-key">Wallet</span>
              <span className="pill-val">Not connected</span>
            </div>
          )
        )}

        <div className="actions">
          {!addr ? (
            phantom && (
              <button className="btn primary" onClick={connect} disabled={busy}>
                {state.kind === "connecting" ? "Connecting…" : "Connect Phantom"}
              </button>
            )
          ) : (
            <button className="btn primary" onClick={signIn} disabled={busy}>
              {state.kind === "gettingNonce" ? "Preparing…" :
               state.kind === "signing"       ? "Signing…"   :
               state.kind === "verifying"     ? "Verifying…" : "Sign In"}
            </button>
          )}
        </div>

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

        <div className="tips">
          <div>Tip: If no popup appears, click the Phantom extension icon.</div>
        </div>
      </div>
    </div>
  );
}

/** Styles — neon glass look */
const styles = String.raw`
:root {
  --bg: #070a13;
  --card: rgba(255,255,255,0.06);
  --stroke: rgba(255,255,255,0.14);
  --text: #e9ecf3;
  --muted: #aab1c3;
  --accentA: #7c3aed;
  --accentB: #06b6d4;
  --accentC: #22c55e;
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Inter, Roboto, "Helvetica Neue", Arial; }
.wrap { min-height: 100dvh; display: grid; place-items: center; position: relative; overflow: hidden; }
.glow { position: absolute; width: 70vmax; height: 70vmax; filter: blur(90px); opacity: .55; border-radius: 50%; pointer-events: none; }
.g1 { background: radial-gradient(circle at 30% 30%, var(--accentA), transparent 60%); top:-25vmax; left:-25vmax; animation: float1 18s ease-in-out infinite; }
.g2 { background: radial-gradient(circle at 70% 60%, var(--accentB), transparent 60%); bottom:-30vmax; right:-30vmax; animation: float2 22s ease-in-out infinite; }
@keyframes float1 { 0%,100%{ transform: translate3d(0,0,0);} 50%{ transform: translate3d(4vmax,2vmax,0);} }
@keyframes float2 { 0%,100%{ transform: translate3d(0,0,0);} 50%{ transform: translate3d(-3vmax,-2vmax,0);} }
.grid { position:absolute; inset:-10%; background:
  linear-gradient(to right, rgba(255,255,255,.06) 1px, transparent 1px) 0 0/32px 32px,
  linear-gradient(to bottom, rgba(255,255,255,.06) 1px, transparent 1px) 0 0/32px 32px;
  mask-image: radial-gradient(circle at 50% 50%, #000, transparent 70%); opacity:.25; }
.card { position: relative; z-index: 1; width: min(92vw, 560px); padding: 24px; border-radius: 18px;
  background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.06));
  border: 1px solid var(--stroke); backdrop-filter: blur(8px); box-shadow: 0 20px 80px rgba(0,0,0,.45); }
.brand { display:flex; align-items:center; gap:14px; margin-bottom: 14px; }
.logo { width:56px; height:56px; border-radius:14px; display:grid; place-items:center;
  background: conic-gradient(from 220deg, var(--accentA), var(--accentB), var(--accentC));
  color:#fff; font-weight:900; font-size:20px; }
.titles h1 { margin:0; font-size:22px; font-weight:900; letter-spacing:.3px; }
.titles p { margin:2px 0 0; color: var(--muted); }
.tiny { margin: 6px 0 2px; font-size: 12px; color: var(--muted); }
.tiny .hint { margin-left: 6px; }
.pill { display:flex; align-items:center; gap:10px; margin-top: 10px; padding:12px; border-radius:12px;
  border:1px solid var(--stroke); background: rgba(255,255,255,.05); }
.pill.faded { color: var(--muted); }
.pill-key { opacity:.8; font-size:12px; }
.pill-val { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; word-break:break-all; flex:1; }
.pill-btn { border:1px solid var(--stroke); background: transparent; color: var(--text); border-radius:10px; padding:8px 10px; cursor:pointer; }
.actions { display:flex; gap:12px; margin-top: 16px; }
.btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:12px 16px; border-radius:12px; border:1px solid transparent; cursor:pointer; font-weight:800; }
.btn.primary { background: linear-gradient(90deg, var(--accentA), var(--accentB)); color:#fff; box-shadow: 0 10px 30px rgba(124,58,237,.35); }
.btn.muted { background: transparent; border:1px solid var(--stroke); color: var(--text); }
.btn[disabled] { opacity:.6; cursor: not-allowed; }
.status { min-height: 54px; display:grid; align-items:center; margin-top: 14px; }
.alert { border-radius:12px; padding:12px; border:1px solid; }
.alert.error { border-color: rgba(255,60,60,.4); background: rgba(255,0,0,.08); color:#ffdcdc; }
.alert.ok { border-color: rgba(34,197,94,.4); background: rgba(34,197,94,.10); color:#d8ffe7; }
.alert.note { border-color: rgba(6,182,212,.4); background: rgba(6,182,212,.10); color: #d1f6ff; }
.hint { opacity:.85; font-size:12px; margin-top: 6px; }
.spinner { width: 22px; height: 22px; margin: 6px auto; border-radius: 50%; border: 3px solid rgba(255,255,255,.25); border-top-color: #fff; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(1turn); } }
.tips { margin-top: 10px; color: var(--muted); font-size: 12px; }
.warn { margin-top:6px; color: #ffc9c9; }
`;

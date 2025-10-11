import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, getNonce, verifySignature, toBytes, base58Encode, isProd } from "../api";

/* ---------------------------------- types --------------------------------- */
type Status =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "gettingNonce" }
  | { kind: "signing" }
  | { kind: "verifying" }
  | { kind: "success"; userId: string; token?: string }
  | { kind: "error"; message: string; hint?: string };

type PhantomLike = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: { toBase58?: () => string; toString?: () => string };
  connect: (opts?: any) => Promise<{ publicKey: { toBase58?: () => string; toString?: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, displayEncoding?: string) => Promise<{ signature: Uint8Array }>;
  on?: (ev: string, cb: (...args: any[]) => void) => void;
  off?: (ev: string, cb: (...args: any[]) => void) => void;
};

/* ------------------------------- small utils ------------------------------ */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}
function detectPhantom(): PhantomLike | undefined {
  const w = typeof window !== "undefined" ? (window as any) : undefined;
  if (!w) return undefined;
  const p1 = w.solana;
  const p2 = w.phantom?.solana;
  if (p1?.isPhantom) return p1 as PhantomLike;
  if (p2?.isPhantom) return p2 as PhantomLike;
  if (p1?.connect && (p1?.publicKey || p1?.isConnected)) return p1 as PhantomLike;
  return undefined;
}
function redirectAfterLogin() {
  const url = new URL(window.location.href);
  const next = url.searchParams.get("next") || "/homehub";
  window.location.assign(next);
}

/* -------------------------------- component ------------------------------- */
export default function SignInWithWallet() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [address, setAddress] = useState<string>("");
  const provider = useMemo(detectPhantom, []);

  // auto-wire wallet events (if any)
  useEffect(() => {
    if (!provider?.on) return;
    const onConnect = () => {
      const pk: any = provider.publicKey;
      const base58 =
        (pk?.toBase58?.() as string | undefined) ??
        (pk?.toString?.() as string | undefined) ??
        "";
      if (base58) setAddress(base58);
      if (status.kind === "connecting") setStatus({ kind: "idle" }); // clear limbo if wallet connected separately
    };
    provider.on("connect", onConnect);
    return () => { provider.off?.("connect", onConnect); };
  }, [provider, status.kind]);

  const connectWallet = useCallback(async (): Promise<string> => {
    // If already have address, do NOT reconnect (prevents stuck "connecting")
    if (address) return address;

    if (!provider || !provider.connect) {
      throw Object.assign(new Error("Phantom wallet not detected."), {
        hint: "Install Phantom (https://phantom.app/) and reload. On mobile, open this site inside Phantom’s in-app browser.",
      });
    }
    setStatus({ kind: "connecting" });
    const res = await withTimeout(provider.connect({ onlyIfTrusted: false }), 15000, "Wallet connect");
    const pkAny = res?.publicKey as any;
    const pub: string =
      (pkAny?.toBase58?.() as string | undefined) ??
      (pkAny?.toString?.() as string | undefined) ??
      "";
    if (!pub) throw new Error("Could not read wallet address from Phantom.");
    setAddress(pub);
    setStatus({ kind: "idle" }); // reset visible step after successful connect
    return pub;
  }, [provider, address]);

  const signIn = useCallback(async () => {
    try {
      // always start with a clean state
      setStatus({ kind: "idle" });

      if (!API_BASE) {
        throw Object.assign(new Error("Missing VITE_API_BASE in production."), {
          hint: "Vercel → Settings → Environment Variables: set VITE_API_BASE to your Render API URL and redeploy.",
        });
      }

      // connect only if NOT already connected
      const wallet = address || (await connectWallet());

      // 1) nonce
      setStatus({ kind: "gettingNonce" });
      const nonceData = await withTimeout(getNonce(wallet), 15000, "GET /auth/nonce");
      if (!nonceData?.message) throw new Error("Server did not return a signing message.");

      // 2) sign
      if (!provider?.signMessage) {
        throw Object.assign(new Error("Phantom cannot sign messages."), {
          hint: "In Phantom → Settings → Developer, enable Message Signing.",
        });
      }
      setStatus({ kind: "signing" });
      const { signature } = await withTimeout(
        provider.signMessage(toBytes(nonceData.message), "utf8"),
        15000,
        "wallet.signMessage"
      );
      const signatureBase58 = base58Encode(signature);

      // 3) verify
      setStatus({ kind: "verifying" });
      const verify = await withTimeout(
        verifySignature({ walletAddress: wallet, signatureBase58 }),
        15000,
        "POST /auth/verify"
      );

      setStatus({ kind: "success", userId: verify.userId, token: verify.token });
      redirectAfterLogin();
    } catch (e: any) {
      setStatus({
        kind: "error",
        message: typeof e?.message === "string" ? e.message : "Something went wrong",
        hint: e?.hint,
      });
    }
  }, [address, connectWallet, provider]);

  const disconnect = useCallback(async () => {
    try { await provider?.disconnect?.(); } catch {}
    setAddress("");
    setStatus({ kind: "idle" });
  }, [provider]);

  const isBusy =
    status.kind === "connecting" ||
    status.kind === "gettingNonce" ||
    status.kind === "signing" ||
    status.kind === "verifying";

  const showInstall = !provider || (!provider.isPhantom && !provider.connect);

  /* --------------------------------- UI ---------------------------------- */
  return (
    <div style={pageWrap}>
      <div style={card}>
        {/* Branding */}
        <div style={brandRow}>
          <div style={logoCircle}>
            {/* minimalist Solana-ish stripes */}
            <div style={stripe} />
            <div style={{ ...stripe, opacity: 0.85 }} />
            <div style={{ ...stripe, opacity: 0.7 }} />
          </div>
          <div>
            <h1 style={h1}>Sign in with Solana</h1>
            <p style={subtle}>Secure sign in using your Phantom wallet.</p>
          </div>
        </div>

        {/* Address */}
        {address ? (
          <div style={infoRow}>
            <span style={label}>Wallet</span>
            <span style={mono}>{address}</span>
          </div>
        ) : (
          <div style={placeholderBox}>No wallet connected.</div>
        )}

        {/* Actions */}
        <div style={btnRow}>
          {showInstall ? (
            <>
              <a href="https://phantom.app/" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <button style={btnPrimary}>Install Phantom</button>
              </a>
              <button style={btnGhost} onClick={() => window.location.reload()}>Reload</button>
            </>
          ) : !address ? (
            <button onClick={connectWallet} disabled={isBusy} style={btnPrimary}>
              {status.kind === "connecting" ? "Connecting…" : "Connect Phantom"}
            </button>
          ) : (
            <>
              <button onClick={disconnect} disabled={isBusy} style={btnGhost}>
                Disconnect
              </button>
              <button onClick={signIn} disabled={isBusy} style={btnPrimary}>
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

        {/* Feedback */}
        {status.kind === "error" && (
          <div style={errorBox}>
            <strong>Auth error:</strong> {status.message}
            {status.hint && <div style={{ marginTop: 6, opacity: 0.85 }}>{status.hint}</div>}
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              If it fails at “Getting nonce…” or “Verifying…”, ensure your API CORS allows your Vercel domain and sets cookies with <code>SameSite=None; Secure</code>.
            </div>
          </div>
        )}

        {isBusy && (
          <div style={busyRow}>
            <div style={spinner} />
            <div style={{ marginLeft: 8 }}>
              {status.kind === "connecting" && "Connecting to Phantom…"}
              {status.kind === "gettingNonce" && "Requesting server nonce…"}
              {status.kind === "signing" && "Waiting for wallet signature…"}
              {status.kind === "verifying" && "Verifying signature…"}
            </div>
          </div>
        )}

        {!isProd && (
          <div style={devNote}>
            API: <code style={mono}>{API_BASE || "(missing VITE_API_BASE)"}</code>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- styles -------------------------------- */
const pageWrap: React.CSSProperties = {
  minHeight: "100svh",
  display: "grid",
  placeItems: "center",
  background:
    "radial-gradient(1200px 600px at 10% -10%, rgba(168,85,247,.15), transparent 60%), radial-gradient(1000px 500px at 110% 110%, rgba(34,197,94,.12), transparent 60%), linear-gradient(180deg, #0b0b0b, #111)",
  color: "#e5e7eb",
};
const card: React.CSSProperties = {
  width: "min(560px, 92vw)",
  background: "rgba(20,20,20,.8)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 10px 40px rgba(0,0,0,.35)",
  backdropFilter: "blur(6px)",
};
const brandRow: React.CSSProperties = { display: "flex", gap: 14, alignItems: "center", marginBottom: 10 };
const logoCircle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: "50%", background: "#0f172a", display: "grid", placeItems: "center",
  border: "1px solid rgba(255,255,255,.1)", position: "relative", overflow: "hidden"
};
const stripe: React.CSSProperties = { width: 26, height: 4, borderRadius: 4, background: "linear-gradient(90deg, #a78bfa, #34d399)" };
const h1: React.CSSProperties = { margin: 0, fontSize: 22, letterSpacing: .2 };
const subtle: React.CSSProperties = { margin: 0, opacity: .75, fontSize: 13 };
const infoRow: React.CSSProperties = {
  display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, wordBreak: "break-all", marginTop: 8
};
const label: React.CSSProperties = { opacity: .75, fontSize: 12 };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const placeholderBox: React.CSSProperties = {
  marginTop: 8, padding: "10px 12px", borderRadius: 10, border: "1px dashed rgba(255,255,255,.15)", opacity: .7
};
const btnRow: React.CSSProperties = { display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" };
const btnPrimary: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 10, border: "1px solid #6ee7b7", background: "linear-gradient(90deg,#22c55e,#a78bfa)",
  color: "#0a0a0a", fontWeight: 600, cursor: "pointer"
};
const btnGhost: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", background: "transparent",
  color: "#e5e7eb", cursor: "pointer"
};
const errorBox: React.CSSProperties = {
  marginTop: 12, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.4)", color: "#fecaca",
  padding: 12, borderRadius: 10
};
const busyRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginTop: 10, opacity: .95 };
const spinner: React.CSSProperties = {
  width: 16, height: 16, borderRadius: "50%",
  border: "2px solid rgba(255,255,255,.25)", borderTopColor: "#fff", animation: "spin .8s linear infinite"
} as any;
const devNote: React.CSSProperties = { fontSize: 12, opacity: .7, marginTop: 12 };

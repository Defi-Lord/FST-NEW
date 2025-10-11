import React, { useCallback, useMemo, useState } from "react";
import { API_BASE, getNonce, verifySignature, toBytes, base58Encode, isProd } from "./api";

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

// ------- small helpers with timeout -------
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

// Many sites expose provider at window.solana; some wallets also put window.phantom?.solana
function detectPhantom(): PhantomLike | undefined {
  const w = typeof window !== "undefined" ? (window as any) : undefined;
  if (!w) return undefined;
  const p1 = w.solana;
  const p2 = w.phantom?.solana;
  if (p1?.isPhantom) return p1 as PhantomLike;
  if (p2?.isPhantom) return p2 as PhantomLike;
  // Some mobile in-app browsers inject provider without isPhantom flag
  if (p1?.connect && (p1?.publicKey || p1?.isConnected)) return p1 as PhantomLike;
  return undefined;
}

export default function SignInWithSolana() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [address, setAddress] = useState<string>("");

  const provider = useMemo(detectPhantom, []);

  const connectWallet = useCallback(async (): Promise<string> => {
    if (!provider || !provider.connect) {
      throw Object.assign(new Error("Phantom wallet not detected."), {
        hint:
          "Install Phantom, then refresh. On desktop: https://phantom.app/ . On mobile, open this site inside Phantom’s in-app browser.",
      });
    }
    setStatus({ kind: "connecting" });
    // connect() must be called from a user gesture (button click). We are in a handler.
    const res = await withTimeout(provider.connect({ onlyIfTrusted: false }), 15000, "Wallet connect");
    const pkAny = res?.publicKey as any;
    const pub: string =
      (pkAny?.toBase58?.() as string | undefined) ??
      (pkAny?.toString?.() as string | undefined) ??
      "";
    if (!pub) throw new Error("Could not read wallet address from Phantom.");
    setAddress(pub);
    return pub;
  }, [provider]);

  const signIn = useCallback(async () => {
    try {
      if (!API_BASE) {
        throw Object.assign(
          new Error("Missing VITE_API_BASE in production."),
          { hint: "In Vercel → Project → Settings → Environment Variables, set VITE_API_BASE to your Render API URL." }
        );
      }

      const wallet = address || (await connectWallet());

      // 1) GET /auth/nonce (sets HttpOnly nonce cookie)
      setStatus({ kind: "gettingNonce" });
      const nonceData = await withTimeout(
        getNonce(wallet),
        15000,
        "GET /auth/nonce"
      );
      if (!nonceData?.message) {
        throw new Error("Server did not return a signing message.");
      }

      // 2) Sign exact message
      if (!provider?.signMessage) {
        throw Object.assign(new Error("Phantom cannot sign messages."), {
          hint: "Open Phantom → Settings → Developer → enable Message Signing, then retry.",
        });
      }
      setStatus({ kind: "signing" });
      const { signature } = await withTimeout(
        provider.signMessage(toBytes(nonceData.message), "utf8"),
        15000,
        "wallet.signMessage"
      );
      const signatureBase58 = base58Encode(signature);

      // 3) POST /auth/verify (sets auth cookie + returns token)
      setStatus({ kind: "verifying" });
      const verify = await withTimeout(
        verifySignature({ walletAddress: wallet, signatureBase58 }),
        15000,
        "POST /auth/verify"
      );

      // Optional: token is also stored in localStorage by your api.ts verify handler (if you choose)
      setStatus({ kind: "success", userId: verify.userId, token: verify.token });
    } catch (e: any) {
      const msg = typeof e?.message === "string" ? e.message : "Something went wrong";
      const hint = e?.hint;
      setStatus({ kind: "error", message: msg, hint });
    }
  }, [address, connectWallet, provider]);

  const disconnect = useCallback(async () => {
    try {
      await provider?.disconnect?.();
    } catch {}
    setAddress("");
    setStatus({ kind: "idle" });
  }, [provider]);

  const disabled =
    status.kind === "connecting" ||
    status.kind === "gettingNonce" ||
    status.kind === "signing" ||
    status.kind === "verifying";

  const showInstall =
    !provider ||
    (!provider.isPhantom && !provider.connect);

  return (
    <div style={card}>
      <h2 style={{ marginTop: 0 }}>Sign in with Solana</h2>

      {address ? (
        <p style={muted}>
          Connected: <span style={mono}>{address}</span>
        </p>
      ) : (
        <p style={muted}>No wallet connected.</p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {showInstall ? (
          <>
            <a href="https://phantom.app/" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <button style={btnPrimary}>Install Phantom</button>
            </a>
            <button
              style={btnSecondary}
              onClick={() => window.location.reload()}
              title="Reload after installing Phantom"
            >
              Reload
            </button>
          </>
        ) : !address ? (
          <button onClick={connectWallet} disabled={disabled} style={btnPrimary}>
            {status.kind === "connecting" ? "Connecting…" : "Connect Phantom"}
          </button>
        ) : (
          <>
            <button onClick={disconnect} disabled={disabled} style={btnSecondary}>
              Disconnect
            </button>
            <button onClick={signIn} disabled={disabled} style={btnPrimary}>
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

      <div style={{ marginTop: 16 }}>
        {status.kind === "error" && (
          <div style={errorBox}>
            <strong>Auth Error:</strong> {status.message}
            {status.hint && <div style={{ marginTop: 6, opacity: 0.85 }}>{status.hint}</div>}
            {/* CORS & cookies hint */}
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              If this happens at “Getting nonce…” or “Verifying…”, check your API CORS & cookies (see checklist below).
            </div>
          </div>
        )}
        {status.kind === "success" && (
          <div style={okBox}>
            <div>✅ Signed in!</div>
            <div>User ID: {status.userId}</div>
            {status.token && (
              <div style={{ marginTop: 6 }}>
                JWT: <code style={mono}>{status.token}</code>
              </div>
            )}
          </div>
        )}
        {(status.kind === "connecting" ||
          status.kind === "gettingNonce" ||
          status.kind === "signing" ||
          status.kind === "verifying") && <div>Working…</div>}
      </div>

      {/* Dev-only debug (hidden in prod) */}
      {!isProd && (
        <p style={{ marginTop: 16, fontSize: 12, opacity: 0.8 }}>
          Dev: API = <code style={mono}>{API_BASE || "(missing VITE_API_BASE)"}</code>. If signing fails, enable{" "}
          <em>Message Signing</em> in Phantom (Settings → Developer).
        </p>
      )}
    </div>
  );
}

/** styles */
const card: React.CSSProperties = {
  maxWidth: 520,
  margin: "24px auto",
  padding: 16,
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: 12,
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #999",
  background: "#fff",
  color: "#111",
  cursor: "pointer",
};
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all" };
const muted: React.CSSProperties = { margin: "8px 0", color: "#6b7280" };
const errorBox: React.CSSProperties = {
  background: "rgba(255,0,0,0.08)",
  border: "1px solid rgba(255,0,0,0.3)",
  color: "#700",
  padding: 10,
  borderRadius: 8,
};
const okBox: React.CSSProperties = {
  background: "rgba(0,180,0,0.08)",
  border: "1px solid rgba(0,180,0,0.35)",
  color: "#064",
  padding: 10,
  borderRadius: 8,
};

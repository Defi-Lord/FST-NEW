// src/components/SignInWithWallet.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";

// ---- config ----
const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

// ---- small helpers ----
const toBytes = (s: string) => new TextEncoder().encode(s);

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

type PhantomLike = {
  isPhantom?: boolean;
  publicKey?: { toBase58?: () => string; toString?: () => string };
  connect: (opts?: any) => Promise<{ publicKey?: { toBase58?: () => string; toString?: () => string } } | void>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, displayEncoding?: string) => Promise<{ signature: Uint8Array }>;
  on?: (ev: string, cb: (...args: any[]) => void) => void;
  off?: (ev: string, cb: (...args: any[]) => void) => void;
};

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

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

function redirectAfterLogin() {
  const url = new URL(window.location.href);
  const next = url.searchParams.get("next") || "/homehub";
  window.location.assign(next);
}

type Status =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "gettingNonce" }
  | { kind: "signing" }
  | { kind: "verifying" }
  | { kind: "success"; userId: string; token?: string }
  | { kind: "error"; message: string; hint?: string };

export default function SignInWithWallet() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [address, setAddress] = useState<string>("");
  const provider = useMemo(detectPhantom, []);

  useEffect(() => {
    if (!provider?.on) return;
    const onConnect = () => {
      const pk: any = provider.publicKey;
      const base58 =
        (pk?.toBase58?.() as string | undefined) ??
        (pk?.toString?.() as string | undefined) ?? "";
      if (base58) setAddress(base58);
      if (status.kind === "connecting") setStatus({ kind: "idle" });
    };
    provider.on?.("connect", onConnect);
    return () => provider.off?.("connect", onConnect);
  }, [provider, status.kind]);

  const connectWallet = useCallback(async (): Promise<string> => {
    if (address) return address;
    if (!provider?.connect) {
      throw Object.assign(new Error("Phantom wallet not detected."), {
        hint: "Install Phantom and reload. On mobile, open this site inside Phantom’s in-app browser.",
      });
    }
    setStatus({ kind: "connecting" });
    const res = await withTimeout(provider.connect({ onlyIfTrusted: false }), 15000, "Wallet connect");
    const pkAny: any = (res as any)?.publicKey ?? provider.publicKey;
    const pub =
      (pkAny?.toBase58?.() as string | undefined) ??
      (pkAny?.toString?.() as string | undefined) ?? "";
    if (!pub) throw new Error("Could not read wallet address from Phantom.");
    setAddress(pub);
    setStatus({ kind: "idle" });
    return pub;
  }, [provider, address]);

  const signIn = useCallback(async () => {
    try {
      setStatus({ kind: "idle" });
      if (!API_BASE) {
        throw Object.assign(new Error("Missing VITE_API_BASE."), {
          hint: "Set VITE_API_BASE=https://fst-api.onrender.com in Vercel env and redeploy.",
        });
      }

      const wallet = address || (await connectWallet());

      // 1) GET /auth/nonce
      setStatus({ kind: "gettingNonce" });
      const nonceRes = await withTimeout(
        fetch(`${API_BASE}/auth/nonce?wallet=${encodeURIComponent(wallet)}`, {
          method: "GET",
          credentials: "include",
        }),
        15000,
        "GET /auth/nonce"
      );
      if (!nonceRes.ok) {
        const body = await nonceRes.text().catch(() => "");
        throw new Error(`Nonce failed (${nonceRes.status}). ${body || ""}`.trim());
      }
      const nonceJson = await nonceRes.json().catch(() => null);
      const message: string | undefined = nonceJson?.message;
      if (!message) throw new Error("Server did not return a signing message.");

      // 2) wallet.signMessage(message)
      if (!provider?.signMessage) {
        throw Object.assign(new Error("Phantom cannot sign messages."), {
          hint: "Phantom → Settings → Developer → enable Message Signing.",
        });
      }
      setStatus({ kind: "signing" });
      const { signature } = await withTimeout(
        provider.signMessage(toBytes(message), "utf8"),
        15000,
        "wallet.signMessage"
      );
      const signatureBase58 = base58Encode(signature);

      // 3) POST /auth/verify
      setStatus({ kind: "verifying" });
      const verifyRes = await withTimeout(
        fetch(`${API_BASE}/auth/verify`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: wallet, signatureBase58 }),
        }),
        15000,
        "POST /auth/verify"
      );

      if (!verifyRes.ok) {
        // Show server's JSON error (helps with 400s like "Missing nonce cookie" or "Invalid signature")
        let serverMsg = "";
        try { serverMsg = (await verifyRes.json()).error || ""; } catch {}
        const fallbackText = await verifyRes.text().catch(() => "");
        throw new Error(
          `Verify failed (${verifyRes.status}). ${serverMsg || fallbackText || ""}`.trim()
        );
      }

      const data = await verifyRes.json().catch(() => null);
      const token: string | undefined = data?.token;
      const userId: string = data?.userId || wallet;

      // Save token where the app expects it
      try {
        if (token) {
          localStorage.setItem("auth_token", token);
          localStorage.setItem("authToken", token);
        }
      } catch {}

      setStatus({ kind: "success", userId, token });
      redirectAfterLogin();
    } catch (e: any) {
      setStatus({
        kind: "error",
        message: e?.message || "Something went wrong",
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

  return (
    <div style={card}>
      <h2 style={{ marginTop: 0 }}>Sign in with Solana</h2>
      <p style={{ margin: 0, opacity: 0.8 }}>Secure sign in using your Phantom wallet.</p>

      {address ? (
        <div style={infoRow}>
          <span style={label}>Wallet</span>
          <span style={mono}>{address}</span>
        </div>
      ) : (
        <div style={placeholder}>No wallet connected.</div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {!address ? (
          <button onClick={connectWallet} disabled={isBusy} style={btnPrimary}>
            {status.kind === "connecting" ? "Connecting…" : "Connect Phantom"}
          </button>
        ) : (
          <>
            <button onClick={disconnect} disabled={isBusy} style={btnSecondary}>Disconnect</button>
            <button onClick={signIn} disabled={isBusy} style={btnPrimary}>
              {status.kind === "gettingNonce" ? "Getting nonce…" :
               status.kind === "signing"      ? "Signing…" :
               status.kind === "verifying"    ? "Verifying…" : "Sign In"}
            </button>
          </>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        {status.kind === "error" && (
          <div style={errorBox}>
            <strong>Auth error:</strong> {status.message}
            {status.hint && <div style={{ marginTop: 6, opacity: .85 }}>{status.hint}</div>}
            <div style={{ marginTop: 6, opacity: .8 }}>
              If it fails at “Getting nonce…” or “Verifying…”, ensure your API CORS allows your Vercel domain and sets cookies with <code>SameSite=None; Secure</code>.
            </div>
          </div>
        )}
        {isBusy && <div>Working… ({status.kind})</div>}
      </div>
    </div>
  );
}

/* --- styles --- */
const card: React.CSSProperties = { maxWidth: 520, margin: "24px auto", padding: 16, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 };
const btnPrimary: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #999", background: "#fff", color: "#111", cursor: "pointer" };
const infoRow: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, wordBreak: "break-all", marginTop: 8 };
const label: React.CSSProperties = { opacity: .75, fontSize: 12 };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all" };
const placeholder: React.CSSProperties = { marginTop: 8, padding: "10px 12px", borderRadius: 10, border: "1px dashed rgba(255,255,255,.15)", opacity: .7 };
const errorBox: React.CSSProperties = { background: "rgba(255,0,0,0.08)", border: "1px solid rgba(255,0,0,0.3)", color: "#700", padding: 10, borderRadius: 8 };

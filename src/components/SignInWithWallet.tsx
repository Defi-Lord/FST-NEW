import React, { useCallback, useMemo, useRef, useState } from "react";

/* ===========================
   Config / helpers
=========================== */
const API_BASE = (import.meta.env?.VITE_API_BASE ?? "").toString().replace(/\/+$/, "");

const toBytes = (s: string) => new TextEncoder().encode(s);
const short = (a: string, n = 4) => (a.length > 2 * n ? `${a.slice(0, n)}…${a.slice(-n)}` : a);

function assertApi() {
  if (!API_BASE) throw new Error("VITE_API_BASE is not set. Add it in Vercel → Project → Settings → Environment Variables.");
}

/* ---- Minimal base58 (no external deps) ---- */
function base58Encode(buf: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (!buf.length) return "";
  let zeros = 0;
  while (zeros < buf.length && buf[zeros] === 0) zeros++;
  const input = buf.slice();
  const digits: number[] = [];
  for (let i = zeros; i < input.length; i++) {
    let carry = input[i];
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j] * 256 + carry;
      digits[j] = Math.floor(x / 58);
      carry = x % 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  for (let k = 0; k < zeros; k++) digits.push(0);
  return digits.reverse().map(d => ALPHABET[d]).join("");
}

/* ---- Phantom types/detect ---- */
type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58?: () => string; toString?: () => string };
  connect: (opts?: any) => Promise<{ publicKey: { toBase58?: () => string; toString?: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, displayEncoding?: string) => Promise<{ signature: Uint8Array }>;
};
declare global {
  interface Window { solana?: PhantomProvider; phantom?: { solana?: PhantomProvider } }
}
const detectPhantom = (): PhantomProvider | undefined => {
  const w = typeof window !== "undefined" ? (window as any) : undefined;
  if (!w) return;
  if (w?.solana?.isPhantom) return w.solana as PhantomProvider;
  if (w?.phantom?.solana?.isPhantom) return w.phantom.solana as PhantomProvider;
};

/* ===========================
   Component
=========================== */
type Status =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "gettingNonce" }
  | { kind: "signing" }
  | { kind: "verifying" }
  | { kind: "success"; userId?: string }
  | { kind: "error"; message: string; hint?: string };

export default function SignInWithWallet({ onDone }: { onDone?: () => void }) {
  const phantom = useMemo(detectPhantom, []);
  const [addr, setAddr] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [toast, setToast] = useState<string | null>(null);
  const copyRef = useRef<HTMLButtonElement>(null);

  const disabled =
    status.kind === "connecting" ||
    status.kind === "gettingNonce" ||
    status.kind === "signing" ||
    status.kind === "verifying";

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const connect = useCallback(async () => {
    try {
      if (!phantom) throw new Error("Phantom not found. Install Phantom and refresh.");
      setStatus({ kind: "connecting" });
      const res = await phantom.connect({ onlyIfTrusted: false });
      const pkAny = res?.publicKey as any;
      const pub = pkAny?.toBase58?.() ?? pkAny?.toString?.();
      if (!pub) throw new Error("Could not read wallet address.");
      setAddr(pub);
      showToast("Wallet connected");
    } catch (e: any) {
      setStatus({ kind: "error", message: e?.message ?? "Wallet connect failed" });
    } finally {
      if (addr) setStatus({ kind: "idle" });
    }
  }, [phantom, addr]);

  const disconnect = useCallback(async () => {
    try {
      await phantom?.disconnect?.();
      setAddr("");
      setStatus({ kind: "idle" });
      showToast("Disconnected");
    } catch {
      /* noop */
    }
  }, [phantom]);

  const signIn = useCallback(async () => {
    try {
      assertApi();
      const wallet = addr || (await (async () => { await connect(); return addr; })());
      if (!wallet) throw new Error("No wallet connected.");

      // 1) nonce
      setStatus({ kind: "gettingNonce" });
      const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${encodeURIComponent(wallet)}`, {
        method: "GET",
        credentials: "include",
      });
      if (!nonceRes.ok) {
        const txt = await nonceRes.text().catch(() => "");
        throw { message: `Nonce failed (${nonceRes.status})`, hint: txt || "Check API CORS & cookies (SameSite=None; Secure)." };
      }
      const { message } = await nonceRes.json();
      if (!message) throw new Error("Nonce response missing message.");

      // 2) sign
      if (!phantom?.signMessage) {
        throw {
          message: "Phantom cannot sign messages.",
          hint: "In Phantom → Settings → Developer → enable 'Message Signing'.",
        };
      }
      setStatus({ kind: "signing" });
      const { signature } = await phantom.signMessage(toBytes(message), "utf8");
      const signatureBase58 = base58Encode(signature);

      // 3) verify
      setStatus({ kind: "verifying" });
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, signatureBase58, message }),
      });
      if (!verifyRes.ok) {
        const txt = await verifyRes.text().catch(() => "");
        throw { message: `Verify failed (${verifyRes.status})`, hint: txt || "Ensure the exact nonce message was sent back." };
      }
      const out = await verifyRes.json();
      if (out?.token) {
        try { localStorage.setItem("authToken", out.token); } catch {}
      }
      setStatus({ kind: "success", userId: out?.userId });
      showToast("Signed in!");
      onDone?.();
    } catch (e: any) {
      setStatus({ kind: "error", message: e?.message ?? "Sign-in failed", hint: e?.hint });
    }
  }, [addr, phantom, onDone, connect]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(addr);
      copyRef.current?.classList.add("copied");
      showToast("Address copied");
      setTimeout(() => copyRef.current?.classList.remove("copied"), 900);
    } catch {}
  };

  return (
    <div className="auth-wrap">
      <style>{styles}</style>

      {/* Ambient gradient background */}
      <div className="bg">
        <div className="blob a" />
        <div className="blob b" />
        <div className="grid" />
      </div>

      {/* Card */}
      <main className="card" role="main" aria-labelledby="title">
        <div className="brand">
          <SvgLogo />
          <div className="brand-text">
            <h1 id="title">Sign in with Solana</h1>
            <p>Secure access with your Phantom wallet</p>
          </div>
        </div>

        {/* Wallet pill */}
        {addr ? (
          <div className="wallet">
            <span className="label">Wallet</span>
            <span className="addr" title={addr}>{short(addr, 6)}</span>
            <button ref={copyRef} className="copy" onClick={handleCopy} aria-label="Copy address">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2

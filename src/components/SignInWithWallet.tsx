// src/components/SignInWithWallet.tsx
import React, { useCallback, useMemo, useState } from "react";

/* ------------ Config ------------ */
const API_BASE: string = (import.meta as any).env?.VITE_API_BASE || "";

/* ------------ Small helpers ------------ */
const toBytes = (s: string) => new TextEncoder().encode(s);

function base58Encode(bytes: Uint8Array): string {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
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
  return digits.reverse().map((d) => A[d]).join("");
}

type Phantom = {
  isPhantom?: boolean;
  publicKey?: { toBase58?: () => string; toString?: () => string };
  connect: (opts?: any) => Promise<any>;
  disconnect?: () => Promise<void>;
  signMessage?: (msg: Uint8Array, enc?: string) => Promise<{ signature: Uint8Array }>;
};
const detectPhantom = (): Phantom | undefined => {
  const w = window as any;
  if (w?.solana?.isPhantom) return w.solana as Phantom;
  if (w?.phantom?.solana?.isPhantom) return w.phantom.solana as Phantom;
  return undefined;
};

type Status =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "gettingNonce" }
  | { kind: "signing" }
  | { kind: "verifying" }
  | { kind: "success"; userId: string }
  | { kind: "error"; message: string; hint?: string };

/* ------------ Component ------------ */
export default function SignInWithWallet() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [address, setAddress] = useState("");
  const phantom = useMemo(detectPhantom, []);

  const connect = useCallback(async () => {
    if (!phantom?.connect) {
      throw Object.assign(new Error("Phantom wallet not detected."), {
        hint: "Install Phantom and reload this page. On mobile, open this site in Phantom’s in-app browser.",
      });
    }
    setStatus({ kind: "connecting" });
    const res = await phantom.connect({ onlyIfTrusted: false });
    const pk: any = res?.publicKey ?? phantom.publicKey;
    const base58 = pk?.toBase58?.() ?? pk?.toString?.();
    if (!base58) throw new Error("Could not read wallet address.");
    setAddress(base58);
    setStatus({ kind: "idle" });
  }, [phantom]);

  const signIn = useCallback(async () => {
    try {
      if (!API_BASE) {
        throw Object.assign(new Error("Missing VITE_API_BASE."), {
          hint: "Set VITE_API_BASE=https://fst-api.onrender.com on Vercel and redeploy.",
        });
      }

      let wallet = address;
      if (!wallet) {
        await connect();
        wallet = address || (phantom?.publicKey?.toBase58?.() ?? phantom?.publicKey?.toString?.() ?? "");
        if (!wallet) throw new Error("Wallet not connected.");
      }

      // 1) Get nonce + message (cookie + body fallback)
      setStatus({ kind: "gettingNonce" });
      const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${encodeURIComponent(wallet)}`, {
        method: "GET",
        credentials: "include",
      });
      if (!nonceRes.ok) {
        const msg = (await nonceRes.text().catch(() => "")) || `HTTP ${nonceRes.status}`;
        throw new Error(`Nonce failed: ${msg}`);
      }
      const { message, nonce } = (await nonceRes.json()) as { message: string; nonce?: string };
      if (!message) throw new Error("Server did not return a signing message.");

      // 2) Sign exact message
      if (!phantom?.signMessage) {
        throw Object.assign(new Error("Message signing is disabled in Phantom."), {
          hint: "Phantom → Settings → Developer → enable Message Signing.",
        });
      }
      setStatus({ kind: "signing" });
      const { signature } = await phantom.signMessage(toBytes(message), "utf8");
      const signatureBase58 = base58Encode(signature);

      // 3) Verify (sends nonce in body too, so it works even if cookie is blocked)
      setStatus({ kind: "verifying" });
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, signatureBase58, nonce }),
      });
      if (!verifyRes.ok) {
        let server = "";
        try { server = (await verifyRes.json()).error || ""; } catch {}
        const fb = await verifyRes.text().catch(() => "");
        throw new Error(`Verify failed: ${server || fb || `HTTP ${verifyRes.status}`}`);
      }
      const data = await verifyRes.json();
      const token: string | undefined = data?.token;
      const userId: string = data?.userId || wallet;

      try {
        if (token) {
          localStorage.setItem("auth_token", token);
          localStorage.setItem("authToken", token);
        }
      } catch {}

      setStatus({ kind: "success", userId });
      const next = new URL(window.location.href).searchParams.get("next") || "/homehub";
      window.location.assign(next);
    } catch (e: any) {
      setStatus({ kind: "error", message: e?.message || "Something went wrong", hint: e?.hint });
    }
  }, [address, phantom, connect]);

  const disconnect = useCallback(async () => {
    try { await phantom?.disconnect?.(); } catch {}
    setAddress("");
    setStatus({ kind: "idle" });
  }, [phantom]);

  const busy = ["connecting", "gettingNonce", "signing", "verifying"].includes(status.kind);

  return (
    <div style={page}>
      <div style={glass}>
        <div style={headRow}>
          <img
            src="https://seeklogo.com/images/P/phantom-wallet-logo-106B8B7F15-seeklogo.com.png"
            alt=""
            width={28}
            height={28}
          />
          <h1 style={title}>Sign in with Solana</h1>
        </div>
        <p style={sub}>Secure sign in using your Phantom wallet.</p>

        {address ? (
          <div style={pill}>
            <span style={pillLabel}>Wallet</span>
            <span style={pillMono}>{address}</span>
          </div>
        ) : (
          <div style={ghost}>No wallet connected.</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          {!address ? (
            <button onClick={connect} disabled={busy} style={btnPrimary}>
              {status.kind === "connecting" ? "Connecting…" : "Connect Phantom"}
            </button>
          ) : (
            <>
              <button onClick={disconnect} disabled={busy} style={btnMuted}>Disconnect</button>
              <button onClick={signIn} disabled={busy} style={btnPrimary}>
                {status.kind === "gettingNonce" ? "Getting nonce…" :
                 status.kind === "signing"      ? "Signing…" :
                 status.kind === "verifying"    ? "Verifying…" : "Sign In"}
              </button>
            </>
          )}
        </div>

        {status.kind === "error" && (
          <div style={errBox}>
            <strong>Auth error:</strong> {status.message}
            {status.hint && <div style={{ marginTop: 6, opacity: .85 }}>{status.hint}</div>}
            <div style={{ marginTop: 6, opacity: .8 }}>
              Using preview domains? Add <code>https://*.vercel.app</code> to <code>CORS_ORIGIN</code> on Render.
            </div>
          </div>
        )}

        {busy && <div style={{ marginTop: 8, opacity: .8 }}>Working… ({status.kind})</div>}

        <div style={footNote}>Tip: If you don’t see the wallet popup, click the Phantom icon in your browser toolbar.</div>
      </div>
    </div>
  );
}

/* ------------ Styles (clean, single source) ------------ */
const page: React.CSSProperties = {
  minHeight: "100svh",
  display: "grid",
  placeItems: "center",
  background:
    "radial-gradient(1200px 600px at 10% 0%, #3b82f620 0%, transparent 60%)," +
    "radial-gradient(1200px 600px at 90% 100%, #a855f720 0%, transparent 60%)," +
    "#0b0c10",
  padding: 16
};
const glass: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  borderRadius: 16,
  padding: 22,
  background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
  border: "1px solid rgba(255,255,255,0.15)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  color: "#e7e9ee"
};
const headRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 };
const title: React.CSSProperties = { fontSize: 20, fontWeight: 700, margin: 0 };
const sub: React.CSSProperties = { margin: 0, opacity: 0.8 };
const pill: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  padding: "10px 12px",
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 12,
  wordBreak: "break-all",
  marginTop: 12
};
const pillLabel: React.CSSProperties = { opacity: .75, fontSize: 12 };
const pillMono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const ghost: React.CSSProperties = { marginTop: 12, padding: "10px 12px", borderRadius: 12, border: "1px dashed rgba(255,255,255,.2)", opacity: .8 };
const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #6b46c1",
  background: "linear-gradient(180deg,#7c3aed,#5b21b6)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  boxShadow: "0 6px 20px rgba(124,58,237,.35)"
};
const btnMuted: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#e7e9ee", cursor: "pointer" };
const errBox: React.CSSProperties = { background: "rgba(255,0,0,0.08)", border: "1px solid rgba(255,0,0,0.3)", color: "#ffd5d5", padding: 10, borderRadius: 10, marginTop: 12 };
const footNote: React.CSSProperties = { marginTop: 14, fontSize: 12, opacity: .75 };

import React, { useCallback, useMemo, useState } from "react";

/**
 * Reads your API base URL from Vite env.
 * Set this in:
 *  - Vercel (Production): VITE_API_BASE=https://fst-api.onrender.com
 *  - Local .env:           VITE_API_BASE=http://localhost:4000  (or your Render URL)
 */
function computeApiBase() {
  const v = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
  const base =
    (typeof v === "string" && v.length > 0
      ? v
      : typeof window !== "undefined"
      ? window.location.origin
      : "") || "";
  return base.replace(/\/+$/, "");
}
const API_BASE = computeApiBase();

/** Minimal helpers */
const toBytes = (s: string) => new TextEncoder().encode(s);

/** base58 encoder (bitcoin alphabet), typed */
function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (bytes.length === 0) return "";
  // count leading zeros
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  // convert base256 -> base58
  const input = bytes.slice(); // copy
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
  // add leading zeros
  for (let k = 0; k < zeros; k++) digits.push(0);
  // map to alphabet (reverse)
  return digits
    .reverse()
    .map((d) => ALPHABET[d])
    .join("");
}

/** Phantom types (subset) */
type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58: () => string };
  connect: () => Promise<{ publicKey: { toBase58: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>;
};

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

type Status =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "gettingNonce" }
  | { kind: "signing" }
  | { kind: "verifying" }
  | { kind: "success"; userId: string; token?: string }
  | { kind: "error"; message: string };

export default function SignInWithWallet() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [address, setAddress] = useState<string>("");

  const phantom = useMemo(() => (typeof window !== "undefined" ? window.solana : undefined), []);

  const connectWallet = useCallback(async (): Promise<string> => {
    if (!phantom || !phantom.connect) {
      throw new Error("Phantom wallet not found. Install Phantom extension/app.");
    }
    setStatus({ kind: "connecting" });
    const res = await phantom.connect();
    const pub = res.publicKey?.toBase58();
    if (!pub) throw new Error("Could not read wallet address from Phantom.");
    setAddress(pub);
    return pub;
  }, [phantom]);

  const signIn = useCallback(async () => {
    try {
      if (!API_BASE) throw new Error("Missing VITE_API_BASE. Set it in your environment.");
      const wallet = address || (await connectWallet());

      // 1) Get nonce + message (sets HttpOnly nonce cookie)
      setStatus({ kind: "gettingNonce" });
      const nonceUrl = `${API_BASE}/auth/nonce?wallet=${encodeURIComponent(wallet)}`;
      const nonceRes = await fetch(nonceUrl, {
        method: "GET",
        credentials: "include", // important so the nonce cookie is stored
      });
      if (!nonceRes.ok) {
        const err = await safeJson(nonceRes);
        throw new Error(err?.error || `Nonce request failed (${nonceRes.status})`);
      }
      const { message } = (await nonceRes.json()) as { message: string };

      // 2) Sign exact message
      if (!phantom?.signMessage) {
        throw new Error("Phantom `signMessage` not available. Enable 'Message Signing' in Phantom.");
      }
      setStatus({ kind: "signing" });
      const { signature } = await phantom.signMessage!(toBytes(message), "utf8");
      const signatureBase58 = base58Encode(signature);

      // 3) Verify signature (returns JWT + sets auth cookie if you kept that)
      setStatus({ kind: "verifying" });
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        credentials: "include", // keep cookies flowing (nonce/auth)
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, signatureBase58 }),
      });
      if (!verifyRes.ok) {
        const err = await safeJson(verifyRes);
        throw new Error(err?.error || `Verify failed (${verifyRes.status})`);
      }
      const data = (await verifyRes.json()) as {
        ok: boolean;
        token?: string;
        userId: string;
        walletId: string;
      };

      // store token for API Authorization: Bearer <token> flows
      if (data.token && typeof window !== "undefined" && window?.localStorage) {
        try {
          window.localStorage.setItem("authToken", data.token);
        } catch {}
      }

      setStatus({ kind: "success", userId: data.userId, token: data.token });
    } catch (e: any) {
      setStatus({ kind: "error", message: e?.message || "Something went wrong" });
    }
  }, [address, connectWallet, phantom]);

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

  return (
    <div
      style={{
        maxWidth: 520,
        margin: "24px auto",
        padding: 16,
        border: "1px solid rgba(0,0,0,0.1)",
        borderRadius: 12,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Sign in with Solana</h2>

      <p style={{ margin: "8px 0", wordBreak: "break-all" }}>
        API: <code>{API_BASE || "(missing VITE_API_BASE)"}</code>
      </p>

      {address ? (
        <p style={{ margin: "8px 0", wordBreak: "break-all" }}>
          Connected: <strong>{address}</strong>
        </p>
      ) : (
        <p style={{ margin: "8px 0" }}>No wallet connected.</p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {!address ? (
          <button onClick={connectWallet} disabled={disabled} style={btnStyle}>
            {status.kind === "connecting" ? "Connecting…" : "Connect Phantom"}
          </button>
        ) : (
          <>
            <button onClick={disconnect} disabled={disabled} style={btnStyleSecondary}>
              Disconnect
            </button>
            <button onClick={signIn} disabled={disabled} style={btnStyle}>
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
          </div>
        )}
        {status.kind === "success" && (
          <div style={okBox}>
            <div>✅ Signed in!</div>
            <div>User ID: {status.userId}</div>
            {status.token && (
              <div style={{ marginTop: 6, wordBreak: "break-all" }}>
                JWT: <code>{status.token}</code>
              </div>
            )}
          </div>
        )}
        {(status.kind === "connecting" ||
          status.kind === "gettingNonce" ||
          status.kind === "signing" ||
          status.kind === "verifying") && <div>Working…</div>}
      </div>

      <p style={{ marginTop: 16, fontSize: 12, opacity: 0.8 }}>
        Tip: if signing fails, open Phantom → Settings → Developer → enable <em>Message Signing</em>.
      </p>
    </div>
  );
}

/** --- little UI styles --- */
const btnStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};
const btnStyleSecondary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #999",
  background: "#fff",
  color: "#111",
  cursor: "pointer",
};
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

/** Safe JSON parse from fetch error bodies */
async function safeJson(r: Response) {
  try {
    return await r.json();
  } catch {
    return undefined;
  }
}

import React, { useCallback, useMemo, useState } from "react";

/**
 * API base URL rules:
 * - In production, you MUST set VITE_API_BASE to your Render API URL
 *   (e.g. https://your-api.onrender.com).
 * - In local dev, defaults to http://localhost:4000 if unset.
 * - We do NOT fall back to window.location.origin in prod (avoids hitting the frontend URL).
 */
function computeApiBase() {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
  const isProd = !!import.meta.env?.PROD;

  let base: string | undefined = envBase;

  if (!base || base.trim().length === 0) {
    if (isProd) {
      base = ""; // force explicit config in prod
      if (typeof window !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn("VITE_API_BASE is not set in production. Set it to your Render API URL in Vercel → Settings → Env Vars.");
      }
    } else {
      base = "http://localhost:4000";
    }
  }

  return base.replace(/\/+$/, "");
}

const API_BASE = computeApiBase();

/** utils */
const toBytes = (s: string) => new TextEncoder().encode(s);

/** base58 encode (no deps) */
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

/** Phantom types (subset) */
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

export default function SignInWithSolanaPage() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [address, setAddress] = useState<string>("");

  const phantom = useMemo(() => (typeof window !== "undefined" ? window.solana : undefined), []);

  const connectWallet = useCallback(async (): Promise<string> => {
    if (!phantom || !phantom.connect) {
      throw new Error("Phantom wallet not found. Install Phantom and refresh.");
    }
    setStatus({ kind: "connecting" });
    const res = await phantom.connect({ onlyIfTrusted: false });
    const pkAny = res?.publicKey as any;
    const pub: string =
      (pkAny?.toBase58?.() as string | undefined) ??
      (pkAny?.toString?.() as string | undefined) ??
      "";
    if (!pub) throw new Error("Could not read wallet address from Phantom.");
    setAddress(pub);
    return pub;
  }, [phantom]);

  const signIn = useCallback(async () => {
    try {
      if (!API_BASE) {
        throw new Error("VITE_API_BASE is missing. In Vercel, set it to your Render API URL and redeploy.");
      }

      const wallet = address || (await connectWallet());

      // 1) GET /auth/nonce (sets HttpOnly nonce cookie)
      setStatus({ kind: "gettingNonce" });
      const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${encodeURIComponent(wallet)}`, {
        method: "GET",
        credentials: "include",
      });
      if (!nonceRes.ok) {
        const err = await safeJson(nonceRes);
        throw new Error(err?.error || `Nonce request failed (${nonceRes.status})`);
      }
      const { message } = (await nonceRes.json()) as { message: string };
      if (!message) throw new Error("Server did not return a signing message.");

      // 2) Sign exact message
      if (!phantom?.signMessage) {
        throw new Error("Phantom `signMessage` unavailable. Enable Message Signing in Phantom (Settings → Developer).");
      }
      setStatus({ kind: "signing" });
      const { signature } = await phantom.signMessage(toBytes(message), "utf8");
      const signatureBase58 = base58Encode(signature);

      // 3) POST /auth/verify (returns JWT + sets auth cookie if server does that)
      setStatus({ kind: "verifying" });
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, signatureBase58 }),
      });
      if (!verifyRes.ok) {
        const err = await safeJson(verifyRes);
        throw new Error(err?.error || `Verify failed (${verifyRes.status})`);
      }
      const data = (await verifyRes.json()) as {
        ok: true;
        token?: string;
        userId: string;
        walletId: string;
        expiresAt?: string;
      };

      // Optional: keep JWT for Authorization header flows
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

  const isProd = !!import.meta.env?.PROD;

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

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {!address ? (
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

/** Safe JSON parse from fetch error bodies */
async function safeJson(r: Response) {
  try {
    return await r.json();
  } catch {
    return undefined;
  }
}

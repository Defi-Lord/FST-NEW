import React, { useCallback, useMemo, useState } from "react";

/** Resolve API base strictly from Vite env. */
const API_BASE =
  ((import.meta as any)?.env?.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ?? "";

/** Helpers */
const toBytes = (s: string) => new TextEncoder().encode(s);

/** Base58 encoder (bitcoin alphabet) */
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
    phantom?: { solana?: PhantomProvider };
  }
}

type Status =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "gettingNonce" }
  | { kind: "signing" }
  | { kind: "verifying" }
  | { kind: "success"; userId: string }
  | { kind: "error"; message: string; hint?: string };

export default function SignInWithWallet() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [address, setAddress] = useState("");
  const [nonce, setNonce] = useState<string | null>(null);

  // Detect Phantom from any injected place
  const phantom = useMemo<PhantomProvider | undefined>(() => {
    const w = typeof window !== "undefined" ? (window as any) : undefined;
    return w?.solana?.isPhantom
      ? (w.solana as PhantomProvider)
      : w?.phantom?.solana?.isPhantom
      ? (w.phantom.solana as PhantomProvider)
      : undefined;
  }, []);

  const connectWallet = useCallback(async (): Promise<string> => {
    if (!phantom?.connect) {
      throw new Error("Phantom wallet not found. Install Phantom and refresh.");
    }
    setStatus({ kind: "connecting" });
    const res = await phantom.connect({ onlyIfTrusted: false });
    const pk: any = res?.publicKey;
    const pub =
      (typeof pk?.toBase58 === "function" && pk.toBase58()) ||
      (typeof pk?.toString === "function" && pk.toString()) ||
      "";
    if (!pub) throw new Error("Could not read wallet address from Phantom.");
    setAddress(pub);
    return pub;
  }, [phantom]);

  const fetchNonce = useCallback(
    async (wallet: string): Promise<{ message: string; nonce: string }> => {
      if (!API_BASE) {
        throw new Error("Missing VITE_API_BASE. Set it to your Render API URL and redeploy.");
      }
      setStatus({ kind: "gettingNonce" });
      const url = `${API_BASE}/auth/nonce?wallet=${encodeURIComponent(wallet)}`;
      // We don’t need cookies; API returns { nonce, message } in body.
      const r = await fetch(url, { method: "GET", credentials: "omit" });
      if (!r.ok) {
        let hint = "";
        if (r.status === 400) hint = "Check the wallet address you’re sending.";
        if (r.status === 403) hint = "Origin not allowed by API CORS_ORIGIN.";
        const body = await safeJson(r);
        throw withHint(body?.error || `Nonce request failed (${r.status})`, hint);
      }
      const data = (await r.json()) as { wallet: string; nonce: string; message: string };
      if (!data?.nonce || !data?.message) {
        throw new Error("Nonce response missing required fields.");
      }
      setNonce(data.nonce);
      return { message: data.message, nonce: data.nonce };
    },
    []
  );

  const signIn = useCallback(async () => {
    try {
      const wallet = address || (await connectWallet());

      // 1) Get message + nonce
      const { message, nonce: n } = await fetchNonce(wallet);

      // 2) Sign exact message
      if (!phantom?.signMessage) {
        throw withHint(
          "Phantom `signMessage` not available.",
          "Open Phantom → Settings → Developer → enable Message Signing."
        );
      }
      setStatus({ kind: "signing" });
      const { signature } = await phantom.signMessage!(toBytes(message), "utf8");
      const signatureBase58 = base58Encode(signature);

      // 3) Verify (send NONCE in body! — cookie-free)
      setStatus({ kind: "verifying" });
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, signatureBase58, nonce: n }),
      });
      if (!verifyRes.ok) {
        const body = await safeJson(verifyRes);
        let hint = "";
        if (verifyRes.status === 400 && /nonce/i.test(body?.error || "")) {
          hint = "Your frontend must include the nonce from /auth/nonce in the verify body.";
        }
        throw withHint(body?.error || `Verify failed (${verifyRes.status})`, hint);
      }
      const ok = (await verifyRes.json()) as { ok: boolean; userId: string; token?: string };

      // Persist token (optional — some APIs also set a cookie)
      if (ok?.token) {
        try {
          window.localStorage?.setItem("authToken", ok.token);
          window.localStorage?.setItem("auth_token", ok.token);
        } catch {}
      }

      setStatus({ kind: "success", userId: ok.userId });

      // Redirect to Home (adjust if your route is different)
      window.location.href = "/home";
    } catch (e: any) {
      const msg = e?.message || "Something went wrong";
      const hint = (e && e.hint) || undefined;
      setStatus({ kind: "error", message: msg, hint });
    }
  }, [address, connectWallet, fetchNonce, phantom]);

  const disconnect = useCallback(async () => {
    try {
      await phantom?.disconnect?.();
    } catch {}
    setAddress("");
    setNonce(null);
    setStatus({ kind: "idle" });
  }, [phantom]);

  const disabled =
    status.kind === "connecting" ||
    status.kind === "gettingNonce" ||
    status.kind === "signing" ||
    status.kind === "verifying";

  const isProd = !!import.meta.env?.PROD;

  return (
    <div style={pageWrap}>
      <div style={card}>
        <h1 style={title}>Sign in with Solana</h1>
        <p style={subtitle}>Secure sign in using your Phantom wallet.</p>

        {!address ? (
          <button onClick={connectWallet} disabled={disabled} style={btnPrimary}>
            {status.kind === "connecting" ? "Connecting…" : "Connect Phantom"}
          </button>
        ) : (
          <>
            <div style={pill}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Wallet</div>
              <div style={mono}>{address}</div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={disconnect} disabled={disabled} style={btnMuted}>
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
            </div>
          </>
        )}

        <div style={{ minHeight: 20, marginTop: 12 }}>
          {status.kind === "error" && (
            <div style={errBox}>
              <div>
                <strong>Auth error:</strong> {status.message}
              </div>
              {status.hint && <div style={{ opacity: 0.9, marginTop: 6 }}>{status.hint}</div>}
            </div>
          )}
          {status.kind === "success" && <div style={okBox}>✅ Signed in! Redirecting…</div>}
        </div>

        <div style={note}>
          Tip: If you don’t see the wallet popup, click the Phantom icon in your browser toolbar.
        </div>

        {!isProd && (
          <div style={devBox}>
            Dev info: API_BASE = <code>{API_BASE || "(missing VITE_API_BASE)"}</code>{" "}
            {nonce ? (
              <>
                • nonce=<code>{nonce}</code>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- UI styles ---------------- */
const pageWrap: React.CSSProperties = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  padding: 16,
  background: "radial-gradient(1200px 700px at 10% -10%, #20104b 0%, #0b0b13 60%)",
};
const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 20px 60px rgba(0,0,0,.35)",
  color: "#e7e9ee",
};
const title: React.CSSProperties = { margin: 0, fontSize: 24, fontWeight: 700 };
const subtitle: React.CSSProperties = { margin: "6px 0 18px", opacity: 0.85 };
const btnPrimary: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid #6b46c1",
  background: "linear-gradient(180deg,#7c3aed,#5b21b6)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  boxShadow: "0 10px 30px rgba(124,58,237,.35)",
};
const btnMuted: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.25)",
  background: "transparent",
  color: "#e7e9ee",
  cursor: "pointer",
};
const pill: React.CSSProperties = {
  margin: "10px 0 14px",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px dashed rgba(255,255,255,.25)",
};
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const errBox: React.CSSProperties = {
  background: "rgba(255,0,0,0.08)",
  border: "1px solid rgba(255,0,0,0.3)",
  color: "#ffd5d5",
  padding: 10,
  borderRadius: 10,
};
const okBox: React.CSSProperties = {
  background: "rgba(0,180,0,0.08)",
  border: "1px solid rgba(0,180,0,0.35)",
  color: "#9effc6",
  padding: 10,
  borderRadius: 10,
};
const note: React.CSSProperties = { marginTop: 10, fontSize: 12, opacity: 0.8 };
const devBox: React.CSSProperties = {
  marginTop: 14,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px dashed rgba(255,255,255,.2)",
  opacity: 0.85,
};

/** Safe JSON from fetch Response */
async function safeJson(r: Response) {
  try {
    return await r.json();
  } catch {
    return undefined;
  }
}

/** Attach a hint to an Error */
function withHint(message: string, hint?: string) {
  const e: any = new Error(message);
  if (hint) e.hint = hint;
  return e;
}

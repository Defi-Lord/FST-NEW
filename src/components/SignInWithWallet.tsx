import React, { useCallback, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { buildAuthMessage, getNonce, u8ToBase64, verifySignature } from "../lib/api";

const box: React.CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: 16,
  border: "1px solid #2a2a2a",
  background: "#0e0e0e",
  borderRadius: 12
};

const SignInWithWallet: React.FC = () => {
  const { publicKey, signMessage, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [serverResp, setServerResp] = useState<any>(null);

  const address = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  const handleSignIn = useCallback(async () => {
    setStatus("");
    setServerResp(null);

    if (!connected) return setStatus("Wallet not connected.");
    if (!publicKey) return setStatus("No public key.");
    if (!signMessage) return setStatus("Wallet does not support message signing.");

    try {
      setLoading(true);

      const nonce = await getNonce(address);
      const message = buildAuthMessage({ address, nonce });

      const bytes = new TextEncoder().encode(message);
      const sigU8 = await signMessage(bytes);
      const signatureBase64 = u8ToBase64(sigU8);

      const verified = await verifySignature({ address, message, signature: signatureBase64 });

      setServerResp(verified);
      setStatus(verified?.ok ? "Signed in successfully ✅" : "Verify returned not-ok ❓");
    } catch (err: any) {
      const body = err?.body ? ` | body: ${typeof err.body === "string" ? err.body : JSON.stringify(err.body)}` : "";
      setStatus(`Sign-in failed: ${err?.message ?? String(err)}${body}`);
    } finally {
      setLoading(false);
    }
  }, [address, connected, publicKey, signMessage]);

  return (
    <div style={box}>
      <h2 style={{ marginTop: 0 }}>Sign in with Wallet</h2>

      <div style={{ marginBottom: 12 }}>
        <WalletMultiButton />
      </div>

      <div style={{ fontSize: 13, color: "#9aa", marginBottom: 12 }}>
        Address: {address || "(not connected)"}
      </div>

      <button
        disabled={!connected || loading}
        onClick={handleSignIn}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #3a3a3a",
          background: connected ? "#0b5" : "#444",
          color: "white",
          cursor: connected && !loading ? "pointer" : "not-allowed"
        }}
      >
        {loading ? "Signing…" : "Sign In"}
      </button>

      {status && (
        <pre style={{ whiteSpace: "pre-wrap", marginTop: 16, fontSize: 12, background: "#111", padding: 12, borderRadius: 8 }}>
{status}
        </pre>
      )}

      {serverResp && (
        <pre style={{ whiteSpace: "pre-wrap", marginTop: 16, fontSize: 12, background: "#111", padding: 12, borderRadius: 8 }}>
{JSON.stringify(serverResp, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default SignInWithWallet;

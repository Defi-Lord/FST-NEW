// src/components/SignInWithWallet.tsx
import React from 'react';
import { API_BASE } from '../api'; // <<— FIX: go up one level

export default function SignInWithWallet({ onSignedIn }: { onSignedIn?: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const doSign = async () => {
    setBusy(true); setErr(null);
    try {
      const provider: any = (window as any).solana ?? (window as any).phantom?.solana;
      if (!provider?.isPhantom) throw new Error('Phantom not detected');

      const connectWithTimeout = (ms: number) =>
        Promise.race([
          provider.connect({ onlyIfTrusted: false }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Popup timed out')), ms)),
        ]);
      const { publicKey } = await connectWithTimeout(20000);
      const address = publicKey.toString();

      const nonceRes = await fetch(`${API_BASE}/auth/nonce?address=${encodeURIComponent(address)}`, { credentials: 'include' });
      if (!nonceRes.ok) throw new Error('Failed to get nonce');
      const { nonce } = await nonceRes.json();

      if (!provider.signMessage) throw new Error('Wallet cannot sign messages');
      const { signature } = await provider.signMessage(new TextEncoder().encode(nonce), 'utf8');
      const sigB64 = btoa(String.fromCharCode(...Array.from(signature)));

      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address, nonce, signatureBase64: sigB64 }),
      });
      const verifyTxt = await verifyRes.text();
      if (!verifyRes.ok) throw new Error(verifyTxt);
      const { token } = JSON.parse(verifyTxt);

      localStorage.setItem('auth_token', token);
      onSignedIn?.();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin-wrap">
      <style>{css}</style>
      <div className="card">
        <div className="logo">FST</div>
        <h1>Sign in to FST</h1>
        <p className="sub">Connect your Phantom wallet to continue.</p>

        <button className="btn" onClick={doSign} disabled={busy}>
          {busy ? 'Signing…' : 'Sign in with Phantom'}
        </button>

        {err && <div className="alert">{err}</div>}

        <div className="muted">Make sure Phantom is set to <b>Mainnet</b>.</div>
      </div>
      <div className="bg" />
    </div>
  );
}

const css = String.raw`
.signin-wrap { min-height:100dvh; display:grid; place-items:center; position:relative; overflow:hidden; }
.bg { position:absolute; inset:-20%; background:
  radial-gradient(60% 40% at 20% 10%, rgba(99,102,241,.25), transparent 60%),
  radial-gradient(50% 40% at 80% 20%, rgba(236,72,153,.25), transparent 60%),
  radial-gradient(40% 30% at 40% 80%, rgba(16,185,129,.25), transparent 60%);
  filter: blur(80px);
}
.card { position:relative; z-index:1; width: min(92vw, 460px);
  background:#fff; border:1px solid #eef1f6; border-radius: 16px; padding: 28px;
  box-shadow: 0 10px 50px rgba(0,0,0,.08);
  text-align:center;
}
.logo { width:56px; height:56px; border-radius:14px; margin: 0 auto 12px; display:grid; place-items:center;
  background: linear-gradient(135deg, #6366f1, #ec4899); color:#fff; font-weight:900; letter-spacing:.5px; }
h1 { margin: 6px 0 4px; font-size: 22px; font-weight: 900; }
.sub { margin: 0 0 16px; opacity:.75; }
.btn { appearance:none; border:none; background:#111827; color:#fff; padding:12px 14px; border-radius: 12px; cursor:pointer; font-weight:800; width:100%; }
.alert { border:1px solid #fecaca; background:#fff1f2; color:#991b1b; border-radius: 10px; padding: 10px; margin: 12px 0 0; }
.muted { margin-top:10px; opacity:.7; font-size: 12px; }
`;
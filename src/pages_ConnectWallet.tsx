// src/pages_ConnectWallet.tsx
import { useEffect, useState } from 'react'

type Props = {
  onBack?: () => void
  onConnected: (address: string) => void
}

declare global {
  interface Window {
    solana?: any
  }
}

export default function ConnectWallet({ onBack, onConnected }: Props) {
  const [address, setAddress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const hasProvider = typeof window !== 'undefined' && !!window.solana

  useEffect(() => {
    // auto-detect if already trusted
    (async () => {
      try {
        if (!window.solana?.isPhantom && !window.solana?.isBackpack) return
        const r = await window.solana.connect({ onlyIfTrusted: true })
        if (r?.publicKey) {
          const addr = r.publicKey.toBase58()
          setAddress(addr)
        }
      } catch {
        /* ignore */
      }
    })()
  }, [])

  const connect = async () => {
    try {
      setError(null)
      setConnecting(true)
      if (!hasProvider) {
        setError('No Solana wallet detected. Install Phantom to continue.')
        return
      }
      const res = await window.solana.connect()
      const pubkey = res?.publicKey?.toBase58?.()
      if (!pubkey) throw new Error('Could not read public key')

      // Basic sanity check (base58-ish length 32–44)
      if (pubkey.length < 32 || pubkey.length > 50) throw new Error('Invalid wallet address')

      setAddress(pubkey)
      // Save locally for now; we’ll wire backend later.
      try { localStorage.setItem('sol_wallet', pubkey) } catch {}
      onConnected(pubkey)
    } catch (e: any) {
      if (e?.code === 4001) {
        setError('Connection was rejected.')
      } else {
        setError(e?.message || 'Failed to connect wallet.')
      }
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="screen">
      <Style />

      <div className="connect-wrap">
        {/* Top bar */}
        <div className="connect-top">
          {onBack && <button className="ct-back" onClick={onBack} aria-label="Back">←</button>}
          <h2 className="ct-title">Connect Wallet</h2>
          <div style={{ width: 36 }} />
        </div>

        {/* Hero */}
        <div className="ct-card ct-hero">
          <h1>Link your Solana wallet</h1>
          <p>Securely connect to claim rewards, join contests, and keep your fantasy progress in one place.</p>
          <div className="ct-bullets">
            <div>✓ Non-custodial — you control your keys</div>
            <div>✓ One tap sign-in for future sessions</div>
            <div>✓ Works with Phantom, Backpack & more</div>
          </div>
        </div>

        {/* Address preview (if any) */}
        {address && (
          <div className="ct-card ct-addr">
            <div className="ct-addr-label">Detected</div>
            <div className="ct-addr-value" title={address}>{address}</div>
          </div>
        )}

        {/* Error */}
        {error && <div className="ct-error">{error}</div>}

        {/* CTA */}
        <div className="ct-actions">
          {hasProvider ? (
            <button
              className={`glow-btn ${connecting ? 'is-loading' : ''}`}
              onClick={connect}
              disabled={connecting}
            >
              <span className="glow-inner">
                {connecting ? 'Connecting…' : 'Connect Sol Wallet'}
              </span>
            </button>
          ) : (
            <a
              className="glow-btn"
              href="https://phantom.app/download"
              target="_blank"
              rel="noreferrer"
            >
              <span className="glow-inner">Install Phantom</span>
            </a>
          )}
        </div>

        {/* Trust + info */}
        <div className="ct-note">
          By connecting, you agree to the Terms and acknowledge we’ll store your public wallet address.
          We never request your seed phrase or private key.
        </div>
      </div>
    </div>
  )
}

function Style() {
  return (
    <style>{`
      .connect-wrap { max-width: 920px; margin: 0 auto; padding: 14px; }
      .connect-top { display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px; }
      .ct-back {
        width:36px; height:36px; border-radius:10px; border:1px solid rgba(255,255,255,0.16);
        background:linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05)); color:#fff;
      }
      .ct-title { margin: 0; }

      .ct-card {
        border:1px solid rgba(255,255,255,0.16);
        background:linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
        border-radius:16px; padding:16px; backdrop-filter: blur(8px);
      }
      .ct-hero { margin: 6px 0 12px; }
      .ct-hero h1 { margin:0 0 6px; font-size: clamp(22px, 4.8vw, 38px); }
      .ct-hero p { margin:0 0 10px; color: rgba(255,255,255,0.85); }
      .ct-bullets { display:grid; gap:6px; color: rgba(255,255,255,0.9); }

      .ct-addr { display:grid; gap: 6px; margin: 8px 0 12px; }
      .ct-addr-label { opacity: .8; font-size: 12px; }
      .ct-addr-value {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        padding:10px; border-radius: 10px; background: rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.12);
      }

      .ct-error {
        color: #ffb4b4;
        background: rgba(255, 0, 0, 0.12);
        border: 1px solid rgba(255, 0, 0, 0.22);
        border-radius: 12px;
        padding: 10px 12px;
        margin: 8px 0 12px;
      }

      .ct-actions { display:flex; justify-content:center; margin: 10px 0 8px; }

      /* Glowing animated button */
      .glow-btn {
        position: relative; display: inline-grid; place-items:center;
        min-width: 240px; height: 48px; padding: 0 18px; border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.22); color:#fff; text-decoration:none;
        background: radial-gradient(120% 120% at 0% 0%, rgba(99,102,241,0.18), transparent 60%),
                    radial-gradient(120% 120% at 100% 100%, rgba(236,72,153,0.18), transparent 60%),
                    linear-gradient(135deg, rgba(99,102,241,0.45), rgba(236,72,153,0.45));
        overflow: hidden;
      }
      .glow-inner { font-weight: 900; letter-spacing: .3px; }
      .glow-btn::before {
        content:""; position:absolute; inset:-2px;
        background: conic-gradient(from 0deg,
          rgba(99,102,241,0.0), rgba(99,102,241,0.7), rgba(236,72,153,0.7), rgba(99,102,241,0.0) 70%);
        filter: blur(14px); transform: rotate(0deg);
        animation: spin 6s linear infinite;
        opacity: .75; z-index: -1;
      }
      .glow-btn:hover { transform: translateY(-1px); box-shadow: 0 14px 36px rgba(99,102,241,0.35); }
      .glow-btn.is-loading { opacity: .7; pointer-events: none; }
      @keyframes spin { to { transform: rotate(360deg); } }

      .ct-note {
        text-align: center; opacity: .8; font-size: 12px;
        margin-top: 6px;
      }
    `}</style>
  )
}

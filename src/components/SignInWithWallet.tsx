import React, { useEffect, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'

type Props = {
  onSignedIn?: (wallet: string) => void
  className?: string
}

/** Phantom window type */
type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: PublicKey
  connect: (opts?: any) => Promise<{ publicKey: PublicKey }>
  disconnect: () => Promise<void>
  signMessage?: (message: Uint8Array, display?: any) => Promise<{ signature: Uint8Array }>
}

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  'https://fst-api.onrender.com'

function getPhantom(): PhantomProvider | undefined {
  return (window as any)?.solana
}

/** Optional helper: encode Uint8Array to base64 if your API prefers it. */
function u8ToBase64(u8: Uint8Array): string {
  let s = ''
  u8.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s)
}

export default function SignInWithWallet({ onSignedIn, className }: Props) {
  const [wallet, setWallet] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>('')
  const [info, setInfo] = useState<string>('')

  const phantom = useMemo(() => getPhantom(), [])

  useEffect(() => {
    // Auto-fill wallet if Phantom already connected.
    if (phantom?.publicKey) setWallet(phantom.publicKey.toBase58())
  }, [phantom])

  async function connectAndSign() {
    setErr('')
    setInfo('')
    const prov = phantom

    if (!prov?.isPhantom) {
      setErr('Phantom wallet not found. Please install Phantom to continue.')
      return
    }

    try {
      setBusy(true)

      // 1) Connect Phantom
      const { publicKey } = await prov.connect()
      const address = publicKey.toBase58()
      setWallet(address)

      // 2) Ask backend for a nonce (IMPORTANT: backend expects ?wallet=)
      const nonceRes = await fetch(
        `${API_BASE}/auth/nonce?wallet=${encodeURIComponent(address)}`,
        { credentials: 'include' }
      )

      if (!nonceRes.ok) {
        const t = await nonceRes.text().catch(() => '')
        throw new Error(t || `Failed to get nonce (HTTP ${nonceRes.status})`)
      }

      const { nonce } = await nonceRes.json()
      if (!nonce) throw new Error('Backend did not return a nonce')

      // 3) Wallet signs the nonce
      if (!prov.signMessage) {
        throw new Error('Wallet does not support signMessage')
      }
      const encoded = new TextEncoder().encode(String(nonce))
      const { signature } = await prov.signMessage(encoded, { display: 'utf8' })

      // If your API expects base64 instead of raw bytes, switch lines below:
      // const signaturePayload = u8ToBase64(signature)
      const signaturePayload = Array.from(signature)

      // 4) Send signature for verification (IMPORTANT: backend expects { wallet, ... })
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          wallet: address,
          nonce,
          signature: signaturePayload
        })
      })

      if (!verifyRes.ok) {
        const t = await verifyRes.text().catch(() => '')
        throw new Error(t || `Verify failed (HTTP ${verifyRes.status})`)
      }

      const v = await verifyRes.json().catch(() => ({} as any))
      const token: string | undefined = v?.token || v?.access_token || v?.jwt
      if (!token) throw new Error('No token returned from verify')

      try {
        localStorage.setItem('auth_token', token)
      } catch {}

      setInfo('Signed in successfully!')
      onSignedIn?.(address)
    } catch (e: any) {
      setErr(e?.message || 'Wallet sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setErr('')
    setInfo('')
    try {
      await phantom?.disconnect?.()
      setWallet('')
      try { localStorage.removeItem('auth_token') } catch {}
      setInfo('Disconnected.')
    } catch (e: any) {
      setErr(e?.message || 'Failed to disconnect')
    }
  }

  // ---------- UI (Beautiful, glassmorphism, responsive) ----------
  return (
    <div className={className} style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, background: 'linear-gradient(135deg, #0f1220 0%, #171a2b 60%, #121316 100%)' }}>
      {/* Embedded styles so you can drop-in without external CSS */}
      <style>{`
        .card {
          width: min(560px, 92vw);
          border-radius: 20px;
          padding: 28px;
          backdrop-filter: blur(10px);
          background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
          color: #e6e8ff;
        }
        .title {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 0.3px;
          margin: 0 0 6px;
          background: linear-gradient(90deg, #b3b8ff, #8ddcff, #b3b8ff);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: shine 6s linear infinite;
        }
        @keyframes shine { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        .subtitle {
          margin: 0 0 18px;
          opacity: 0.85;
          font-size: 14px;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: center;
          margin-top: 14px;
        }
        .pill {
          padding: 10px 12px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 13px;
          color: #cbd0ff;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .btn {
          border: 0;
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.2px;
          color: #0e1020;
          background: linear-gradient(180deg, #8ddcff, #7ecbff 40%, #69b3ff);
          cursor: pointer;
          transition: transform .08s ease, filter .15s ease, box-shadow .2s ease;
          box-shadow: 0 8px 18px rgba(125, 195, 255, 0.45);
        }
        .btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
        .btn:active { transform: translateY(0px) scale(.99); }
        .btn:disabled { filter: grayscale(.3) brightness(.85); cursor: not-allowed; }
        .btn-ghost {
          border: 1px solid rgba(255,255,255,0.16);
          background: transparent;
          color: #dfe4ff;
          box-shadow: none;
        }
        .btn-ghost:hover { background: rgba(255,255,255,0.05); }
        .hint {
          margin-top: 14px;
          font-size: 12px;
          opacity: .75;
        }
        .error {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(255, 71, 87, 0.08);
          color: #ff8189;
          border: 1px solid rgba(255, 71, 87, 0.35);
          font-size: 13px;
          white-space: pre-wrap;
        }
        .ok {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(46, 213, 115, 0.08);
          color: #8cf5b4;
          border: 1px solid rgba(46, 213, 115, 0.35);
          font-size: 13px;
        }
        .header {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 14px;
          align-items: center;
          margin-bottom: 8px;
        }
        .logo {
          width: 44px; height: 44px; border-radius: 12px;
          display: grid; place-items: center;
          background: linear-gradient(180deg, #1d2037, #121424);
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .tag {
          display:inline-block;
          padding: 4px 8px;
          border-radius: 999px;
          font-weight: 700;
          font-size: 10px;
          letter-spacing: .6px;
          background: rgba(120, 122, 255, 0.12);
          color: #aab0ff;
          border: 1px solid rgba(120, 122, 255, 0.25);
          text-transform: uppercase;
        }
        .grid {
          display: grid;
          gap: 12px;
          margin: 10px 0 6px;
        }
      `}</style>

      <div className="card">
        <div className="header">
          <div className="logo">
            {/* Simple Phantom-ish mark */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 2c5.523 0 10 4.477 10 10 0 4.02-2.39 7.48-5.82 9.06-.42.2-.91.02-1.11-.39-.17-.37-.03-.8.31-1.01A7.987 7.987 0 0 0 20 12c0-4.418-3.582-8-8-8S4 7.582 4 12c0 2.01.74 3.85 1.96 5.26.29.33.25.82-.08 1.11-.29.25-.72.26-1.02.04C2.93 16.85 2 14.53 2 12 2 6.477 6.477 2 12 2Z" fill="#b6baff"/>
              <circle cx="9" cy="11" r="1.5" fill="#fff"/>
              <circle cx="15" cy="11" r="1.5" fill="#fff"/>
            </svg>
          </div>
          <div>
            <div className="title">Sign in with Phantom</div>
            <div className="subtitle">
              Secure sign-in using a one-time nonce verified by your wallet.
              <span className="tag" style={{ marginLeft: 8 }}>web3</span>
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="row">
            <div className="pill" title={wallet || 'Not connected'}>
              {wallet ? wallet : 'Wallet: Not connected'}
            </div>
            {wallet ? (
              <button className="btn btn-ghost" onClick={disconnect} disabled={busy}>
                Disconnect
              </button>
            ) : null}
          </div>

          <button className="btn" onClick={connectAndSign} disabled={busy}>
            {busy ? 'Waiting for wallet…' : wallet ? 'Sign Nonce & Continue' : 'Connect Phantom & Sign In'}
          </button>

          {err && <div className="error">{err}</div>}
          {info && <div className="ok">{info}</div>}

          <div className="hint">
            Tip: If you don’t see the Phantom popup, click its icon in your browser toolbar.
          </div>
        </div>
      </div>
    </div>
  )
}

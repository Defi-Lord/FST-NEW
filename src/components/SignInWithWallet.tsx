import React, { useEffect, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { Buffer } from 'buffer'

;(window as any).Buffer ??= Buffer

type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: PublicKey
  connect: (opts?: any) => Promise<{ publicKey: PublicKey }>
  disconnect: () => Promise<void>
  signMessage?: (
    message: Uint8Array,
    opts?: { display?: 'utf8' | 'hex' }
  ) => Promise<{ signature: Uint8Array }>
}

type Props = {
  onSignedIn?: (address: string) => void
}

/** Change if you host the API somewhere else */
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  'https://fst-api.onrender.com'

/** Utilities */
function getPhantom(): PhantomProvider | undefined {
  return (window as any)?.solana
}
function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
function nowIso() {
  try { return new Date().toISOString() } catch { return '' }
}

/** Build a safe fallback message if API returns only a nonce */
function fallbackMessage(addr: string, nonce: string) {
  return `FST login

Wallet: ${addr}
Nonce: ${nonce}
Issued At: ${nowIso()}

By signing, you prove ownership of this wallet.`
}

/** Fetch nonce (and possibly a precomposed message) */
async function fetchNoncePayload(address: string): Promise<{
  nonce: string
  message: string
  expiresInSec?: number
}> {
  // Prefer wallet param (your API expects this)
  const urls = [
    `${API_BASE}/auth/nonce?wallet=${encodeURIComponent(address)}`,
    `${API_BASE}/auth/nonce?address=${encodeURIComponent(address)}`
  ]

  let lastErrTxt = ''
  for (const u of urls) {
    const r = await fetch(u, { credentials: 'include' })
    if (r.ok) {
      const j = await r.json()
      if (j?.nonce) {
        return {
          nonce: String(j.nonce),
          message: j.message ? String(j.message) : fallbackMessage(address, String(j.nonce)),
          expiresInSec: typeof j.expiresInSec === 'number' ? j.expiresInSec : undefined
        }
      }
      // if body is just a string nonce
      if (typeof j === 'string') {
        return {
          nonce: j,
          message: fallbackMessage(address, j)
        }
      }
    } else {
      lastErrTxt = (await r.text().catch(() => '')) || `HTTP ${r.status}`
    }
  }

  // Try POST body as a final fallback
  const r = await fetch(`${API_BASE}/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ wallet: address, address })
  })
  if (r.ok) {
    const j = await r.json()
    if (j?.nonce) {
      return {
        nonce: String(j.nonce),
        message: j.message ? String(j.message) : fallbackMessage(address, String(j.nonce)),
        expiresInSec: typeof j.expiresInSec === 'number' ? j.expiresInSec : undefined
      }
    }
  }

  const txt = lastErrTxt || (await r.text().catch(() => '')) || 'Unable to obtain nonce'
  throw new Error(txt)
}

/** Verify signature with backend */
async function verifySignature(params: {
  address: string
  nonce: string
  message: string
  signatureBytes: Uint8Array
}) {
  const { address, nonce, message, signatureBytes } = params
  const signatureBase64 = bytesToBase64(signatureBytes)

  const r = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      wallet: address,
      address,
      nonce,
      message,
      signatureBase64,
      signature: Array.from(signatureBytes)
    })
  })

  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(t || `Verify failed (HTTP ${r.status})`)
  }

  const j = await r.json().catch(() => ({} as any))
  const token: string | undefined = j?.token || j?.access_token || j?.jwt
  if (!token) throw new Error('No token returned from verify')

  try { localStorage.setItem('auth_token', token) } catch {}
  return token
}

/** Phantom sometimes throws a transient “message port closed” error; retry once */
async function signWithRetry(
  provider: PhantomProvider,
  msgBytes: Uint8Array
): Promise<Uint8Array> {
  const attempt = async () => {
    if (!provider.signMessage) throw new Error('Wallet does not support signMessage')
    const { signature } = await provider.signMessage(msgBytes, { display: 'utf8' })
    return signature
  }

  try {
    return await attempt()
  } catch (e: any) {
    const txt = String(e?.message || e)
    if (/message port closed/i.test(txt) || /lastError/i.test(txt)) {
      // tiny backoff & second try
      await new Promise(res => setTimeout(res, 350))
      return await attempt()
    }
    throw e
  }
}

/** Pretty Connect & Sign Component */
export default function SignInWithWallet({ onSignedIn }: Props) {
  const [connectedAddress, setConnectedAddress] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')

  const phantom = useMemo(() => getPhantom(), [])

  useEffect(() => {
    if (phantom?.publicKey) {
      setConnectedAddress(phantom.publicKey.toBase58())
    }
  }, [phantom])

  const connectAndSign = async () => {
    setError('')
    const p = getPhantom()
    if (!p?.isPhantom) {
      setError('Phantom wallet not found. Please install Phantom and try again.')
      return
    }

    try {
      setBusy(true)

      // 1) Connect (avoid navigation during this time)
      const { publicKey } = await p.connect()
      const address = publicKey.toBase58()
      setConnectedAddress(address)

      // 2) Get nonce/message from backend
      const payload = await fetchNoncePayload(address)
      // For your debugging visibility:
      // console.debug('nonce payload', payload)

      // 3) Sign EXACT message from API
      const toSign = new TextEncoder().encode(payload.message)
      const signature = await signWithRetry(p, toSign)

      // 4) Verify
      await verifySignature({
        address,
        nonce: payload.nonce,
        message: payload.message,
        signatureBytes: signature
      })

      onSignedIn?.(address)
    } catch (e: any) {
      setError(e?.message || 'Wallet sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  /** ————————  UI STYLES  ———————— */
  const gradientBg: React.CSSProperties = {
    minHeight: '100vh',
    width: '100%',
    background:
      'radial-gradient(1200px 600px at 20% 0%, #2a2b4a 0%, rgba(14,15,21,1) 40%), radial-gradient(1000px 500px at 120% 10%, #0f3b56 0%, rgba(14,15,21,1) 30%)',
    display: 'grid',
    placeItems: 'center',
    padding: 16
  }

  const card: React.CSSProperties = {
    width: 'min(92vw, 560px)',
    background: 'rgba(20, 22, 30, 0.7)',
    border: '1px solid rgba(120, 120, 240, 0.25)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
    padding: 22,
    color: '#eaeaf0',
    boxShadow:
      '0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.25)'
  }

  const headerRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6
  }

  const badge: React.CSSProperties = {
    fontSize: 12,
    color: '#b9c4ff',
    background:
      'linear-gradient(90deg, rgba(108,92,231,0.15), rgba(52,152,219,0.15))',
    border: '1px solid rgba(120,120,240,0.25)',
    padding: '6px 10px',
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8
  }

  const title: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 0.3,
    margin: 0
  }

  const subtitle: React.CSSProperties = {
    margin: '4px 0 16px 0',
    opacity: 0.9,
    lineHeight: 1.5
  }

  const connectBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid rgba(120,120,240,0.35)',
    background:
      'linear-gradient(180deg, rgba(108,92,231,0.2), rgba(108,92,231,0.06))',
    color: 'white',
    fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
    boxShadow:
      '0 10px 24px rgba(108,92,231,0.25), inset 0 1px 0 rgba(255,255,255,0.06)'
  }

  const smallRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 12
  }

  const addressChip: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 12,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '6px 10px',
    borderRadius: 8
  }

  const errBox: React.CSSProperties = {
    marginTop: 12,
    background: 'rgba(255, 99, 132, 0.08)',
    border: '1px solid rgba(255,99,132,0.25)',
    color: '#ff9aa9',
    padding: '10px 12px',
    borderRadius: 10,
    whiteSpace: 'pre-wrap'
  }

  return (
    <div style={gradientBg}>
      <div style={card}>
        <div style={headerRow}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" fill="#8b5cf6" />
            <path d="M8 13c2 3 6 3 8 0" stroke="white" strokeWidth="1.7" strokeLinecap="round"/>
            <circle cx="9.2" cy="9.5" r="1.2" fill="white"/>
            <circle cx="14.8" cy="9.5" r="1.2" fill="white"/>
          </svg>
          <div style={badge}>
            <span>Sign in with Phantom</span>
          </div>
        </div>

        <h1 style={title}>Welcome to FST</h1>
        <p style={subtitle}>
          Connect your wallet and sign a one-time message (nonce) from the server to prove ownership.
          No gas, no approvals — just a secure signature.
        </p>

        <button
          style={connectBtn}
          onClick={connectAndSign}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? (
            <>
              <span
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.45)',
                  borderTopColor: 'transparent',
                  display: 'inline-block',
                  animation: 'spin 0.8s linear infinite'
                }}
              />
              Connecting & Signing…
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M3 12h14M13 5l7 7-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Connect Phantom & Sign In
            </>
          )}
        </button>

        <div style={smallRow}>
          <div style={{ opacity: 0.8, fontSize: 12 }}>
            Secure by message signature • Non-custodial
          </div>
          {connectedAddress && (
            <div style={addressChip} title={connectedAddress}>
              {connectedAddress.slice(0, 6)}…{connectedAddress.slice(-6)}
            </div>
          )}
        </div>

        {!!error && <div style={errBox}>{error}</div>}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

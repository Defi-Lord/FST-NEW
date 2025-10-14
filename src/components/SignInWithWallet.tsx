import React, { useEffect, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { Buffer } from 'buffer'

// ————————————————————————————————————
// Polyfills / globals (vite/browser)
;(window as any).Buffer ??= Buffer

type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: PublicKey
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>
  disconnect: () => Promise<void>
  signMessage?: (message: Uint8Array, opts?: { display?: 'utf8' | 'hex' }) => Promise<{ signature: Uint8Array }>
}

type Props = {
  onSignedIn?: (address: string) => void
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'https://fst-api.onrender.com'

// ————————————————————————————————————
// Helpers
function getPhantom(): PhantomProvider | undefined {
  return (window as any)?.solana
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

// Tiny base58 encoder (no dependency)
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function bytesToBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''
  let digits = [0]
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i]
    for (let j = 0; j < digits.length; j++) {
      const val = digits[j] * 256 + carry
      digits[j] = val % 58
      carry = Math.floor(val / 58)
    }
    while (carry) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }
  // handle leading zeros
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  let out = ''
  for (let k = 0; k < zeros; k++) out += '1'
  for (let q = digits.length - 1; q >= 0; q--) out += B58_ALPHABET[digits[q]]
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function nowIso() {
  try { return new Date().toISOString() } catch { return '' }
}

function fallbackMessage(addr: string, nonce: string) {
  return `FST login

Wallet: ${addr}
Nonce: ${nonce}
Issued At: ${nowIso()}

By signing, you prove ownership of this wallet.`
}

async function fetchNoncePayload(address: string): Promise<{
  nonce: string
  message: string
  expiresInSec?: number
}> {
  // Your API wants ?wallet=..., you saw 400 when using ?address=...
  const urls = [
    `${API_BASE}/auth/nonce?wallet=${encodeURIComponent(address)}`,
    `${API_BASE}/auth/nonce?address=${encodeURIComponent(address)}`
  ]

  let lastErrTxt = ''
  for (const u of urls) {
    const r = await fetch(u, { credentials: 'include' })
    if (r.ok) {
      const j = await r.json().catch(() => ({} as any))
      if (j?.nonce) {
        return {
          nonce: String(j.nonce),
          message: j.message ? String(j.message) : fallbackMessage(address, String(j.nonce)),
          expiresInSec: typeof j.expiresInSec === 'number' ? j.expiresInSec : undefined
        }
      }
      // some minimal APIs return just a string nonce
      if (typeof j === 'string' && j) {
        return { nonce: j, message: fallbackMessage(address, j) }
      }
    } else {
      lastErrTxt = (await r.text().catch(() => '')) || `HTTP ${r.status}`
    }
  }

  // POST fallback
  const r = await fetch(`${API_BASE}/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ wallet: address, address })
  })
  if (r.ok) {
    const j = await r.json().catch(() => ({} as any))
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

async function postJSON(url: string, body: any) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  })
}

async function verifySignatureSmart(params: {
  address: string
  nonce: string
  message: string
  signatureBytes: Uint8Array
  log: (s: string) => void
}) {
  const { address, nonce, message, signatureBytes, log } = params
  const b64 = bytesToBase64(signatureBytes)
  const b58 = bytesToBase58(signatureBytes)
  const hex = bytesToHex(signatureBytes)

  const candidates: { label: string; body: any }[] = [
    {
      label: 'wallet+nonce+message+signatureBase64',
      body: { wallet: address, nonce, message, signatureBase64: b64 }
    },
    {
      label: 'wallet+address+nonce+message+signatureBase64',
      body: { wallet: address, address, nonce, message, signatureBase64: b64 }
    },
    {
      label: 'address+nonce+message+signatureBase64',
      body: { address, nonce, message, signatureBase64: b64 }
    },
    {
      label: 'wallet+nonce+message+signature(b64)',
      body: { wallet: address, nonce, message, signature: b64 }
    },
    {
      label: 'wallet+nonce+message+signatureBase58',
      body: { wallet: address, nonce, message, signatureBase58: b58 }
    },
    {
      label: 'wallet+nonce+message+signature(hex)',
      body: { wallet: address, nonce, message, signature: hex, encoding: 'hex' }
    },
    {
      label: 'publicKey+nonce+message+signature(b64)',
      body: { publicKey: address, nonce, message, signature: b64 }
    }
  ]

  let lastStatus = 0
  let lastText = ''

  for (const c of candidates) {
    log(`Verifying (${c.label})…`)
    const r = await postJSON(`${API_BASE}/auth/verify`, c.body)
    if (r.ok) {
      const j = await r.json().catch(() => ({} as any))
      const token: string | undefined = j?.token || j?.access_token || j?.jwt
      if (!token) {
        // some backends return { success: true, token: '...' } or set-cookie only
        if (j?.success) {
          try { localStorage.setItem('auth_token', '1') } catch {}
          return 'cookie'
        }
        lastStatus = r.status
        lastText = JSON.stringify(j)
        continue
      }
      try { localStorage.setItem('auth_token', token) } catch {}
      return token
    } else {
      lastStatus = r.status
      lastText = await r.text().catch(() => '')
    }
  }

  throw new Error(`Verify failed. Last response: HTTP ${lastStatus} ${lastText || ''}`.trim())
}

function isPortClosedErr(e: unknown) {
  const msg = String((e as any)?.message || e || '')
  return /message port closed/i.test(msg) || /lastError/i.test(msg)
}

// Up to 3 tries with reconnect/backoff between tries
async function signWithResiliency(
  provider: PhantomProvider,
  messageUtf8: string,
  log: (s: string) => void
) {
  const toSign = new TextEncoder().encode(messageUtf8)

  const attempt = async (n: number) => {
    log(`Signing (try ${n})…`)
    if (!provider.signMessage) throw new Error('Wallet does not support signMessage')
    const { signature } = await provider.signMessage(toSign, { display: 'utf8' })
    return signature
  }

  try {
    return await attempt(1)
  } catch (e) {
    if (!isPortClosedErr(e)) throw e
    log('Phantom reported: message port closed. Retrying…')
  }

  try {
    log('Reconnecting wallet (retry 2)…')
    await provider.disconnect().catch(() => {})
    await provider.connect().catch(() => {})
    return await attempt(2)
  } catch (e) {
    if (!isPortClosedErr(e)) throw e
    log('Still getting port closed. Final retry after short backoff…')
  }

  await new Promise(res => setTimeout(res, 400))
  await provider.disconnect().catch(() => {})
  await provider.connect().catch(() => {})
  return await attempt(3)
}

// ————————————————————————————————————
// Component
export default function SignInWithWallet({ onSignedIn }: Props) {
  const [connectedAddress, setConnectedAddress] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')
  const [logLines, setLogLines] = useState<string[]>([])
  const phantom = useMemo(() => getPhantom(), [])

  useEffect(() => {
    if (phantom?.publicKey) setConnectedAddress(phantom.publicKey.toBase58())
  }, [phantom])

  const pushLog = (s: string) => setLogLines(prev => [...prev, s].slice(-8))

  const connectAndSign = async () => {
    setError('')
    setLogLines([])

    const p = getPhantom()
    if (!p?.isPhantom) {
      setError('Phantom wallet not found. Install Phantom and try again.')
      return
    }

    try {
      setBusy(true)

      // Keep flow inside the click gesture
      pushLog('Connecting wallet…')
      const conn =
        (await p.connect({ onlyIfTrusted: true }).catch(() => null)) ||
        (await p.connect())
      const address = conn.publicKey.toBase58()
      setConnectedAddress(address)
      pushLog(`Connected: ${address.slice(0, 6)}…${address.slice(-6)}`)

      pushLog('Requesting nonce from API…')
      const payload = await fetchNoncePayload(address)
      pushLog(`Nonce received: ${payload.nonce.slice(0, 8)}…`)

      pushLog('Preparing message…')
      const message = payload.message || fallbackMessage(address, payload.nonce)

      // Sign (with resiliency)
      const signature = await signWithResiliency(p, message, pushLog)

      // Verify (try multiple shapes/encodings)
      const token = await verifySignatureSmart({
        address,
        nonce: payload.nonce,
        message,
        signatureBytes: signature,
        log: pushLog
      })

      pushLog('Signed in ✅')
      if (token && token !== 'cookie') pushLog('Token stored (localStorage)')
      onSignedIn?.(address)
    } catch (e: any) {
      const msg = e?.message || 'Wallet sign-in failed'
      setError(msg)
      pushLog(`Error: ${String(msg)}`)
    } finally {
      setBusy(false)
    }
  }

  // ————————————————————————————————————
  // Fancy styles
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
  const title: React.CSSProperties = { fontSize: 22, fontWeight: 700, letterSpacing: 0.3, margin: 0 }
  const subtitle: React.CSSProperties = { margin: '4px 0 16px 0', opacity: 0.9, lineHeight: 1.5 }
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
  const logBox: React.CSSProperties = {
    marginTop: 10,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#cfd7ff',
    padding: '10px 12px',
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 1.4,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
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
          <div style={badge}><span>Sign in with Phantom</span></div>
        </div>

        <h1 style={title}>Welcome to FST</h1>
        <p style={subtitle}>
          Connect your wallet and sign a one-time message from the server to prove ownership.
          No gas, no approvals — just a secure signature.
        </p>

        <button style={connectBtn} onClick={connectAndSign} disabled={busy} aria-busy={busy}>
          {busy ? (
            <>
              <span aria-hidden style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.45)', borderTopColor: 'transparent',
                display: 'inline-block', animation: 'spin 0.8s linear infinite'
              }} />
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
          <div style={{ opacity: 0.8, fontSize: 12 }}>Secure by message signature • Non-custodial</div>
          {connectedAddress && (
            <div style={addressChip} title={connectedAddress}>
              {connectedAddress.slice(0, 6)}…{connectedAddress.slice(-6)}
            </div>
          )}
        </div>

        {!!error && <div style={errBox}>{error}</div>}
        {!!logLines.length && <div style={logBox}>{logLines.map((l, i) => <div key={i}>• {l}</div>)}</div>}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { PublicKey } from '@solana/web3.js'

type Props = {
  onSignedIn?: (address: string) => void
  className?: string
}

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

export default function SignInWithWallet({ onSignedIn, className }: Props) {
  const [addr, setAddr] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>('')

  useEffect(() => {
    const prov = getPhantom()
    if (prov?.publicKey) setAddr(prov.publicKey.toBase58())
  }, [])

  const connect = async () => {
    setErr('')
    const prov = getPhantom()
    if (!prov?.isPhantom) {
      setErr('Phantom wallet not found. Please install Phantom and try again.')
      return
    }
    try {
      setBusy(true)
      const { publicKey } = await prov.connect()
      const address = publicKey.toBase58()
      setAddr(address)

      // 1) ask backend for a nonce to sign
      const nonceRes = await fetch(`${API_BASE}/auth/nonce?address=${encodeURIComponent(address)}`, {
        credentials: 'include'
      })

      if (!nonceRes.ok) {
        const t = await nonceRes.text().catch(() => '')
        throw new Error(t || `Failed to get nonce (HTTP ${nonceRes.status})`)
      }

      const { nonce } = await nonceRes.json()
      if (!nonce) throw new Error('Backend did not return a nonce')

      // 2) sign the nonce
      if (!prov.signMessage) {
        throw new Error('Wallet does not support signMessage')
      }
      const encoded = new TextEncoder().encode(String(nonce))
      const { signature } = await prov.signMessage(encoded, { display: 'utf8' })

      // 3) send signature back for verification -> expect { token }
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          address,
          nonce,
          signature: Array.from(signature) // send raw bytes as array (adjust if your API expects base58/base64)
        })
      })

      if (!verifyRes.ok) {
        const t = await verifyRes.text().catch(() => '')
        throw new Error(t || `Verify failed (HTTP ${verifyRes.status})`)
      }

      const v = await verifyRes.json().catch(() => ({} as any))
      const token: string | undefined = v?.token || v?.access_token || v?.jwt
      if (!token) {
        throw new Error('No token returned from verify')
      }

      try { localStorage.setItem('auth_token', token) } catch {}
      onSignedIn?.(address)
    } catch (e: any) {
      setErr(e?.message || 'Wallet sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className} style={{ display: 'grid', gap: 12 }}>
      <button
        onClick={connect}
        disabled={busy}
        style={{
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid #6c5ce7',
          background: '#1a1b1f',
          color: 'white',
          cursor: busy ? 'not-allowed' : 'pointer'
        }}
      >
        {busy ? 'Connecting…' : addr ? `Connected: ${addr.slice(0, 4)}…${addr.slice(-4)}` : 'Connect Phantom & Sign In'}
      </button>
      {!!err && (
        <div style={{ color: '#ff6b6b', fontSize: 13, whiteSpace: 'pre-wrap' }}>
          {err}
        </div>
      )}
      <small style={{ opacity: 0.75 }}>
        We’ll request a signable nonce from the server and ask Phantom to sign it to verify your address.
      </small>
    </div>
  )
}

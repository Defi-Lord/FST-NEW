// src/pages_ConnectWallet.tsx
import { useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  onBack?: () => void
  onConnected: (address: string) => void
}

/** Toggle this to require a signature on connect (recommended if you gate access). */
const SIGN_ON_CONNECT = false
const SIGNING_MESSAGE = 'Louder App — Verify wallet ownership.\n\nNonce: '

declare global {
  interface Window {
    solana?: any
    phantom?: { solana?: any }
    backpack?: any
    solflare?: any
    exodus?: { solana?: any }
    wallets?: { get(): any[] }
  }
}

type WalletId = 'phantom' | 'backpack' | 'solflare' | 'exodus' | 'other'
type WalletItem = {
  id: WalletId
  name: string
  icon: JSX.Element
  installed: boolean
  connect: (opts?: any) => Promise<{ address: string; provider?: any }>
  installUrl?: string
  on?: ((ev: string, fn: (...args: any[]) => void) => void) | undefined
  off?: ((ev: string, fn: (...args: any[]) => void) => void) | undefined
}

const safeGetSaved = () => { try { return localStorage.getItem('sol_wallet') } catch { return null } }
const safeSetSaved = (addr: string | null) => {
  try {
    if (!addr) localStorage.removeItem('sol_wallet')
    else localStorage.setItem('sol_wallet', addr)
  } catch {}
}

function toB58(pk: any): string | null {
  try { return pk?.toBase58?.() ?? null } catch { return null }
}

function makeNonce(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${Date.now()}-${rand}`
}

/** iOS + Phantom helpers */
const isiOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)
const isPhantomInApp = () => !!(window.solana && (window.solana.isPhantom || window.phantom?.solana))
const phantomBrowseLink = () => {
  const url = typeof window !== 'undefined' ? window.location.href : ''
  return `https://phantom.app/ul/browse/${encodeURIComponent(url)}`
}

export default function ConnectWallet({ onBack, onConnected }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [connectingId, setConnectingId] = useState<WalletId | null>(null)
  const [detectedNote, setDetectedNote] = useState<string | null>(null)

  const [connectedAddr, setConnectedAddr] = useState<string | null>(safeGetSaved())
  const [connectedId, setConnectedId] = useState<WalletId | null>(null)
  const currentProviderRef = useRef<any>(null)

  const didAuto = useRef(false)
  const listenersRef = useRef<{ [k: string]: (...args: any[]) => void }>({})

  // —— Discover wallets (and give real connect calls)
  const providers = useMemo<WalletItem[]>(() => {
    const list: WalletItem[] = []

    // Phantom
    const phantom = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null)
    list.push({
      id: 'phantom',
      name: 'Phantom',
      installed: !!phantom,
      icon: <IconPhantom />,
      installUrl: 'https://phantom.app/download',
      on: phantom?.on?.bind(phantom),
      off: phantom?.off?.bind(phantom),
      connect: async (opts?: any) => {
        const prov = window.phantom?.solana || window.solana
        if (!prov) throw new Error('Phantom not found')
        const res = await prov.connect(opts)
        const addr = toB58(res?.publicKey) || toB58(prov?.publicKey)
        if (!addr) throw new Error('No public key from Phantom')
        return { address: addr, provider: prov }
      },
    })

    // Backpack
    const backpack = window.backpack
    list.push({
      id: 'backpack',
      name: 'Backpack',
      installed: !!backpack,
      icon: <IconBackpack />,
      installUrl: 'https://www.backpack.app/download',
      on: backpack?.on?.bind(backpack),
      off: backpack?.off?.bind(backpack),
      connect: async (opts?: any) => {
        const prov = window.backpack
        if (!prov) throw new Error('Backpack not found')
        const res = await prov.connect(opts)
        const addr = toB58(res?.publicKey) || toB58(prov?.publicKey)
        if (!addr) throw new Error('No public key from Backpack')
        return { address: addr, provider: prov }
      },
    })

    // Solflare
    const solflare = window.solflare
    list.push({
      id: 'solflare',
      name: 'Solflare',
      installed: !!solflare,
      icon: <IconSolflare />,
      installUrl: 'https://solflare.com/download',
      on: solflare?.on?.bind(solflare),
      off: solflare?.off?.bind(solflare),
      connect: async (opts?: any) => {
        const prov = window.solflare
        if (!prov) throw new Error('Solflare not found')
        const res = await prov.connect(opts)
        const addr = toB58(res?.publicKey) || toB58(prov?.publicKey)
        if (!addr) throw new Error('No public key from Solflare')
        return { address: addr, provider: prov }
      },
    })

    // Exodus
    const exodus = window.exodus?.solana
    list.push({
      id: 'exodus',
      name: 'Exodus',
      installed: !!exodus,
      icon: <IconExodus />,
      installUrl: 'https://www.exodus.com/download/',
      on: exodus?.on?.bind(exodus),
      off: exodus?.off?.bind(exodus),
      connect: async (opts?: any) => {
        const prov = window.exodus?.solana
        if (!prov) throw new Error('Exodus not found')
        const res = await prov.connect(opts)
        const addr = toB58(res?.publicKey) || toB58(prov?.publicKey)
        if (!addr) throw new Error('No public key from Exodus')
        return { address: addr, provider: prov }
      },
    })

    // Wallet Standard “other” (first non-listed wallet)
    try {
      const std = window.wallets?.get?.() || []
      const other = std.find((w: any) =>
        !['phantom','backpack','solflare','exodus'].some(k => (w.name || '').toLowerCase().includes(k))
      )
      if (other) {
        list.push({
          id: 'other',
          name: other.name || 'Solana Wallet',
          installed: true,
          icon: <IconGeneric />,
          on: other?.on?.bind(other),
          off: other?.off?.bind(other),
          connect: async (opts?: any) => {
            const r = await (other as any).connect(opts)
            const addr = toB58(r?.publicKey) || toB58((other as any)?.publicKey)
            if (!addr) throw new Error('No public key from wallet')
            return { address: addr, provider: other }
          },
        })
      }
    } catch {}

    return list
  }, [])

  // UI note
  useEffect(() => {
    const installed = providers.filter(p => p.installed).map(p => p.name)
    setDetectedNote(installed.length ? `Detected: ${installed.join(' • ')}` : 'No wallet detected yet on this device.')
  }, [providers])

  // —— Event wiring for active provider (accountChanged / disconnect)
  const attachProviderEvents = (prov: any, walletId: WalletId) => {
    detachProviderEvents()
    currentProviderRef.current = prov

    const onAccount = (pk: any) => {
      const addr = toB58(pk)
      if (!addr) {
        safeSetSaved(null)
        setConnectedAddr(null)
        setConnectedId(null)
        return
      }
      safeSetSaved(addr)
      setConnectedAddr(addr)
      setConnectedId(walletId)
      onConnected(addr)
    }
    const onDisconnect = () => {
      safeSetSaved(null)
      setConnectedAddr(null)
      setConnectedId(null)
    }
    const onConnect = (args?: any) => {
      const addr = toB58(args?.publicKey) || toB58(prov?.publicKey)
      if (addr) {
        safeSetSaved(addr)
        setConnectedAddr(addr)
        setConnectedId(walletId)
        onConnected(addr)
      }
    }

    listenersRef.current = { onAccount, onDisconnect, onConnect }
    prov?.on?.('accountChanged', onAccount)
    prov?.on?.('disconnect', onDisconnect)
    prov?.on?.('connect', onConnect)
  }

  const detachProviderEvents = () => {
    const prov = currentProviderRef.current
    if (!prov) return
    try {
      const L = listenersRef.current
      prov?.off?.('accountChanged', L.onAccount)
      prov?.off?.('disconnect', L.onDisconnect)
      prov?.off?.('connect', L.onConnect)
    } catch {}
    listenersRef.current = {}
    currentProviderRef.current = null
  }

  // —— Auto: saved OR silent reconnect
  useEffect(() => {
    if (didAuto.current) return
    didAuto.current = true

    const saved = safeGetSaved()
    if (saved) {
      setConnectedAddr(saved)
      onConnected(saved) // parent: route to HomeHub
    }

    ;(async () => {
      for (const w of providers) {
        if (!w.installed) continue
        try {
          const { address, provider } = await w.connect({ onlyIfTrusted: true })
          if (address) {
            attachProviderEvents(provider, w.id)
            safeSetSaved(address)
            setConnectedAddr(address)
            setConnectedId(w.id)
            onConnected(address)
            return
          }
        } catch {}
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers])

  // —— Core connect flow
  const onPick = async (w: WalletItem) => {
    setError(null)
    setConnectingId(w.id)
    try {
      // iPhone: open this page inside Phantom first so the approval sheet appears
      if (w.id === 'phantom' && isiOS() && !isPhantomInApp()) {
        window.location.href = phantomBrowseLink()
        return
      }

      if (!w.installed) {
        window.open(w.installUrl!, '_blank', 'noopener,noreferrer')
        setError(`${w.name} is not installed on this device.`)
        return
      }

      const { address, provider } = await w.connect()
      if (!address || address.length < 32 || address.length > 60) throw new Error('Invalid address returned')

      if (SIGN_ON_CONNECT) {
        const nonce = makeNonce()
        const message = SIGNING_MESSAGE + nonce
        const encoded = new TextEncoder().encode(message)
        try {
          await provider?.signMessage?.(encoded, 'utf8')
          // send {address, nonce, signature} to backend if you add auth
        } catch (e: any) {
          throw new Error('Signature was rejected — cannot continue.')
        }
      }

      attachProviderEvents(provider, w.id)
      safeSetSaved(address)
      setConnectedAddr(address)
      setConnectedId(w.id)
      onConnected(address) // parent: navigate('/homehub')
    } catch (e: any) {
      setError(e?.message || `Failed to connect with ${w.name}`)
    } finally {
      setConnectingId(null)
    }
  }

  // —— Disconnect
  const onDisconnectClick = async () => {
    try {
      const prov = currentProviderRef.current
      await prov?.disconnect?.()
    } catch {}
    detachProviderEvents()
    safeSetSaved(null)
    setConnectedAddr(null)
    setConnectedId(null)
  }

  return (
    <div className="screen">
      <Style />

      <div className="cw-wrap">
        <div className="cw-top">
          {onBack && <button className="cw-back" onClick={onBack} aria-label="Back">←</button>}
          <h2 className="cw-title">Connect Wallet</h2>
          <div style={{ width: 36 }} />
        </div>

        <div className="cw-card cw-hero">
          <h1>Connect your Solana wallet</h1>
          <p>Securely link your real wallet to join contests, receive rewards, and save your progress.</p>
          <div className="cw-bullets">
            <div>✓ Non-custodial — you keep your keys</div>
            <div>✓ Works with Phantom, Backpack, Solflare, Exodus</div>
            <div>✓ One-tap reconnect next time</div>
          </div>

          {connectedAddr ? (
            <div className="cw-connected">
              <div className="addr-tag">
                Connected as <strong>{connectedAddr.slice(0,6)}…{connectedAddr.slice(-4)}</strong>
              </div>
              <div className="connected-actions">
                <button onClick={() => { navigator.clipboard?.writeText(connectedAddr) }}>Copy Address</button>
                <button onClick={onDisconnectClick}>Disconnect</button>
              </div>
            </div>
          ) : null}
        </div>

        {/* iOS helper: if not inside Phantom, show "Open in Phantom" */}
        {isiOS() && !isPhantomInApp() && (
          <div className="cw-card" style={{ margin: '8px 0', textAlign: 'center' }}>
            <p style={{ margin: 0, opacity: .9 }}>
              On iPhone, connecting works best inside the Phantom app.
            </p>
            <a
              href={phantomBrowseLink()}
              className="btn"
              style={{
                display:'inline-block', marginTop:8, padding:'10px 14px',
                borderRadius:12, border:'1px solid rgba(255,255,255,0.2)'
              }}
            >
              Open this page in Phantom
            </a>
          </div>
        )}

        {detectedNote && <div className="cw-note subtle">{detectedNote}</div>}

        <div className="cw-grid">
          {providers.map(w => (
            <button
              key={w.id}
              className={`cw-wallet ${w.installed ? 'is-live' : 'is-ghost'} ${connectingId === w.id ? 'is-loading' : ''}`}
              onClick={() => onPick(w)}
            >
              <span className="cw-icon">{w.icon}</span>
              <span className="cw-meta">
                <span className="cw-name">{w.name}</span>
                <span className="cw-sub">{w.installed ? 'Connect' : 'Get'}</span>
              </span>
              <span className="cw-chevron">→</span>
            </button>
          ))}
        </div>

        {error && <div className="cw-error">{error}</div>}

        <div className="cw-secure subtle">
          We store only your public wallet address. We never request your seed phrase or private key.
        </div>
      </div>
    </div>
  )
}

/* ---------- Icons (inline) ---------- */
function IconPhantom() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#8b5cf6" />
      <circle cx="9.5" cy="11" r="1.4" fill="#fff" />
      <circle cx="14.5" cy="11" r="1.4" fill="#fff" />
    </svg>
  )
}
function IconBackpack() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="4" fill="#22c55e" />
      <rect x="7" y="8.5" width="10" height="4" rx="2" fill="#fff" />
    </svg>
  )
}
function IconSolflare() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#f97316" />
      <path d="M12 6l4 6-4 6-4-6 4-6z" fill="#fff" />
    </svg>
  )
}
function IconExodus() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" fill="#60a5fa" />
      <path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}
function IconGeneric() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#94a3b8" />
      <path d="M8 12h8M12 8v8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

/* ---------- Styles (beautiful glow + cards) ---------- */
function Style() {
  return (
    <style>{`
      .cw-wrap { max-width: 920px; margin: 0 auto; padding: 14px; }

      .cw-top { display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px; }
      .cw-back {
        width:36px; height:36px; border-radius:10px; border:1px solid rgba(255,255,255,0.16);
        background:linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05)); color:#fff;
      }
      .cw-title { margin: 0; }

      .cw-card {
        border:1px solid rgba(255,255,255,0.16);
        background:linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
        border-radius:16px; padding:16px; backdrop-filter: blur(8px);
      }
      .cw-hero { margin: 6px 0 12px; text-align: center; }
      .cw-hero h1 { margin:0 0 6px; font-size: clamp(22px, 4.8vw, 38px); }
      .cw-hero p { margin:0 0 10px; color: rgba(255,255,255,0.85); }
      .cw-bullets { display:grid; gap:6px; color: rgba(255,255,255,0.9); justify-content:center; }

      .cw-connected {
        display:flex; align-items:center; justify-content:center; gap:10px; margin-top:10px; flex-wrap:wrap;
      }
      .addr-tag {
        padding: 8px 10px; border-radius: 999px; background: #0b1220;
        border: 1px solid rgba(255,255,255,0.06); font-family: monospace;
      }
      .connected-actions button { margin-left: 6px; }

      .cw-note { margin: 8px 0 12px; text-align: center; }

      .cw-grid { display:grid; gap:10px; margin: 10px 0 12px; }
      .cw-wallet {
        display:flex; align-items:center; gap:12px; width:100%;
        padding:12px; border-radius:14px; position:relative; overflow:hidden;
        border:1px solid rgba(255,255,255,0.16);
        background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05));
        transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
        text-align:left; color:#fff;
      }
      .cw-wallet.is-live:hover {
        transform: translateY(-1px);
        border-color: rgba(255,255,255,0.28);
        box-shadow: 0 14px 30px rgba(99,102,241,0.30), inset 0 0 60px rgba(255,255,255,0.06);
      }
      .cw-wallet.is-ghost { opacity: .9; }
      .cw-wallet.is-ghost .cw-sub { opacity: .85; }
      .cw-wallet.is-loading { opacity: .6; pointer-events:none; }

      .cw-icon { width:34px; height:34px; display:grid; place-items:center; border-radius:10px;
        background: radial-gradient(circle at 30% 30%, rgba(99,102,241,0.35), rgba(236,72,153,0.35));
      }
      .cw-meta { display:flex; flex-direction:column; gap:2px; }
      .cw-name { font-weight:900; letter-spacing:.2px; }
      .cw-sub { font-size:12px; opacity:.9; }
      .cw-chevron { margin-left:auto; font-weight:900; opacity:.8; }

      .cw-error {
        color: #ffb4b4;
        background: rgba(255, 0, 0, 0.12);
        border: 1px solid rgba(255, 0, 0, 0.22);
        border-radius: 12px;
        padding: 10px 12px;
        margin: 8px 0 12px;
        text-align:center;
      }

      .cw-secure { text-align:center; opacity:.85; }
    `}</style>
  )
}

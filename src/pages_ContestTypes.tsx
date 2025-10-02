// src/pages_ContestTypes.tsx
import React, { useMemo, useState } from 'react'
import {
  Connection,
  SystemProgram,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js'

type Props = {
  onBack?: () => void
  onJoined: (mode: 'weekly' | 'monthly' | 'seasonal') => void
}

/* ===================== Config ===================== */
// Use 'devnet' for testing. Switch to 'mainnet-beta' for production.
const CLUSTER: 'devnet' | 'mainnet-beta' | 'testnet' = 'devnet'

// <-- PUT YOUR TREASURY (recipient) WALLET ADDRESS HERE
const TREASURY = 'YOUR_TREASURY_WALLET_ADDRESS'

// Entry price (USD). We’ll convert to SOL using a price value (see getSolUsd()).
const ENTRY_USD = 5

// Fallback SOL price (USD) if you haven’t wired a live price yet.
// You can override at runtime with: localStorage.setItem('sol_usd', '136.42')
const SOL_PRICE_FALLBACK = 150

/* ===================== Helpers ===================== */
const hasWallet = () => {
  try { return !!localStorage.getItem('sol_wallet') } catch { return false }
}
const setContestMode = (mode: 'weekly'|'monthly'|'seasonal') => {
  try { localStorage.setItem('contest_mode', mode) } catch {}
}
const setLastSig = (sig: string) => {
  try { localStorage.setItem('last_entry_sig', sig) } catch {}
}
const getLastSig = () => {
  try { return localStorage.getItem('last_entry_sig') } catch { return null }
}

// Read a SOL/USD price from localStorage if you’ve set one; otherwise fallback.
// Later you can replace this with a fetch to your backend price endpoint.
const getSolUsd = (): number => {
  try {
    const v = localStorage.getItem('sol_usd')
    const n = v ? parseFloat(v) : NaN
    return Number.isFinite(n) && n > 0 ? n : SOL_PRICE_FALLBACK
  } catch { return SOL_PRICE_FALLBACK }
}

function lamportsFromUsd(usd: number, solUsdPrice: number): number {
  if (!solUsdPrice || solUsdPrice <= 0) throw new Error('Invalid SOL price')
  const sol = usd / solUsdPrice
  return Math.round(sol * LAMPORTS_PER_SOL)
}

// Get any injected Solana provider (Phantom / Backpack / Solflare / Exodus)
function getProvider(): any | null {
  const w: any = typeof window !== 'undefined' ? window : {}
  if (w.solana?.isPhantom) return w.solana
  if (w.phantom?.solana) return w.phantom.solana
  if (w.backpack) return w.backpack
  if (w.solflare) return w.solflare
  if (w.exodus?.solana) return w.exodus.solana
  return null
}

/* ===================== Page ===================== */
export default function ContestTypes({ onBack, onJoined }: Props) {
  const walletConnected = hasWallet()
  const [modal, setModal] = useState<null | { mode: 'weekly'|'monthly'|'seasonal' }>(null)
  const [err, setErr] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [lastSig, setLastSigState] = useState<string | null>(getLastSig())

  const cards = useMemo(() => ([
    {
      mode: 'weekly' as const,
      title: 'Weekly Contest',
      badge: '11 players · no transfers',
      desc: 'Pick 11 within £100m. Locked for one weekend. FPL scoring. Closes at first kickoff.',
      accent: 'rgba(99,102,241,0.35)',
      onJoin: () => openJoin('weekly'),
    },
    {
      mode: 'monthly' as const,
      title: 'Monthly Contest',
      badge: '13 players · 1 transfer/week',
      desc: 'Runs for 4–5 gameweeks. One transfer each week. Budget adjusts when you sell/buy.',
      accent: 'rgba(34,197,94,0.35)',
      onJoin: () => openJoin('monthly'),
    },
    {
      mode: 'seasonal' as const,
      title: 'Seasonal Contest',
      badge: '15 players · 1 transfer per GW',
      desc: 'Full-season challenge. One transfer each gameweek. Cumulative leaderboard.',
      accent: 'rgba(236,72,153,0.35)',
      onJoin: () => openJoin('seasonal'),
    },
  ]), [])

  function openJoin(mode: 'weekly'|'monthly'|'seasonal') {
    setErr(null)
    if (!walletConnected) {
      setErr('Connect your wallet first (Back → Connect Wallet).')
      return
    }
    setModal({ mode })
  }

  async function payAndJoinReal() {
    if (!modal) return
    setErr(null)
    setPaying(true)
    try {
      const provider = getProvider()
      if (!provider) throw new Error('No Solana wallet detected. Open Phantom/Backpack/Solflare and try again.')

      // Ensure we’re connected (opens wallet popup if needed)
      const res = await provider.connect?.()
      const fromBase58: string =
        res?.publicKey?.toBase58?.() ||
        res?.publicKey ||
        provider?.publicKey?.toBase58?.() ||
        provider?.publicKey?.toString?.()
      if (!fromBase58) throw new Error('Could not read wallet public key')

      const fromPk = new PublicKey(fromBase58)
      const toPk = new PublicKey(TREASURY)

      // Convert $5 → lamports using your price getter
      const price = getSolUsd()
      const lamports = lamportsFromUsd(ENTRY_USD, price)

      // On devnet, apply a small floor (~0.002 SOL) to avoid dust if your fallback is stale
      const min = Math.round(0.002 * LAMPORTS_PER_SOL)
      const amountLamports = Math.max(lamports, CLUSTER === 'devnet' ? min : lamports)

      // Build & send tx
      const conn = new Connection(clusterApiUrl(CLUSTER), 'confirmed')
      const ix = SystemProgram.transfer({ fromPubkey: fromPk, toPubkey: toPk, lamports: amountLamports })
      const tx = new Transaction().add(ix)
      tx.feePayer = fromPk
      tx.recentBlockhash = (await conn.getLatestBlockhash('finalized')).blockhash

      // Ask wallet to sign & send
      const sigRes = await provider.signAndSendTransaction(tx)
      const signature: string = sigRes?.signature || sigRes
      if (!signature) throw new Error('No transaction signature returned by wallet')

      // Wait for confirmation
      await conn.confirmTransaction({ signature, ...(await conn.getLatestBlockhash()) }, 'confirmed')

      // Save receipt + contest mode for downstream rules (CreateTeam/transfers)
      setLastSig(signature)
      setLastSigState(signature)
      setContestMode(modal.mode)

      setModal(null)
      onJoined(modal.mode)
    } catch (e: any) {
      setErr(e?.message || 'Payment failed. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  const explorerUrl = lastSig
    ? (CLUSTER === 'mainnet-beta'
        ? `https://solscan.io/tx/${lastSig}`
        : `https://solscan.io/tx/${lastSig}?cluster=${CLUSTER}`)
    : null

  return (
    <div className="screen">
      <Style />

      <div className="ctypes-wrap">
        {/* Top bar */}
        <div className="ctypes-top">
          {onBack && <button className="ct-back" onClick={onBack} aria-label="Back">←</button>}
          <h2 className="ct-title">Join contest</h2>
          <div style={{width:36}} />
        </div>

        {/* Intro / wallet status */}
        <div className="ct-card ct-head">
          <div className="ct-row">
            <div className="ct-pill">${ENTRY_USD} entry</div>
            <div className="ct-pill">Prize Leaderboards</div>
            <div className={`ct-pill ${walletConnected ? 'is-ok' : 'is-warn'}`}>
              {walletConnected ? 'Wallet connected' : 'Connect wallet to join'}
            </div>
          </div>
          {explorerUrl && (
            <div className="subtle" style={{ marginTop: 8 }}>
              Last payment: <a href={explorerUrl} target="_blank" rel="noreferrer">View on Solscan</a>
            </div>
          )}
        </div>

        {/* Contest cards */}
        <div className="ct-grid">
          {cards.map(c => (
            <div key={c.mode} className="ct-card ct-item" style={{ '--accent': c.accent } as React.CSSProperties}>
              <div className="ct-item-top">
                <div className="ct-icon" />
                <div className="ct-item-meta">
                  <div className="ct-item-title">{c.title}</div>
                  <div className="ct-item-badge">{c.badge}</div>
                </div>
              </div>
              <p className="ct-item-desc">{c.desc}</p>
              <button className="ct-join" onClick={c.onJoin} disabled={!walletConnected}>
                Join for ${ENTRY_USD} in SOL
              </button>
            </div>
          ))}
        </div>

        {/* Error */}
        {err && <div className="ct-err">{err}</div>}

        {/* Payment modal */}
        {modal && (
          <div className="ct-modal" role="dialog" aria-modal="true">
            <div className="ct-modal-inner">
              <div className="ct-modal-title">Confirm entry</div>
              <div className="ct-modal-info">
                You’re joining <strong>{modal.mode}</strong> contest. Entry fee:
                <strong> ${ENTRY_USD} in SOL</strong>.
              </div>
              <div className="ct-modal-actions">
                <button className="ct-ghost" onClick={() => setModal(null)} disabled={paying}>Cancel</button>
                <button className={`ct-pay ${paying ? 'is-loading' : ''}`} onClick={payAndJoinReal} disabled={paying}>
                  {paying ? 'Processing…' : 'Pay & Join'}
                </button>
              </div>
              <div className="ct-receipt subtle">
                Network: <b>{CLUSTER}</b> · Treasury: <b>{TREASURY.slice(0,4)}…{TREASURY.slice(-4)}</b>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ===================== Styles ===================== */
function Style() {
  return (
    <style>{`
      .ctypes-wrap { max-width: 960px; margin: 0 auto; padding: 14px; }

      .ctypes-top { display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px; }
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
      .ct-head { margin-bottom: 12px; }
      .ct-row { display:flex; gap:8px; flex-wrap: wrap; }
      .ct-pill {
        border:1px solid rgba(255,255,255,0.18);
        background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05));
        border-radius: 999px;
        padding:6px 10px; font-size:12px;
      }
      .ct-pill.is-ok { border-color: rgba(34,197,94,0.6); }
      .ct-pill.is-warn { border-color: rgba(234,179,8,0.6); }

      .ct-grid { display:grid; gap:12px; grid-template-columns: 1fr; }
      @media (min-width: 720px) { .ct-grid { grid-template-columns: 1fr 1fr 1fr; } }

      .ct-item { position:relative; overflow:hidden; }
      .ct-item::before {
        content:""; position:absolute; inset:-2px;
        background: radial-gradient(circle at 10% 10%, var(--accent, rgba(99,102,241,0.35)), transparent 60%);
        filter: blur(18px); opacity:.6; z-index:-1;
      }
      .ct-item-top { display:flex; align-items:center; gap:10px; }
      .ct-icon { width:36px; height:36px; border-radius:10px;
        background: radial-gradient(circle at 30% 30%, rgba(99,102,241,0.45), rgba(236,72,153,0.45));
      }
      .ct-item-meta { display:flex; flex-direction:column; gap:3px; }
      .ct-item-title { font-weight:900; letter-spacing:.2px; }
      .ct-item-badge { font-size:12px; opacity:.9; }

      .ct-item-desc { margin:10px 0 14px; color: rgba(255,255,255,0.90); }

      .ct-join {
        width:100%; height:42px;
        border-radius:12px; border:1px solid rgba(255,255,255,0.22);
        font-weight:900; color:#fff;
        background: linear-gradient(135deg, rgba(99,102,241,0.55), rgba(236,72,153,0.55));
        transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
      }
      .ct-join:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.32); box-shadow: 0 14px 36px rgba(99,102,241,0.35); }
      .ct-join:disabled { opacity:.55; cursor:not-allowed; }

      .ct-err {
        color: #ffb4b4;
        background: rgba(255, 0, 0, 0.12);
        border: 1px solid rgba(255, 0, 0, 0.22);
        border-radius: 12px; padding: 10px 12px; margin: 8px 0 12px; text-align:center;
      }

      .ct-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display:grid; place-items:center; z-index: 200; }
      .ct-modal-inner {
        width: min(460px, 92vw);
        border-radius:16px; border:1px solid rgba(255,255,255,0.18);
        background: linear-gradient(135deg, rgba(17,24,39,0.95), rgba(17,24,39,0.75));
        padding: 16px;
      }
      .ct-modal-title { font-weight:900; margin-bottom: 8px; }
      .ct-modal-info { opacity:.95; margin-bottom: 12px; }
      .ct-modal-actions { display:flex; gap:10px; justify-content:flex-end; }
      .ct-ghost {
        border:1px solid rgba(255,255,255,0.22); background: transparent; color:#fff;
        border-radius: 10px; padding: 8px 12px; font-weight: 700;
      }
      .ct-pay {
        border:1px solid rgba(255,255,255,0.22);
        background: linear-gradient(135deg, rgba(99,102,241,0.65), rgba(236,72,153,0.65));
        color:#fff; border-radius: 10px; padding: 8px 14px; font-weight: 900;
      }
      .ct-pay.is-loading { opacity:.7; pointer-events:none; }
      .ct-receipt { margin-top: 8px; text-align: right; }
    `}</style>
  )
}

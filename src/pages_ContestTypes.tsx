// src/pages_ContestTypes.tsx
import React, { useMemo, useState } from 'react'
import {
  Connection,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  // v0 txs (fixes staticAccountKeys error in some wallets)
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'

type Props = {
  onBack?: () => void
  onJoined: (mode: 'weekly' | 'monthly' | 'seasonal') => void
}

/* ===================== Config ===================== */
const CLUSTER: 'devnet' | 'mainnet-beta' | 'testnet' = 'devnet'

// ⬇️  IMPORTANT: real base58 treasury address (no spaces)
const TREASURY: string = '8569mYKpddFZsAkQYRrNgNiDKoYYd87UbmmpwvjJiyt2'

// $5 entry for SOL path; token path sends a fixed amount below
const ENTRY_USD = 5
const SOL_PRICE_FALLBACK = 150

// OPTIONAL: set a devnet mint to enable the Test Token option.
// Leave empty ("") if you don't have a mint yet.
const TEST_TOKEN_MINT: string = ''      // e.g. "9xY…MintAddress"
const TEST_TOKEN_DECIMALS = 6
const TEST_TOKEN_AMOUNT = 5n * BigInt(10 ** TEST_TOKEN_DECIMALS)

/* ===================== Helpers ===================== */
const hasWallet = () => { try { return !!localStorage.getItem('sol_wallet') } catch { return false } }
const setContestMode = (mode: 'weekly'|'monthly'|'seasonal') => { try { localStorage.setItem('contest_mode', mode) } catch {} }
const setLastSig = (sig: string) => { try { localStorage.setItem('last_entry_sig', sig) } catch {} }
const getLastSig = () => { try { return localStorage.getItem('last_entry_sig') } catch { return null } }

const getSolUsd = (): number => {
  try { const v = localStorage.getItem('sol_usd'); const n = v ? parseFloat(v) : NaN; return Number.isFinite(n)&&n>0 ? n : SOL_PRICE_FALLBACK } catch { return SOL_PRICE_FALLBACK }
}

function lamportsFromUsd(usd: number, solUsdPrice: number): number {
  if (!solUsdPrice || solUsdPrice <= 0) throw new Error('Invalid SOL price')
  const sol = usd / solUsdPrice
  return Math.round(sol * LAMPORTS_PER_SOL)
}

function getProvider(): any | null {
  const w: any = typeof window !== 'undefined' ? window : {}
  if (w.solana?.isPhantom) return w.solana
  if (w.phantom?.solana) return w.phantom.solana
  if (w.backpack) return w.backpack
  if (w.solflare) return w.solflare
  if (w.exodus?.solana) return w.exodus.solana
  return null
}

/** ALWAYS load SPL-Token from CDN so no npm install is required. */
async function getSpl() {
  const cdn = 'https://esm.sh/@solana/spl-token@0.4.7?bundle'
  // @vite-ignore
  const m = await import(cdn)
  return m
}

/** Safe short mask for addresses in UI */
function maskAddr(addr: string | null | undefined): string {
  if (!addr) return '—'
  const s = String(addr)
  if (s.length <= 8) return s
  return `${s.slice(0,4)}…${s.slice(-4)}`
}

/** Validate a base58 address early to avoid "Non-base58 character" errors */
function assertValidAddress(name: string, addr: string) {
  const trimmed = (addr || '').trim()
  try {
    new PublicKey(trimmed) // throws if invalid
  } catch {
    throw new Error(`${name} address is invalid. Please paste a valid base58 Solana address.`)
  }
  return trimmed
}

/* ===================== Page ===================== */
export default function ContestTypes({ onBack, onJoined }: Props) {
  const walletConnected = hasWallet()
  const [modal, setModal] = useState<null | { mode: 'weekly'|'monthly'|'seasonal' }>(null)
  const [err, setErr] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [lastSig, setLastSigState] = useState<string | null>(getLastSig())
  const [payWith, setPayWith] = useState<'SOL'|'TOKEN'>(() => (TEST_TOKEN_MINT ? 'TOKEN' : 'SOL'))

  const tokenEnabled = Boolean(TEST_TOKEN_MINT && TEST_TOKEN_MINT.length > 0)

  const cards = useMemo(() => ([
    { mode: 'weekly' as const,   title: 'Weekly Contest',  badge: '11 players · no transfers',
      desc: 'Pick 11 within £100m. Locked for one weekend. FPL scoring. Closes at first kickoff.',
      accent: 'rgba(99,102,241,0.35)', onJoin: () => openJoin('weekly') },
    { mode: 'monthly' as const,  title: 'Monthly Contest', badge: '13 players · 1 transfer/week',
      desc: 'Runs for 4–5 gameweeks. One transfer each week. Budget adjusts when you sell/buy.',
      accent: 'rgba(34,197,94,0.35)', onJoin: () => openJoin('monthly') },
    { mode: 'seasonal' as const, title: 'Seasonal Contest',badge: '15 players · 1 transfer per GW',
      desc: 'Full-season challenge. One transfer each gameweek. Cumulative leaderboard.',
      accent: 'rgba(236,72,153,0.35)', onJoin: () => openJoin('seasonal') },
  ]), [])

  function openJoin(mode: 'weekly'|'monthly'|'seasonal') {
    setErr(null)
    if (!walletConnected) { setErr('Connect your wallet first (Back → Connect Wallet).'); return }
    setModal({ mode })
  }

  async function payAndJoin() {
    if (!modal) return
    setErr(null); setPaying(true)
    try {
      if (payWith === 'TOKEN') {
        await payWithToken()
      } else {
        await payWithSol()
      }
      setContestMode(modal.mode)
      setModal(null)
      onJoined(modal.mode)
    } catch (e: any) {
      setErr(e?.message || 'Payment failed. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  /** Path A: real SOL transfer (VersionedTransaction v0) */
  async function payWithSol() {
    const provider = getProvider()
    if (!provider) throw new Error('No Solana wallet detected.')

    const res = await provider.connect?.()
    const fromBase58: string =
      res?.publicKey?.toBase58?.() ||
      res?.publicKey ||
      provider?.publicKey?.toBase58?.() ||
      provider?.publicKey?.toString?.()
    if (!fromBase58) throw new Error('Could not read wallet public key')

    const fromPk = new PublicKey(assertValidAddress('Sender', fromBase58))
    const toPk   = new PublicKey(assertValidAddress('Treasury', TREASURY))

    const price = getSolUsd()
    const lamports = lamportsFromUsd(ENTRY_USD, price)

    // Devnet floor (~0.002 SOL) to avoid dust with stale price
    const min = Math.round(0.002 * LAMPORTS_PER_SOL)
    const amountLamports = Math.max(lamports, CLUSTER === 'devnet' ? min : lamports)

    const conn = new Connection(clusterApiUrl(CLUSTER), 'confirmed')
    const ix = SystemProgram.transfer({ fromPubkey: fromPk, toPubkey: toPk, lamports: amountLamports })

    // v0 message + VersionedTransaction
    const { blockhash } = await conn.getLatestBlockhash('finalized')
    const msg = new TransactionMessage({
      payerKey: fromPk,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message()
    const tx = new VersionedTransaction(msg)

    const sigRes = await provider.signAndSendTransaction(tx)
    const signature: string = sigRes?.signature || sigRes
    if (!signature) throw new Error('No transaction signature returned by wallet')

    await conn.confirmTransaction(signature, 'confirmed')
    setLastSig(signature); setLastSigState(signature)
  }

  /** Path B: SPL Test Token transfer (VersionedTransaction v0; only if TEST_TOKEN_MINT is set) */
  async function payWithToken() {
    if (!tokenEnabled) throw new Error('Test token mint not configured.')
    const provider = getProvider()
    if (!provider) throw new Error('No Solana wallet detected.')

    const res = await provider.connect?.()
    const fromBase58: string =
      res?.publicKey?.toBase58?.() ||
      res?.publicKey ||
      provider?.publicKey?.toBase58?.() ||
      provider?.publicKey?.toString?.()
    if (!fromBase58) throw new Error('Could not read wallet public key')

    const fromPk  = new PublicKey(assertValidAddress('Sender', fromBase58))
    const mintPk  = new PublicKey(assertValidAddress('Token mint', TEST_TOKEN_MINT))
    const toOwner = new PublicKey(assertValidAddress('Treasury', TREASURY))
    const amount  = TEST_TOKEN_AMOUNT // e.g., 5 * 10^decimals

    const conn = new Connection(clusterApiUrl(CLUSTER), 'confirmed')
    const spl = await getSpl()

    const fromAta = await spl.getAssociatedTokenAddress(mintPk, fromPk, false, spl.TOKEN_PROGRAM_ID, spl.ASSOCIATED_TOKEN_PROGRAM_ID)
    const toAta   = await spl.getAssociatedTokenAddress(mintPk, toOwner, false, spl.TOKEN_PROGRAM_ID, spl.ASSOCIATED_TOKEN_PROGRAM_ID)

    const ixes: any[] = []
    const fromAtaInfo = await conn.getAccountInfo(fromAta)
    if (!fromAtaInfo) {
      ixes.push(spl.createAssociatedTokenAccountInstruction(fromPk, fromAta, fromPk, mintPk, spl.TOKEN_PROGRAM_ID, spl.ASSOCIATED_TOKEN_PROGRAM_ID))
    }
    const toAtaInfo = await conn.getAccountInfo(toAta)
    if (!toAtaInfo) {
      ixes.push(spl.createAssociatedTokenAccountInstruction(fromPk, toAta, toOwner, mintPk, spl.TOKEN_PROGRAM_ID, spl.ASSOCIATED_TOKEN_PROGRAM_ID))
    }
    ixes.push(spl.createTransferInstruction(
      fromAta, toAta, fromPk, Number(amount), [], spl.TOKEN_PROGRAM_ID
    ))

    // v0 message + VersionedTransaction
    const { blockhash } = await conn.getLatestBlockhash('finalized')
    const msg = new TransactionMessage({
      payerKey: fromPk,
      recentBlockhash: blockhash,
      instructions: ixes,
    }).compileToV0Message()
    const tx = new VersionedTransaction(msg)

    const sigRes = await provider.signAndSendTransaction(tx)
    const signature: string = sigRes?.signature || sigRes
    if (!signature) throw new Error('No transaction signature returned by wallet')

    await conn.confirmTransaction(signature, 'confirmed')
    setLastSig(signature); setLastSigState(signature)
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

        {/* Intro / wallet status + payment method */}
        <div className="ct-card ct-head">
          <div className="ct-row">
            <div className="ct-pill">${ENTRY_USD} entry</div>
            <div className="ct-pill">Prize Leaderboards</div>
            <div className={`ct-pill ${walletConnected ? 'is-ok' : 'is-warn'}`}>
              {walletConnected ? 'Wallet connected' : 'Connect wallet to join'}
            </div>
            <div className="pay-method">
              <label>Pay with:</label>
              <select value={payWith} onChange={e => setPayWith(e.target.value as any)}>
                <option value="SOL">SOL ({CLUSTER})</option>
                {tokenEnabled && <option value="TOKEN">Test Token</option>}
              </select>
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
              <button className="ct-join" onClick={() => openJoin(c.mode)} disabled={!walletConnected}>
                {payWith === 'SOL'
                  ? `Join for $${ENTRY_USD} in SOL`
                  : `Join for ${Number(TEST_TOKEN_AMOUNT) / 10 ** TEST_TOKEN_DECIMALS} TEST`}
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
                You’re joining <strong>{modal.mode}</strong> contest.
                {payWith === 'SOL' ? (
                  <> Entry fee: <strong>${ENTRY_USD} in SOL</strong>.</>
                ) : (
                  <> Entry fee: <strong>{Number(TEST_TOKEN_AMOUNT) / 10 ** TEST_TOKEN_DECIMALS} TEST</strong>.</>
                )}
              </div>
              <div className="ct-modal-actions">
                <button className="ct-ghost" onClick={() => setModal(null)} disabled={paying}>Cancel</button>
                <button className={`ct-pay ${paying ? 'is-loading' : ''}`} onClick={payAndJoin} disabled={paying}>
                  {paying ? 'Processing…' : 'Pay & Join'}
                </button>
              </div>
              <div className="ct-receipt subtle">
                Network: <b>{CLUSTER}</b> · Treasury: <b>{maskAddr(TREASURY)}</b>
                {payWith === 'TOKEN' && tokenEnabled && (<> · Mint: <b>{maskAddr(TEST_TOKEN_MINT)}</b></>)}
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
      .ct-row { display:flex; gap:8px; flex-wrap: wrap; align-items:center; }
      .ct-pill {
        border:1px solid rgba(255,255,255,0.18);
        background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05));
        border-radius: 999px; padding:6px 10px; font-size:12px;
      }
      .ct-pill.is-ok { border-color: rgba(34,197,94,0.6); }
      .ct-pill.is-warn { border-color: rgba(234,179,8,0.6); }

      .pay-method { display:flex; align-items:center; gap:6px; margin-left:auto; }
      .pay-method select {
        height:28px; border-radius:8px; border:1px solid rgba(255,255,255,0.2);
        background: rgba(255,255,255,0.06); color:#fff; padding: 0 8px;
      }

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

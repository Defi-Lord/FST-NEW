// src/sol/pay.ts
import {
  Connection,
  SystemProgram,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js'

type Cluster = 'devnet' | 'mainnet-beta' | 'testnet'
type Provider = any // Phantom/Backpack/Solflare/Exodus compatible

export const LPS = LAMPORTS_PER_SOL

export function getProvider(): Provider | null {
  // prefer Phantom if injected at window.solana
  if (typeof window !== 'undefined') {
    const w: any = window
    if (w.solana?.isPhantom) return w.solana
    if (w.phantom?.solana) return w.phantom.solana
    if (w.backpack) return w.backpack
    if (w.solflare) return w.solflare
    if (w.exodus?.solana) return w.exodus.solana
  }
  return null
}

export async function paySolEntry(opts: {
  recipient: string,         // your treasury wallet
  amountLamports: number,    // how much to send
  cluster?: Cluster,         // default: 'devnet' for testing
}): Promise<string> {
  const { recipient, amountLamports, cluster = 'devnet' } = opts
  const provider = getProvider()
  if (!provider) throw new Error('No Solana wallet provider found')

  // Ensure connected (will popup if not trusted)
  const r = await provider.connect?.()
  const fromPk = new PublicKey(r?.publicKey?.toBase58?.() || r?.publicKey || provider.publicKey)
  const toPk = new PublicKey(recipient)

  const conn = new Connection(clusterApiUrl(cluster), 'confirmed')

  const ix = SystemProgram.transfer({
    fromPubkey: fromPk,
    toPubkey: toPk,
    lamports: amountLamports,
  })

  const tx = new Transaction().add(ix)
  tx.feePayer = fromPk
  tx.recentBlockhash = (await conn.getLatestBlockhash('finalized')).blockhash

  // Phantom/Backpack/… sign+send
  const sigRes = await provider.signAndSendTransaction(tx)
  const signature = sigRes?.signature || sigRes
  if (!signature) throw new Error('No signature returned from wallet')

  // Optional: wait for confirmation
  await conn.confirmTransaction({ signature, ...(await conn.getLatestBlockhash()) }, 'confirmed')
  return signature
}

/** Helper to compute lamports from USD with a price you provide (from API or config) */
export function lamportsFromUsd(usd: number, solUsdPrice: number): number {
  if (!solUsdPrice || solUsdPrice <= 0) throw new Error('Invalid SOL price')
  const sol = usd / solUsdPrice
  return Math.round(sol * LAMPORTS_PER_SOL)
}

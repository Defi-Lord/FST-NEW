// src/main.tsx
import { Buffer } from 'buffer'
;(window as any).Buffer ??= Buffer

import React from 'react'
import { createRoot } from 'react-dom/client'

import { AppProvider } from './state'
import App from './App'

// Solana wallet providers
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import '@solana/wallet-adapter-react-ui/styles.css'

const SOLANA_RPC =
  (import.meta as any).env?.VITE_SOLANA_RPC ||
  'https://api.devnet.solana.com'

const endpoint = SOLANA_RPC
const wallets = [new PhantomWalletAdapter()]

const root = createRoot(document.getElementById('root')!)
root.render(
  <ConnectionProvider endpoint={endpoint}>
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
)

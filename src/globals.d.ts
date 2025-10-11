// src/globals.d.ts
export {};

type PhantomPublicKey = { toBase58: () => string };

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: PhantomPublicKey;
  connect: () => Promise<{ publicKey: PhantomPublicKey }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>;
};

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

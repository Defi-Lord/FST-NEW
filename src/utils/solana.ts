// apps/api/src/utils/solana.ts
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';

export function verifySolanaSignatureBase58(address: string, message: string, signature58: string) {
  const pub = new PublicKey(address);
  const msg = new TextEncoder().encode(message);
  const sig = bs58.decode(signature58);
  return nacl.sign.detached.verify(msg, sig, pub.toBytes());
}

export function verifySolanaSignatureBase64(address: string, message: string, signatureB64: string) {
  const pub = new PublicKey(address);
  const msg = new TextEncoder().encode(message);
  const sig = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
  return nacl.sign.detached.verify(msg, sig, pub.toBytes());
}

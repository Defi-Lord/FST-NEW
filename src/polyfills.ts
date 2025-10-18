// src/polyfills.ts
// Provide Buffer & process in the browser for deps that expect Node globals
import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

if (typeof (globalThis as any).process === 'undefined') {
  (globalThis as any).process = { env: {} } as any;
}

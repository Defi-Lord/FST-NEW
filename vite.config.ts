// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Vite 5 + browser build: add polyfills for Node core modules used by Solana/WC deps.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // also polyfill imports like `node:crypto`
      protocolImports: true,
      include: ['buffer', 'process', 'util', 'events', 'stream', 'path', 'crypto'],
    }),
  ],

  resolve: {
    alias: {
      // Ensure Node core modules used by deps resolve to browser equivalents
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      buffer: 'buffer',
      process: 'process/browser',
    },
  },

  define: {
    // provide globals expected by some libs
    global: 'globalThis',
    'process.env': {}, // keep empty object to avoid undefined errors
  },

  optimizeDeps: {
    esbuildOptions: {
      // Some packages assume `global` exists
      define: {
        global: 'globalThis',
      },
    },
  },

  build: {
    // in case some CJS slips in; helps mixed ESM/CJS libraries
    commonjsOptions: { transformMixedEsModules: true },
  },
});

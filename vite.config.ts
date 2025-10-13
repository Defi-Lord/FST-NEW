import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // keep defaults, but ensure common Node shims are on
      protocolImports: true
    })
  ],
  resolve: {
    alias: {
      // harden a few common polyfills
      buffer: "buffer",
      process: "process/browser",
      util: "util",
      events: "events",
      stream: "stream-browserify"
    }
  },
  optimizeDeps: {
    include: [
      "@solana/web3.js",
      "@solana/spl-token",
      "@solana/wallet-adapter-base",
      "@solana/wallet-adapter-react",
      "@solana/wallet-adapter-react-ui",
      "@solana/wallet-adapter-wallets"
    ]
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1600 // quiets large bundle warning
  }
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import nodePolyfills from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // keep it minimal; enough for web3 + wallet adapter
      include: ["buffer", "process", "util", "events", "stream", "assert"],
      globals: {
        Buffer: true,
        process: true
      }
    })
  ],
  resolve: {
    alias: {
      // ensure browser shims for Node core modules
      util: "node-stdlib-browser/util",
      events: "node-stdlib-browser/events",
      stream: "node-stdlib-browser/stream",
      assert: "node-stdlib-browser/assert",
      buffer: "node-stdlib-browser/buffer",
      process: "node-stdlib-browser/process"
    }
  },
  optimizeDeps: {
    include: [
      "@solana/web3.js",
      "@solana/wallet-adapter-react",
      "@solana/wallet-adapter-phantom",
      "@solana/wallet-adapter-react-ui"
    ]
  },
  build: {
    sourcemap: false
  }
});

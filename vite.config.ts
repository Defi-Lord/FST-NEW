// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // keep it light; Buffer/process is what wallet adapters need
      include: ['buffer', 'process', 'util', 'events', 'stream', 'path']
    })
  ],
  resolve: {
    alias: {
      // make sure Buffer is available
      buffer: 'buffer',
      process: 'process/browser'
    }
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // help Rollup not try to “externalize” these by accident
      // (we explicitly want them bundled)
      onwarn(warning, defaultHandler) {
        // quiet circular dep spam coming from node-stdlib-browser wrappers
        if (
          warning.code === 'CIRCULAR_DEPENDENCY' &&
          /node-stdlib-browser|ox\/_esm/.test(String(warning.message || ''))
        ) {
          return
        }
        defaultHandler(warning)
      }
    }
  },
  optimizeDeps: {
    include: [
      '@solana/web3.js',
      '@solana/spl-token',
      '@solana/wallet-adapter-react',
      '@solana/wallet-adapter-react-ui',
      '@solana/wallet-adapter-wallets',
      'buffer'
    ]
  }
})

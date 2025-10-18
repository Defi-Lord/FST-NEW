import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'events', 'stream', 'path']
    })
  ],
  resolve: {
    alias: {
      buffer: 'buffer',
      process: 'process/browser'
    }
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
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
      'buffer'
    ]
  }
})

// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import nodePolyfills from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      protocolImports: true,   // lets you import node:crypto, etc.
      // include: ['buffer','process'] // not necessary, but you can be explicit
    }),
  ],
  define: {
    // some libs check these
    'process.env': {},
    global: 'globalThis',
  },
  build: {
    target: 'es2020',
  },
  optimizeDeps: {
    // helps Vite prebundle Buffer/Process when needed
    include: ['buffer', 'process'],
  },
})

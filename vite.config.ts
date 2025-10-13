// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import nodePolyfills from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Allows `node:` protocol imports to be resolved in the browser
      protocolImports: true,
      // You can add more granular polyfills here if needed later
    }),
  ],

  // Some older web3/tooling expect these to exist
  define: {
    'process.env': {},
    global: 'globalThis',
  },

  // Keep modern targets; matches Vercel Node 20 build nicely
  build: {
    target: 'es2020',
    sourcemap: false,
  },

  // Speed up dev/build by pre-bundling these if they get used
  optimizeDeps: {
    include: ['buffer', 'process'],
  },
})

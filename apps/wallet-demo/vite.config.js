import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// The web relayer runs TFHE in a worker with SharedArrayBuffer, which needs cross-origin isolation.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}

export default defineConfig({
  plugins: [
    react(),
    // WDK's seed and key handling (bip39, sodium-universal) expects Buffer and process.
    nodePolyfills({ include: ['buffer', 'process'], globals: { Buffer: true, process: true } })
  ],
  resolve: {
    alias: {
      // The wallet module picks the relayer at runtime; the Node transport is never used here.
      '@zama-fhe/sdk/node': fileURLToPath(new URL('./src/node-relayer-stub.js', import.meta.url))
    }
  },
  // Pre-bundling would break the SDK's `new URL('./encrypt.worker.js', import.meta.url)`.
  optimizeDeps: { exclude: ['@zama-fhe/sdk'] },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
  server: { headers: isolation },
  preview: { headers: isolation }
})

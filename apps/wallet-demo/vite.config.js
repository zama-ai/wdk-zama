import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The web relayer runs TFHE in a worker with SharedArrayBuffer, which needs cross-origin isolation.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Map Node's buffer and process to their npm browser builds; the trailing slash skips the built-in.
      { find: /^(node:)?buffer$/, replacement: 'buffer/' },
      { find: /^(node:)?process$/, replacement: 'process/browser.js' },
      // The wallet module picks the relayer at runtime; the Node transport is never used here.
      { find: '@zama-fhe/sdk/node', replacement: fileURLToPath(new URL('./src/node-relayer-stub.js', import.meta.url)) }
    ]
  },
  // Pre-bundling would break the SDK's `new URL('./encrypt.worker.js', import.meta.url)`.
  optimizeDeps: { exclude: ['@zama-fhe/sdk'] },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
  server: { headers: isolation },
  preview: { headers: isolation }
})

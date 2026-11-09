// The web relayer runs TFHE in a worker with SharedArrayBuffer, which needs cross-origin isolation.
const isolation = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' }
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      // The wallet module picks the relayer at runtime; the Node transport is never used here.
      '@zama-fhe/sdk/node': { browser: './src/node-relayer-stub.js' }
    }
  },
  headers: async () => [{ source: '/:path*', headers: isolation }]
}

export default nextConfig

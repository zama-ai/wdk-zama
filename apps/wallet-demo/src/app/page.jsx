'use client'

import dynamic from 'next/dynamic'

// The wallet uses localStorage, IndexedDB and a TFHE worker, so it only renders in the browser.
const App = dynamic(() => import('../App.jsx'), { ssr: false })

export default function Page () {
  return <App />
}

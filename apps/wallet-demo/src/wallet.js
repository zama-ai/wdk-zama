// The wallet: WDK Core with the Zama EVM wallet module and the Zama shield protocol registered on
// Ethereum Sepolia. Everything the UI does goes through the WDK account or its swidge protocol.

import WDK from '@tetherto/wdk'
import { IndexedDBStorage } from '@zama-fhe/sdk'
import ZamaShieldProtocol from '@zama-fhe/wdk-protocol-swidge-zama'
import WalletManagerEvmZama, { CUSDT_MOCK_SEPOLIA, USDT_MOCK_SEPOLIA } from '@zama-fhe/wdk-wallet-evm-zama'
import { Interface } from 'ethers'

export const USDT = USDT_MOCK_SEPOLIA
export const CUSDT = CUSDT_MOCK_SEPOLIA
export const DECIMALS = 6
export const EXPLORER = 'https://eth-sepolia.blockscout.com'
export const RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'

const SEED_KEY = 'wdk-zama-demo:seed'
const MINT = new Interface(['function mint(address to, uint256 amount)'])

export const generateSeed = () => WDK.getRandomSeedPhrase()
export const isValidSeed = seed => WDK.isValidSeed(seed)

// Demo only: a real wallet keeps the seed in secure storage (for example wdk-secure-storage).
export function loadSeed () {
  try { return localStorage.getItem(SEED_KEY) } catch { return null }
}

export function saveSeed (seed) {
  try { localStorage.setItem(SEED_KEY, seed) } catch {}
}

export function forgetSeed () {
  try { localStorage.removeItem(SEED_KEY) } catch {}
}

export function createWallet (seed) {
  // One Zama configuration object shared by the wallet module and the protocol, so both reuse
  // one SDK context (relayer worker, permit cache) per account.
  const zama = {
    chain: 'sepolia',
    rpc: RPC_URL,
    relayer: 'web',
    // Holds the decrypt permit, the transport key pair and pending unshields across reloads.
    storage: new IndexedDBStorage('wdk-zama-demo')
  }

  const wdk = new WDK(seed)
    .registerWallet('ethereum', WalletManagerEvmZama, {
      provider: RPC_URL,
      transactionMaxFee: 10n ** 16n, // 0.01 ETH per transaction
      zama
    })
    .registerProtocol('ethereum', 'confidential', ZamaShieldProtocol, zama)

  return {
    wdk,
    getAccount: index => wdk.getAccount('ethereum', index),
    dispose: () => wdk.dispose()
  }
}

export async function mintTestUsdt (account, amount) {
  const to = await account.getAddress()

  return account.sendTransaction({ to: USDT, value: 0, data: MINT.encodeFunctionData('mint', [to, amount]) })
}

export function parseAmount (text) {
  const [whole, fraction = ''] = String(text).trim().split('.')

  if (!/^\d+$/.test(whole || '0') || !/^\d*$/.test(fraction) || fraction.length > DECIMALS) {
    throw new Error('Enter an amount with at most 6 decimals.')
  }

  const value = BigInt(whole || '0') * 10n ** BigInt(DECIMALS) + BigInt(fraction.padEnd(DECIMALS, '0') || '0')

  if (value <= 0n) {
    throw new Error('Enter an amount greater than zero.')
  }

  return value
}

export function formatAmount (value, decimals = DECIMALS, digits = 2) {
  if (value === null || value === undefined) return '—'

  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, '0').slice(0, digits)

  return `${whole.toLocaleString('en-US')}${digits > 0 ? '.' + fraction : ''}`
}

// Sepolia fees are tiny: show up to 8 decimals for amounts below 0.0001 ETH.
export function formatEth (wei) {
  if (wei === null || wei === undefined) return '—'
  if (wei === 0n || wei >= 10n ** 14n) return formatAmount(wei, 18, 4)

  return formatAmount(wei, 18, 8).replace(/\.?0+$/, '')
}

// Fee quotes on Sepolia are often a fraction of a gwei: show those in gwei.
export function formatFee (wei) {
  if (wei >= 10n ** 12n) return `${formatEth(wei)} ETH`

  return `${formatAmount(wei, 9, 4)} gwei`
}
export const shortAddress = address => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''
export const txUrl = hash => `${EXPLORER}/tx/${hash}`
export const addressUrl = address => `${EXPLORER}/address/${address}`

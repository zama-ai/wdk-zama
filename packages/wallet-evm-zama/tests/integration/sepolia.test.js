// Sepolia end-to-end flow for the account class.
//
// Needs a funded account: Sepolia ETH for gas; USDTMock (0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0)
// is minted on demand. Set SEPOLIA_SEED, or SEPOLIA_PRIVATE_KEY plus RECIPIENT (optionally
// SEPOLIA_RPC_URL, ZAMA_RELAYER_API_KEY), then:
//   npm run test:integration
//
// The flow runs for a seed account and for a private-key account derived from the same seed (or
// for the private-key account only): shield 10 -> balance 10 -> confidential transfer 3 ->
// recipient balance 3 -> unshield 7.

import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'
import { MemoryStorage } from '@zama-fhe/sdk'
import { HDNodeWallet, Interface, Mnemonic } from 'ethers'

import WalletManagerEvmZama, { WalletAccountEvmZama, CUSDT_MOCK_SEPOLIA, USDT_MOCK_SEPOLIA } from '../../index.js'

const SEED = process.env.SEPOLIA_SEED || undefined
const PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY || undefined
const RECIPIENT = process.env.RECIPIENT || undefined
const RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
const API_KEY = process.env.ZAMA_RELAYER_API_KEY || undefined

const ONE = 1_000_000n
const describeIfSeed = SEED ? describe : describe.skip
const describeIfPrivateKey = PRIVATE_KEY && RECIPIENT ? describe : describe.skip

jest.setTimeout(10 * 60_000)

function zamaConfig () {
  return {
    chain: 'sepolia',
    relayer: 'node',
    storage: new MemoryStorage(),
    ...(API_KEY ? { relayerAuth: { __type: 'ApiKeyHeader', value: API_KEY } } : {})
  }
}

describeIfSeed('Sepolia: shield -> transfer -> balance -> unshield (seed)', () => {
  let manager, sender, recipient

  beforeAll(async () => {
    manager = new WalletManagerEvmZama(SEED, { provider: RPC, zama: zamaConfig() })

    sender = await manager.getAccount(0)
    recipient = await manager.getAccount(1)
  })

  afterAll(() => {
    manager?.dispose()
  })

  test('seed account', async () => {
    await runFlow(sender, recipient)
  })

  test('private-key account', async () => {
    const privateKey = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(SEED), "m/44'/60'/0'/0/0").privateKey
    const account = WalletAccountEvmZama.fromPrivateKey(privateKey, { provider: RPC, zama: zamaConfig() })

    try {
      expect(await account.getAddress()).toBe(await sender.getAddress())

      await runFlow(account, recipient)
    } finally {
      account.dispose()
    }
  })
})

describeIfPrivateKey('Sepolia: shield -> transfer -> balance -> unshield (private key)', () => {
  test('private-key account with an external recipient', async () => {
    const account = WalletAccountEvmZama.fromPrivateKey(PRIVATE_KEY, { provider: RPC, zama: zamaConfig() })

    try {
      await runFlow(account, RECIPIENT)
    } finally {
      account.dispose()
    }
  })
})

/**
 * @param {WalletAccountEvmZama} sender - The funded account.
 * @param {WalletAccountEvmZama | string} recipient - A second account whose balance is checked, or an external address.
 */
async function runFlow (sender, recipient) {
  const senderAddress = await sender.getAddress()
  const recipientAddress = typeof recipient === 'string' ? recipient : await recipient.getAddress()

  expect(await sender.getConfidentialTokenFor(USDT_MOCK_SEPOLIA)).toBe(CUSDT_MOCK_SEPOLIA)

  if (await sender.getTokenBalance(USDT_MOCK_SEPOLIA) < 10n * ONE) {
    const iface = new Interface(['function mint(address to, uint256 amount)'])
    const { hash } = await sender.sendTransaction({ to: USDT_MOCK_SEPOLIA, value: 0, data: iface.encodeFunctionData('mint', [senderAddress, 100n * ONE]) })

    await sender.waitForTransaction(hash)
  }

  await expect(sender.getTokenBalance(CUSDT_MOCK_SEPOLIA)).rejects.toMatchObject({ name: 'UnsupportedTokenError' })

  const before = await sender.getConfidentialBalance(CUSDT_MOCK_SEPOLIA, { autoGrant: true })
  const recipientBefore = typeof recipient === 'string' ? null : await recipient.getConfidentialBalance(CUSDT_MOCK_SEPOLIA, { autoGrant: true })

  const shielded = await sender.shield({ token: CUSDT_MOCK_SEPOLIA, amount: 10n * ONE })

  expect(shielded.hash).toMatch(/^0x[0-9a-f]{64}$/)
  expect(shielded.fee).toBeGreaterThan(0n)
  await sender.waitForTransaction(shielded.hash)

  expect(await sender.getConfidentialBalance(CUSDT_MOCK_SEPOLIA)).toBe(before + 10n * ONE)

  const transferred = await sender.confidentialTransfer({ token: CUSDT_MOCK_SEPOLIA, recipient: recipientAddress, amount: 3n * ONE })

  await sender.waitForTransaction(transferred.hash)

  if (typeof recipient !== 'string') {
    expect(await recipient.getConfidentialBalance(CUSDT_MOCK_SEPOLIA)).toBe(recipientBefore + 3n * ONE)
  }

  expect(await sender.getConfidentialBalance(CUSDT_MOCK_SEPOLIA)).toBe(before + 7n * ONE)

  const phases = []
  const unshielded = await sender.unshield({ token: CUSDT_MOCK_SEPOLIA, amount: 7n * ONE }, {
    onUnwrapSubmitted: () => phases.push('unwrap'),
    onFinalizing: () => phases.push('finalizing'),
    onFinalizeSubmitted: () => phases.push('finalize')
  })

  expect(phases).toEqual(['unwrap', 'finalizing', 'finalize'])
  expect(unshielded.unwrapHash).toMatch(/^0x[0-9a-f]{64}$/)
  expect(unshielded.finalizeHash).toMatch(/^0x[0-9a-f]{64}$/)
  await sender.waitForTransaction(unshielded.finalizeHash)

  expect(await sender.getConfidentialBalance(CUSDT_MOCK_SEPOLIA)).toBe(before)
  expect(await sender.getPendingUnshield(CUSDT_MOCK_SEPOLIA)).toBeNull()
}

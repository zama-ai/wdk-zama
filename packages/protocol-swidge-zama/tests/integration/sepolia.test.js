// Sepolia end-to-end flows for the swidge protocol.
//
// Needs a funded account: Sepolia ETH for gas; USDTMock (0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0)
// is minted on demand. Set SEPOLIA_SEED or SEPOLIA_PRIVATE_KEY (optionally SEPOLIA_RPC_URL,
// ZAMA_RELAYER_API_KEY), then:
//   npm run test:integration

import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'
import WalletManagerEvm, { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import { MemoryStorage } from '@zama-fhe/sdk'
import { CUSDT_MOCK_SEPOLIA, USDT_MOCK_SEPOLIA } from '@zama-fhe/wdk-wallet-evm-zama'
import { Interface } from 'ethers'

import ZamaShieldProtocol from '../../index.js'

const SEED = process.env.SEPOLIA_SEED || undefined
const PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY || undefined
const RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
const API_KEY = process.env.ZAMA_RELAYER_API_KEY || undefined

const ONE = 1_000_000n
const describeIfFunded = SEED || PRIVATE_KEY ? describe : describe.skip

jest.setTimeout(10 * 60_000)

describeIfFunded('Sepolia: swidge shield and unshield on a plain WalletAccountEvm', () => {
  let manager, account, config, protocol

  beforeAll(async () => {
    // A plain WDK EVM account: the swidge module needs no Zama-specific account class.
    if (SEED) {
      manager = new WalletManagerEvm(SEED, { provider: RPC })
      account = await manager.getAccount(0)
    } else {
      account = WalletAccountEvm.fromPrivateKey(PRIVATE_KEY, { provider: RPC })
    }

    if (await account.getTokenBalance(USDT_MOCK_SEPOLIA) < 12n * ONE) {
      const iface = new Interface(['function mint(address to, uint256 amount)'])
      const { hash } = await account.sendTransaction({ to: USDT_MOCK_SEPOLIA, value: 0, data: iface.encodeFunctionData('mint', [await account.getAddress(), 100n * ONE]) })

      await account.waitForTransaction(hash)
    }

    config = {
      chain: 'sepolia',
      relayer: 'node',
      storage: new MemoryStorage(),
        ...(API_KEY ? { relayerAuth: { __type: 'ApiKeyHeader', value: API_KEY } } : {})
    }

    protocol = new ZamaShieldProtocol(account, config)
  })

  afterAll(async () => {
    await protocol?.dispose()
    manager ? manager.dispose() : account?.dispose()
  })

  test('flow 2: shield and unshield through swidge, with status', async () => {
    const quote = await protocol.quoteSwidge({ fromToken: USDT_MOCK_SEPOLIA, toToken: CUSDT_MOCK_SEPOLIA, fromTokenAmount: 10n * ONE })

    expect(quote.toTokenAmount).toBe(10n * ONE)

    const shield = await protocol.swidge({ fromToken: USDT_MOCK_SEPOLIA, toToken: CUSDT_MOCK_SEPOLIA, fromTokenAmount: 10n * ONE })

    expect(shield.id).toMatch(/^11155111:shield:0x[0-9a-f]{64}$/)
    await account.waitForTransaction(shield.hash)
    expect(await protocol.getSwidgeStatus(shield.id)).toMatchObject({ status: 'completed' })

    const unshield = await protocol.swidge({ fromToken: CUSDT_MOCK_SEPOLIA, toToken: USDT_MOCK_SEPOLIA, fromTokenAmount: 10n * ONE })

    expect(unshield.id).toMatch(/^11155111:unshield:0x[0-9a-f]{64}$/)
    expect(unshield.transactions).toHaveLength(2)
    await account.waitForTransaction(unshield.transactions[1].hash)

    const status = await protocol.getSwidgeStatus(unshield.id)

    expect(status.status).toBe('completed')
    expect(status.transactions.map(tx => tx.type)).toEqual(['source', 'destination'])
  })

  test('flow 3: unshield interrupted after phase 1 -> action-required -> resumeSwidge -> completed', async () => {
    const shield = await protocol.swidge({ fromToken: USDT_MOCK_SEPOLIA, toToken: CUSDT_MOCK_SEPOLIA, fromTokenAmount: 2n * ONE })

    await account.waitForTransaction(shield.hash)

    // Interrupt phase 2: make the first finalize attempt fail at the signer.
    const original = account.sendTransaction.bind(account)
    let unwrapSent = false

    account.sendTransaction = async (tx) => {
      if (unwrapSent) {
        throw new Error('simulated crash between phases')
      }

      unwrapSent = true

      return original(tx)
    }

    const interrupted = await protocol.swidge({ fromToken: CUSDT_MOCK_SEPOLIA, toToken: USDT_MOCK_SEPOLIA, fromTokenAmount: 2n * ONE })

    account.sendTransaction = original

    expect(interrupted.transactions).toHaveLength(1)
    await account.waitForTransaction(interrupted.hash)
    expect(await protocol.getSwidgeStatus(interrupted.id)).toMatchObject({ status: 'action-required' })

    // A fresh protocol instance (as WDK would build) recovers from the id alone.
    const resumed = await new ZamaShieldProtocol(account, config).resumeSwidge(interrupted.id)

    expect(resumed.transactions).toHaveLength(2)
    expect(resumed.toTokenAmount).toBe(2n * ONE)
    await account.waitForTransaction(resumed.transactions[1].hash)
    expect(await protocol.getSwidgeStatus(interrupted.id)).toMatchObject({ status: 'completed' })
  })
})

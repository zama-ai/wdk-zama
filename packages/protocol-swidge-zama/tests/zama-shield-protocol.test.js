import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import { MaximumFeeExceededError, NoSuchElementError, ValueError } from '@tetherto/wdk-wallet'
import { AccountRequiredError, SwapError, SwidgeProtocol } from '@tetherto/wdk-wallet/protocols'
import { Topics, UnshieldAlreadyFinalizedError, InsufficientERC20BalanceError } from '@zama-fhe/sdk'
import { ZamaWdkError, DEFAULT_PAIRS } from '@zama-fhe/wdk-wallet-evm-zama'
import { zeroAddress } from 'viem'

import ZamaShieldProtocol from '../src/zama-shield-protocol.js'
import { FeePriceRequiredError, UnsupportedRouteError } from '../src/errors.js'

const CHAIN_ID = 11155111
const [PAIR] = DEFAULT_PAIRS[CHAIN_ID]
const USDT = PAIR.erc20
const CUSDT = PAIR.confidential
const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const OTHER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'

const APPROVAL_HASH = '0x' + 'c3'.repeat(32)
const WRAP_HASH = '0x' + 'd4'.repeat(32)
const UNWRAP_HASH = '0x' + 'a1'.repeat(32)
const FINALIZE_HASH = '0x' + 'b2'.repeat(32)
const REQUEST_ID = '0x' + '77'.repeat(32)

function unwrapRequestedLog () {
  return {
    address: CUSDT,
    topics: [Topics.UnwrapRequested, '0x' + OWNER.slice(2).toLowerCase().padStart(64, '0'), REQUEST_ID],
    data: '0x' + '55'.repeat(32),
    transactionHash: UNWRAP_HASH
  }
}

function unwrapFinalizedLog (cleartextAmount) {
  return {
    address: CUSDT,
    topics: [Topics.UnwrapFinalized, '0x' + OWNER.slice(2).toLowerCase().padStart(64, '0'), REQUEST_ID],
    data: '0x' + '55'.repeat(32) + cleartextAmount.toString(16).padStart(64, '0'),
    transactionHash: FINALIZE_HASH
  }
}

function fakeContext ({ rate = 1n, requester = zeroAddress } = {}) {
  const fees = new Map([[APPROVAL_HASH, 3n], [WRAP_HASH, 30n], [UNWRAP_HASH, 10n], [FINALIZE_HASH, 20n]])

  const wrapped = {
    shield: jest.fn(async (amount, options) => {
      options?.onApprovalSubmitted?.(APPROVAL_HASH)

      return { txHash: WRAP_HASH, receipt: { logs: [] } }
    }),
    unshield: jest.fn(async (amount, options) => {
      options?.onUnwrapSubmitted?.(UNWRAP_HASH)

      return { txHash: FINALIZE_HASH, receipt: { logs: [] } }
    }),
    resumeUnshield: jest.fn(async () => ({ txHash: FINALIZE_HASH, receipt: { logs: [] } }))
  }

  const context = {
    sdk: {
      provider: {
        readContract: jest.fn(async ({ functionName }) => {
          if (functionName === 'rate') return rate
          if (functionName === 'unwrapRequester') return context.requester
          if (functionName === 'symbol') return 'SYM'
          if (functionName === 'decimals') return 18
          throw new Error(`unexpected read ${functionName}`)
        })
      },
      createWrappedToken: jest.fn(() => wrapped)
    },
    wrapped,
    requester,
    signer: { takeFee: jest.fn(hash => fees.get(hash) ?? 0n) },
    provider: {
      getFeeData: jest.fn(async () => ({ maxFeePerGas: 10n, gasPrice: 5n })),
      getTransactionReceipt: jest.fn(async () => null),
      getTransaction: jest.fn(async () => null),
      getLogs: jest.fn(async () => [])
    },
    chain: { id: CHAIN_ID },
    pairs: [...DEFAULT_PAIRS[CHAIN_ID]],
    gasEstimates: { approve: 1n, wrap: 2n, transferAndCall: 3n, confidentialTransfer: 4n, unwrap: 5n, finalizeUnwrap: 6n },
    dispose: jest.fn()
  }

  return context
}

function fakeAccount () {
  return {
    getAddress: jest.fn(async () => OWNER),
    signTypedData: jest.fn(),
    sendTransaction: jest.fn()
  }
}

describe('ZamaShieldProtocol', () => {
  let account, context, protocol

  beforeEach(() => {
    account = fakeAccount()
    context = fakeContext()
    protocol = new ZamaShieldProtocol(account, { chain: 'sepolia' })
    protocol._getZama = async () => context
  })

  test('is a SwidgeProtocol', () => {
    expect(protocol).toBeInstanceOf(SwidgeProtocol)
  })

  describe('routing', () => {
    test.each([
      ['same token', { fromToken: USDT, toToken: USDT }],
      ['unknown pair', { fromToken: USDT, toToken: OTHER }],
      ['unknown confidential', { fromToken: OTHER, toToken: USDT }]
    ])('rejects %s', async (_, tokens) => {
      await expect(protocol.quoteSwidge({ ...tokens, fromTokenAmount: 1n })).rejects.toBeInstanceOf(UnsupportedRouteError)
    })

    test('rejects a different destination chain', async () => {
      await expect(protocol.quoteSwidge({ fromToken: USDT, toToken: CUSDT, toChain: 1, fromTokenAmount: 1n })).rejects.toBeInstanceOf(UnsupportedRouteError)
      await expect(protocol.quoteSwidge({ fromToken: USDT, toToken: CUSDT, toChain: '11155111', fromTokenAmount: 1n })).resolves.toBeDefined()
    })

    test('rejects invalid addresses', async () => {
      await expect(protocol.quoteSwidge({ fromToken: 'usdt', toToken: CUSDT, fromTokenAmount: 1n })).rejects.toBeInstanceOf(ValueError)
    })

    test('accepts addresses in any case', async () => {
      await expect(protocol.quoteSwidge({ fromToken: USDT.toLowerCase(), toToken: CUSDT.toUpperCase().replace('0X', '0x'), fromTokenAmount: 1n })).resolves.toBeDefined()
    })

    test('uses configured extra pairs', async () => {
      const extra = { erc20: '0x' + '11'.repeat(20), confidential: '0x' + '22'.repeat(20) }

      context.pairs.push(extra)

      await expect(protocol.quoteSwidge({ fromToken: extra.confidential, toToken: extra.erc20, fromTokenAmount: 1n })).resolves.toMatchObject({ toTokenAmount: 1n })
    })
  })

  describe('quoteSwidge', () => {
    test('quotes a 1:1 shield with the network fee of approve + wrap', async () => {
      const quote = await protocol.quoteSwidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 100_000_000n })

      expect(quote).toEqual({
        fromTokenAmount: 100_000_000n,
        toTokenAmount: 100_000_000n,
        toTokenAmountMin: 100_000_000n,
        fees: [{ type: 'network', amount: 30n, token: zeroAddress, chain: CHAIN_ID, included: false, description: expect.any(String) }],
        estimatedDuration: 30,
        priceImpact: 0
      })
    })

    test('quotes an unshield with the network fee of unwrap + finalize', async () => {
      const quote = await protocol.quoteSwidge({ fromToken: CUSDT, toToken: USDT, fromTokenAmount: 5n })

      expect(quote.fees[0].amount).toBe(110n)
      expect(quote.estimatedDuration).toBe(90)
    })

    test('applies the wrapper rate in both directions and modes', async () => {
      protocol._getZama = async () => fakeContext({ rate: 1_000n })

      await expect(protocol.quoteSwidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 2_500n })).resolves.toMatchObject({ fromTokenAmount: 2_500n, toTokenAmount: 2n })
      await expect(protocol.quoteSwidge({ fromToken: USDT, toToken: CUSDT, toTokenAmount: 3n })).resolves.toMatchObject({ fromTokenAmount: 3_000n, toTokenAmount: 3n })
      await expect(protocol.quoteSwidge({ fromToken: CUSDT, toToken: USDT, fromTokenAmount: 3n })).resolves.toMatchObject({ fromTokenAmount: 3n, toTokenAmount: 3_000n })
      await expect(protocol.quoteSwidge({ fromToken: CUSDT, toToken: USDT, toTokenAmount: 2_500n })).resolves.toMatchObject({ fromTokenAmount: 3n, toTokenAmount: 3_000n })
    })

    test('validates amounts', async () => {
      await expect(protocol.quoteSwidge({ fromToken: USDT, toToken: CUSDT })).rejects.toBeInstanceOf(ValueError)
      await expect(protocol.quoteSwidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 1n, toTokenAmount: 1n })).rejects.toBeInstanceOf(ValueError)
      await expect(protocol.quoteSwidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 0n })).rejects.toBeInstanceOf(ValueError)
      await expect(protocol.quoteSwidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 10n, minAmountOut: 11n })).rejects.toBeInstanceOf(ValueError)
    })

    test('rejects a recipient other than the account', async () => {
      await expect(protocol.quoteSwidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 1n, recipient: OTHER })).rejects.toBeInstanceOf(ValueError)
      await expect(protocol.quoteSwidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 1n, recipient: OWNER.toLowerCase() })).resolves.toBeDefined()
    })

    test('works without an account', async () => {
      const readOnly = new ZamaShieldProtocol(undefined, { chain: 'sepolia' })

      readOnly._getZama = async () => fakeContext()

      await expect(readOnly.quoteSwidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 1n, recipient: OTHER })).resolves.toBeDefined()
    })

    test('is reachable through quoteSwap', async () => {
      await expect(protocol.quoteSwap({ tokenIn: USDT, tokenOut: CUSDT, tokenInAmount: 10n })).resolves.toEqual({ fee: 30n, tokenInAmount: 10n, tokenOutAmount: 10n })
      await expect(protocol.quoteSwap({ tokenIn: USDT, tokenOut: OTHER, tokenInAmount: 10n })).rejects.toBeInstanceOf(SwapError)
    })
  })

  describe('swidge', () => {
    test('requires a writable account', async () => {
      const readOnly = new ZamaShieldProtocol({ getAddress: async () => OWNER }, { chain: 'sepolia' })

      readOnly._getZama = async () => context

      await expect(readOnly.swidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 1n })).rejects.toBeInstanceOf(AccountRequiredError)
      await expect(new ZamaShieldProtocol().swidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 1n })).rejects.toBeInstanceOf(AccountRequiredError)
    })

    test('shields and reports the approval and wrap transactions', async () => {
      const result = await protocol.swidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 10n })

      expect(context.sdk.createWrappedToken).toHaveBeenCalledWith(CUSDT)
      expect(context.wrapped.shield).toHaveBeenCalledWith(10n, expect.any(Object))
      expect(result).toEqual({
        id: `${CHAIN_ID}:shield:${WRAP_HASH}`,
        hash: WRAP_HASH,
        fees: [expect.objectContaining({ type: 'network', amount: 33n })],
        transactions: [
          { hash: APPROVAL_HASH, chain: CHAIN_ID, type: 'approval' },
          { hash: WRAP_HASH, chain: CHAIN_ID, type: 'source' }
        ],
        fromTokenAmount: 10n,
        toTokenAmount: 10n,
        toTokenAmountMin: 10n
      })
    })

    test('shields exact-out', async () => {
      const result = await protocol.swidge({ fromToken: USDT, toToken: CUSDT, toTokenAmount: 10n })

      expect(context.wrapped.shield).toHaveBeenCalledWith(10n, expect.any(Object))
      expect(result.fromTokenAmount).toBe(10n)
    })

    test('unshields through both phases', async () => {
      const result = await protocol.swidge({ fromToken: CUSDT, toToken: USDT, fromTokenAmount: 7n })

      expect(context.wrapped.unshield).toHaveBeenCalledWith(7n, expect.any(Object))
      expect(result).toEqual({
        id: `${CHAIN_ID}:unshield:${UNWRAP_HASH}`,
        hash: UNWRAP_HASH,
        fees: [expect.objectContaining({ amount: 30n })],
        transactions: [
          { hash: UNWRAP_HASH, chain: CHAIN_ID, type: 'source' },
          { hash: FINALIZE_HASH, chain: CHAIN_ID, type: 'destination' }
        ],
        fromTokenAmount: 7n,
        toTokenAmount: 7n,
        toTokenAmountMin: 7n
      })
    })

    test('returns the unwrap only when the finalize fails', async () => {
      context.wrapped.unshield.mockImplementation(async (amount, options) => {
        options.onUnwrapSubmitted(UNWRAP_HASH)

        throw new Error('kms timeout')
      })

      const result = await protocol.swidge({ fromToken: CUSDT, toToken: USDT, fromTokenAmount: 7n })

      expect(result.id).toBe(`${CHAIN_ID}:unshield:${UNWRAP_HASH}`)
      expect(result.transactions).toEqual([{ hash: UNWRAP_HASH, chain: CHAIN_ID, type: 'source' }])
      expect(result.fees[0].amount).toBe(10n)
    })

    test('maps SDK errors and lets WDK errors through', async () => {
      context.wrapped.shield.mockRejectedValue(new InsufficientERC20BalanceError('requested 10 available 1', { requested: 10n, available: 1n, token: USDT }))

      const error = await protocol.swidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 10n }).catch(e => e)

      expect(error).toBeInstanceOf(ZamaWdkError)
      expect(error.message).not.toContain('10')

      context.wrapped.unshield.mockRejectedValue(new MaximumFeeExceededError('cap'))

      await expect(protocol.swidge({ fromToken: CUSDT, toToken: USDT, fromTokenAmount: 1n })).rejects.toBeInstanceOf(MaximumFeeExceededError)
    })

    test('rejects a recipient other than the account', async () => {
      await expect(protocol.swidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 1n, recipient: OTHER })).rejects.toBeInstanceOf(ValueError)
      expect(context.wrapped.shield).not.toHaveBeenCalled()
    })

    test('is reachable through swap', async () => {
      await expect(protocol.swap({ tokenIn: USDT, tokenOut: CUSDT, tokenInAmount: 10n })).resolves.toEqual({ hash: `${CHAIN_ID}:shield:${WRAP_HASH}`, fee: 33n, tokenInAmount: 10n, tokenOutAmount: 10n })
    })

    describe('fee caps', () => {
      // Fee: (1 + 2) gas * 10 wei = 30 wei. At 1 ETH = 2e18 USDT units, 30 wei = 60 base units.
      const price = 2_000_000_000_000

      test('requires a native token price when maxNetworkFeeBps is set', async () => {
        await expect(protocol.swidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 1_000_000n }, { maxNetworkFeeBps: 50 })).rejects.toBeInstanceOf(FeePriceRequiredError)
      })

      test('throws MaximumFeeExceededError above the cap', async () => {
        const capped = new ZamaShieldProtocol(account, { chain: 'sepolia', nativeTokenPrice: price, maxNetworkFeeBps: 1 })

        capped._getZama = async () => context

        await expect(capped.swidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 10_000n })).rejects.toBeInstanceOf(MaximumFeeExceededError)
        expect(context.wrapped.shield).not.toHaveBeenCalled()
      })

      test('passes under the cap and ignores maxProtocolFeeBps', async () => {
        const capped = new ZamaShieldProtocol(account, { chain: 'sepolia', nativeTokenPrice: price, maxNetworkFeeBps: 1, maxProtocolFeeBps: 0 })

        capped._getZama = async () => context

        await expect(capped.swidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 1_000_000n })).resolves.toBeDefined()
      })

      test('per-call config overrides the protocol config', async () => {
        const capped = new ZamaShieldProtocol(account, { chain: 'sepolia', nativeTokenPrice: price, maxNetworkFeeBps: 1 })

        capped._getZama = async () => context

        await expect(capped.swidge({ fromToken: USDT, toToken: CUSDT, fromTokenAmount: 10_000n }, { maxNetworkFeeBps: 10_000 })).resolves.toBeDefined()
      })
    })
  })

  describe('getSwidgeStatus', () => {
    test('rejects invalid ids and ids of other chains', async () => {
      await expect(protocol.getSwidgeStatus('nope')).rejects.toBeInstanceOf(ValueError)
      await expect(protocol.getSwidgeStatus(`1:shield:${WRAP_HASH}`)).rejects.toBeInstanceOf(ValueError)
    })

    test('throws NoSuchElementError for an unknown transaction', async () => {
      await expect(protocol.getSwidgeStatus(`${CHAIN_ID}:shield:${WRAP_HASH}`)).rejects.toBeInstanceOf(NoSuchElementError)
    })

    test('reports pending while the transaction is in the mempool', async () => {
      context.provider.getTransaction.mockResolvedValue({ hash: WRAP_HASH })

      await expect(protocol.getSwidgeStatus(`${CHAIN_ID}:shield:${WRAP_HASH}`)).resolves.toEqual({ status: 'pending', transactions: [{ hash: WRAP_HASH, chain: CHAIN_ID, type: 'source' }] })
    })

    test('reports failed for a reverted transaction', async () => {
      context.provider.getTransactionReceipt.mockResolvedValue({ status: 0, logs: [], blockNumber: 1 })

      await expect(protocol.getSwidgeStatus(`${CHAIN_ID}:unshield:${UNWRAP_HASH}`)).resolves.toMatchObject({ status: 'failed' })
    })

    test('reports completed for a mined shield', async () => {
      context.provider.getTransactionReceipt.mockResolvedValue({ status: 1, logs: [], blockNumber: 1 })

      await expect(protocol.getSwidgeStatus(`${CHAIN_ID}:shield:${WRAP_HASH}`)).resolves.toEqual({ status: 'completed', transactions: [{ hash: WRAP_HASH, chain: CHAIN_ID, type: 'source' }] })
    })

    test('reports failed for a mined unshield without an UnwrapRequested event', async () => {
      context.provider.getTransactionReceipt.mockResolvedValue({ status: 1, logs: [], blockNumber: 1 })

      await expect(protocol.getSwidgeStatus(`${CHAIN_ID}:unshield:${UNWRAP_HASH}`)).resolves.toMatchObject({ status: 'failed' })
    })

    test('reports action-required while the unwrap request is not finalized', async () => {
      context.requester = OWNER
      context.provider.getTransactionReceipt.mockResolvedValue({ status: 1, logs: [unwrapRequestedLog()], blockNumber: 1 })

      await expect(protocol.getSwidgeStatus(`${CHAIN_ID}:unshield:${UNWRAP_HASH}`)).resolves.toEqual({ status: 'action-required', transactions: [{ hash: UNWRAP_HASH, chain: CHAIN_ID, type: 'source' }] })
      expect(context.sdk.provider.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'unwrapRequester', address: CUSDT, args: [REQUEST_ID] }))
    })

    test('reports completed with the finalize transaction once finalized', async () => {
      context.provider.getTransactionReceipt.mockResolvedValue({ status: 1, logs: [unwrapRequestedLog()], blockNumber: 1 })
      context.provider.getLogs.mockResolvedValue([unwrapFinalizedLog(7n)])

      await expect(protocol.getSwidgeStatus(`${CHAIN_ID}:unshield:${UNWRAP_HASH}`)).resolves.toEqual({
        status: 'completed',
        transactions: [
          { hash: UNWRAP_HASH, chain: CHAIN_ID, type: 'source' },
          { hash: FINALIZE_HASH, chain: CHAIN_ID, type: 'destination' }
        ]
      })
      expect(context.provider.getLogs).toHaveBeenCalledWith(expect.objectContaining({ address: CUSDT, topics: [Topics.UnwrapFinalized, null, REQUEST_ID], fromBlock: 1 }))
    })

    test('reports completed even when the finalize transaction cannot be found', async () => {
      context.provider.getTransactionReceipt.mockResolvedValue({ status: 1, logs: [unwrapRequestedLog()], blockNumber: 1 })
      context.provider.getLogs.mockRejectedValue(new Error('pruned history'))

      await expect(protocol.getSwidgeStatus(`${CHAIN_ID}:unshield:${UNWRAP_HASH}`)).resolves.toMatchObject({ status: 'completed', transactions: [expect.objectContaining({ type: 'source' })] })
    })
  })

  describe('resumeSwidge', () => {
    beforeEach(() => {
      context.requester = OWNER
      context.provider.getTransactionReceipt.mockResolvedValue({ status: 1, logs: [unwrapRequestedLog()], blockNumber: 1 })
      context.provider.getLogs.mockResolvedValue([unwrapFinalizedLog(7n)])
    })

    test('requires a writable account and an unshield id of this chain', async () => {
      await expect(new ZamaShieldProtocol().resumeSwidge(`${CHAIN_ID}:unshield:${UNWRAP_HASH}`)).rejects.toBeInstanceOf(AccountRequiredError)
      await expect(protocol.resumeSwidge(`${CHAIN_ID}:shield:${WRAP_HASH}`)).rejects.toBeInstanceOf(ValueError)
      await expect(protocol.resumeSwidge(`1:unshield:${UNWRAP_HASH}`)).rejects.toBeInstanceOf(ValueError)
    })

    test('throws NoSuchElementError for an unmined transaction', async () => {
      context.provider.getTransactionReceipt.mockResolvedValue(null)

      await expect(protocol.resumeSwidge(`${CHAIN_ID}:unshield:${UNWRAP_HASH}`)).rejects.toBeInstanceOf(NoSuchElementError)
    })

    test('finalizes and returns the completed result with amounts from the event', async () => {
      const result = await protocol.resumeSwidge(`${CHAIN_ID}:unshield:${UNWRAP_HASH}`)

      expect(context.wrapped.resumeUnshield).toHaveBeenCalledWith(UNWRAP_HASH)
      expect(result).toEqual({
        id: `${CHAIN_ID}:unshield:${UNWRAP_HASH}`,
        hash: UNWRAP_HASH,
        fees: [expect.objectContaining({ amount: 20n })],
        transactions: [
          { hash: UNWRAP_HASH, chain: CHAIN_ID, type: 'source' },
          { hash: FINALIZE_HASH, chain: CHAIN_ID, type: 'destination' }
        ],
        fromTokenAmount: 7n,
        toTokenAmount: 7n,
        toTokenAmountMin: 7n
      })
    })

    test('treats an already finalized unshield as completed', async () => {
      context.wrapped.resumeUnshield.mockRejectedValue(new UnshieldAlreadyFinalizedError('done', { unwrapTxHash: UNWRAP_HASH, unwrapRequestId: REQUEST_ID }))

      const result = await protocol.resumeSwidge(`${CHAIN_ID}:unshield:${UNWRAP_HASH}`)

      expect(result.transactions).toHaveLength(2)
      expect(result.fees[0].amount).toBe(0n)
    })

    test('maps other SDK failures', async () => {
      context.wrapped.resumeUnshield.mockRejectedValue(new InsufficientERC20BalanceError('x', { requested: 1n, available: 0n, token: USDT }))

      await expect(protocol.resumeSwidge(`${CHAIN_ID}:unshield:${UNWRAP_HASH}`)).rejects.toBeInstanceOf(ZamaWdkError)
    })
  })

  describe('discovery', () => {
    test('getSupportedChains returns the configured chain', async () => {
      await expect(protocol.getSupportedChains()).resolves.toEqual([{ id: CHAIN_ID, name: 'Sepolia', type: 'evm', nativeToken: 'ETH' }])
    })

    test('getSupportedTokens returns both sides of every pair', async () => {
      await expect(protocol.getSupportedTokens()).resolves.toEqual([
        { token: USDT, chain: CHAIN_ID, address: USDT, symbol: 'USDTMock', decimals: 6 },
        { token: CUSDT, chain: CHAIN_ID, address: CUSDT, symbol: 'cUSDTMock', decimals: 6 }
      ])
    })

    test('getSupportedTokens filters by route and chain', async () => {
      await expect(protocol.getSupportedTokens({ fromToken: USDT })).resolves.toEqual([expect.objectContaining({ token: CUSDT })])
      await expect(protocol.getSupportedTokens({ fromToken: CUSDT.toLowerCase() })).resolves.toEqual([expect.objectContaining({ token: USDT })])
      await expect(protocol.getSupportedTokens({ fromToken: OTHER })).resolves.toEqual([])
      await expect(protocol.getSupportedTokens({ fromChain: 1 })).resolves.toEqual([])
      await expect(protocol.getSupportedTokens({ toChain: String(CHAIN_ID) })).resolves.toHaveLength(2)
    })

    test('getSupportedTokens reads missing metadata from the chain', async () => {
      context.pairs.push({ erc20: '0x' + '11'.repeat(20), confidential: '0x' + '22'.repeat(20) })

      const tokens = await protocol.getSupportedTokens({ fromToken: '0x' + '11'.repeat(20) })

      expect(tokens).toEqual([{ token: '0x2222222222222222222222222222222222222222', chain: CHAIN_ID, address: '0x2222222222222222222222222222222222222222', symbol: 'SYM', decimals: 18 }])
    })
  })
})

describe('dispose', () => {
  test('releases the shared Zama context for the account and config', async () => {
    const adapter = await import('@zama-fhe/wdk-wallet-evm-zama/adapter')
    const account = { getAddress: async () => OWNER, signTypedData: async () => '0x', sendTransaction: async () => ({ hash: '0x', fee: 0n }) }
    const rpc = { request: async ({ method }) => method === 'eth_chainId' ? '0xaa36a7' : [] }
    const config = { chain: 'sepolia', rpc, relayer: 'node' }
    const protocol = new ZamaShieldProtocol(account, config)

    const context = await adapter.getSharedZamaSdk(account, config)

    await protocol.dispose()

    expect(await adapter.getSharedZamaSdk(account, config)).not.toBe(context)

    await adapter.disposeSharedZamaSdk(account, config)
  })
})

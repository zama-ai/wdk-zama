import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import { MaximumFeeExceededError, ValueError } from '@tetherto/wdk-wallet'
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import { InsufficientConfidentialBalanceError, UnshieldAlreadyFinalizedError } from '@zama-fhe/sdk'

import WalletAccountEvmZama from '../src/wallet-account-evm-zama.js'
import { PermitRequiredError, UnshieldPendingError, UnsupportedTokenError, ZamaWdkError } from '../src/errors.js'
import { CUSDT_MOCK_SEPOLIA, USDT_MOCK_SEPOLIA, getDefaultPairs } from '../src/tokens.js'

const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const RECIPIENT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const SEED = 'test test test test test test test test test test test junk'

const UNWRAP_HASH = '0x' + 'a1'.repeat(32)
const FINALIZE_HASH = '0x' + 'b2'.repeat(32)
const APPROVAL_HASH = '0x' + 'c3'.repeat(32)
const WRAP_HASH = '0x' + 'd4'.repeat(32)
const TRANSFER_HASH = '0x' + 'e5'.repeat(32)

function fakeContext () {
  const fees = new Map([[UNWRAP_HASH, 10n], [FINALIZE_HASH, 20n], [APPROVAL_HASH, 3n], [WRAP_HASH, 30n], [TRANSFER_HASH, 40n]])

  const token = {
    balanceOf: jest.fn(async () => 1_000_000n),
    confidentialTransfer: jest.fn(async () => ({ txHash: TRANSFER_HASH, receipt: { logs: [] } }))
  }

  const wrapped = {
    shield: jest.fn(async (amount, options) => {
      options?.onApprovalSubmitted?.(APPROVAL_HASH)

      return { txHash: WRAP_HASH, receipt: { logs: [] } }
    }),
    unshield: jest.fn(async (amount, options) => {
      options?.onUnwrapSubmitted?.(UNWRAP_HASH)
      options?.onFinalizing?.()
      options?.onFinalizeSubmitted?.(FINALIZE_HASH)

      return { txHash: FINALIZE_HASH, receipt: { logs: [] } }
    }),
    resumeUnshield: jest.fn(async () => ({ txHash: FINALIZE_HASH, receipt: { logs: [] } })),
    getPendingUnshield: jest.fn(async () => UNWRAP_HASH)
  }

  return {
    sdk: {
      permits: {
        hasPermit: jest.fn(async () => true),
        grantPermit: jest.fn(async () => {}),
        revokePermits: jest.fn(async () => {})
      },
      registry: {
        getConfidentialToken: jest.fn(async () => null)
      },
      createToken: jest.fn(() => token),
      createWrappedToken: jest.fn(() => wrapped)
    },
    token,
    wrapped,
    signer: { takeFee: jest.fn(hash => fees.get(hash) ?? 0n) },
    provider: { getFeeData: jest.fn(async () => ({ maxFeePerGas: 2n, gasPrice: 1n })) },
    chain: { id: 11155111 },
    pairs: getDefaultPairs(11155111),
    gasEstimates: { confidentialTransfer: 400_000n },
    dispose: jest.fn()
  }
}

describe('WalletAccountEvmZama', () => {
  let account, context

  beforeEach(() => {
    account = WalletAccountEvmZama.fromPrivateKey(PRIVATE_KEY, { zama: { chain: 'sepolia' } })
    context = fakeContext()
    account._getZama = async () => context
  })

  describe('construction', () => {
    test('is a WalletAccountEvm and keeps the zama configuration', async () => {
      expect(account).toBeInstanceOf(WalletAccountEvm)
      expect(account._zamaConfig).toEqual({ chain: 'sepolia' })
      await expect(account.getAddress()).resolves.toBe(OWNER)
    })

    test('accepts a seed with and without a path', () => {
      const withPath = new WalletAccountEvmZama(SEED, "0'/0/1", { zama: { chain: 'mainnet' } })
      const withoutPath = new WalletAccountEvmZama(SEED, { zama: { chain: 'mainnet' } })

      expect(withPath.path).toBe("m/44'/60'/0'/0/1")
      expect(withPath._zamaConfig).toEqual({ chain: 'mainnet' })
      expect(withoutPath.path).toBe("m/44'/60'/0'/0/0")
      expect(withoutPath._zamaConfig).toEqual({ chain: 'mainnet' })

      withPath.dispose()
      withoutPath.dispose()
    })
  })

  describe('getConfidentialBalance', () => {
    test('throws PermitRequiredError without a permit', async () => {
      context.sdk.permits.hasPermit.mockResolvedValue(false)

      await expect(account.getConfidentialBalance(CUSDT_MOCK_SEPOLIA)).rejects.toBeInstanceOf(PermitRequiredError)
      expect(context.sdk.permits.grantPermit).not.toHaveBeenCalled()
      expect(context.token.balanceOf).not.toHaveBeenCalled()
    })

    test('grants a permit first with autoGrant', async () => {
      context.sdk.permits.hasPermit.mockResolvedValue(false)

      await expect(account.getConfidentialBalance(CUSDT_MOCK_SEPOLIA, { autoGrant: true })).resolves.toBe(1_000_000n)
      expect(context.sdk.permits.grantPermit).toHaveBeenCalledWith([CUSDT_MOCK_SEPOLIA])
      expect(context.token.balanceOf).toHaveBeenCalledWith(OWNER)
    })

    test('returns the decrypted balance with an existing permit', async () => {
      await expect(account.getConfidentialBalance(CUSDT_MOCK_SEPOLIA.toLowerCase())).resolves.toBe(1_000_000n)
      expect(context.sdk.createToken).toHaveBeenCalledWith(CUSDT_MOCK_SEPOLIA)
    })

    test('maps SDK errors', async () => {
      context.token.balanceOf.mockRejectedValue(new InsufficientConfidentialBalanceError('requested 5 available 1', { requested: 5n, available: 1n, token: CUSDT_MOCK_SEPOLIA }))

      await expect(account.getConfidentialBalance(CUSDT_MOCK_SEPOLIA)).rejects.toBeInstanceOf(ZamaWdkError)
    })

    test('validates the token address', async () => {
      await expect(account.getConfidentialBalance('nope')).rejects.toBeInstanceOf(ValueError)
    })
  })

  describe('permits', () => {
    test('hasDecryptPermit, grantDecryptPermit and revokeDecryptPermits delegate to the SDK', async () => {
      await expect(account.hasDecryptPermit([CUSDT_MOCK_SEPOLIA])).resolves.toBe(true)
      await account.grantDecryptPermit([CUSDT_MOCK_SEPOLIA.toLowerCase()])
      await account.revokeDecryptPermits([CUSDT_MOCK_SEPOLIA])
      await account.revokeDecryptPermits()

      expect(context.sdk.permits.hasPermit).toHaveBeenCalledWith([CUSDT_MOCK_SEPOLIA])
      expect(context.sdk.permits.grantPermit).toHaveBeenCalledWith([CUSDT_MOCK_SEPOLIA])
      expect(context.sdk.permits.revokePermits).toHaveBeenNthCalledWith(1, [CUSDT_MOCK_SEPOLIA])
      expect(context.sdk.permits.revokePermits).toHaveBeenNthCalledWith(2, undefined)
    })
  })

  describe('confidentialTransfer', () => {
    test('transfers and returns the quoted fee', async () => {
      await expect(account.confidentialTransfer({ token: CUSDT_MOCK_SEPOLIA, recipient: RECIPIENT, amount: 3_000_000n })).resolves.toEqual({ hash: TRANSFER_HASH, fee: 40n })
      expect(context.token.confidentialTransfer).toHaveBeenCalledWith(RECIPIENT, 3_000_000n)
    })

    test('validates recipient and amount', async () => {
      await expect(account.confidentialTransfer({ token: CUSDT_MOCK_SEPOLIA, recipient: 'bob', amount: 1n })).rejects.toBeInstanceOf(ValueError)
      await expect(account.confidentialTransfer({ token: CUSDT_MOCK_SEPOLIA, recipient: RECIPIENT, amount: 0n })).rejects.toBeInstanceOf(ValueError)
      await expect(account.confidentialTransfer({ token: CUSDT_MOCK_SEPOLIA, recipient: RECIPIENT, amount: 'x' })).rejects.toBeInstanceOf(ValueError)
    })

    test('lets a WDK fee-cap error wrapped by the SDK through', async () => {
      context.token.confidentialTransfer.mockRejectedValue(new Error('sdk', { cause: new MaximumFeeExceededError('cap') }))

      await expect(account.confidentialTransfer({ token: CUSDT_MOCK_SEPOLIA, recipient: RECIPIENT, amount: 1n })).rejects.toBeInstanceOf(MaximumFeeExceededError)
    })

    test('quotes from the gas estimate and fee rate', async () => {
      await expect(account.quoteConfidentialTransfer({ token: CUSDT_MOCK_SEPOLIA, recipient: RECIPIENT, amount: 1n })).resolves.toEqual({ fee: 800_000n })
    })
  })

  describe('shield', () => {
    test('returns both hashes and the summed fee on the approve + wrap path', async () => {
      await expect(account.shield({ token: CUSDT_MOCK_SEPOLIA, amount: 5n })).resolves.toEqual({ hash: WRAP_HASH, fee: 33n, approvalHash: APPROVAL_HASH })
      expect(context.wrapped.shield).toHaveBeenCalledWith(5n, expect.objectContaining({ onApprovalSubmitted: expect.any(Function) }))
    })

    test('omits approvalHash on the single-transaction path', async () => {
      context.wrapped.shield.mockResolvedValue({ txHash: WRAP_HASH, receipt: { logs: [] } })

      await expect(account.shield({ token: CUSDT_MOCK_SEPOLIA, amount: 5n })).resolves.toEqual({ hash: WRAP_HASH, fee: 30n })
    })
  })

  describe('unshield', () => {
    test('runs both phases, forwards callbacks and sums the fees', async () => {
      const callbacks = { onUnwrapSubmitted: jest.fn(), onFinalizing: jest.fn(), onFinalizeSubmitted: jest.fn() }

      await expect(account.unshield({ token: CUSDT_MOCK_SEPOLIA, amount: 7n }, callbacks)).resolves.toEqual({ unwrapHash: UNWRAP_HASH, finalizeHash: FINALIZE_HASH, fee: 30n })
      expect(callbacks.onUnwrapSubmitted).toHaveBeenCalledWith(UNWRAP_HASH)
      expect(callbacks.onFinalizing).toHaveBeenCalled()
      expect(callbacks.onFinalizeSubmitted).toHaveBeenCalledWith(FINALIZE_HASH)
    })

    test('throws UnshieldPendingError with the unwrap hash when phase 2 fails', async () => {
      context.wrapped.unshield.mockImplementation(async (amount, options) => {
        options.onUnwrapSubmitted(UNWRAP_HASH)

        throw new Error('kms timeout')
      })

      const error = await account.unshield({ token: CUSDT_MOCK_SEPOLIA, amount: 7n }).catch(e => e)

      expect(error).toBeInstanceOf(UnshieldPendingError)
      expect(error.unwrapHash).toBe(UNWRAP_HASH)
      expect(error.cause.message).toBe('kms timeout')
    })

    test('maps a phase 1 failure without a pending error', async () => {
      context.wrapped.unshield.mockRejectedValue(new InsufficientConfidentialBalanceError('requested 7 available 1', { requested: 7n, available: 1n, token: CUSDT_MOCK_SEPOLIA }))

      const error = await account.unshield({ token: CUSDT_MOCK_SEPOLIA, amount: 7n }).catch(e => e)

      expect(error).toBeInstanceOf(ZamaWdkError)
      expect(error).not.toBeInstanceOf(UnshieldPendingError)
      expect(error.message).not.toContain('7')
    })

    test('getPendingUnshield and resumeUnshield delegate to the SDK', async () => {
      await expect(account.getPendingUnshield(CUSDT_MOCK_SEPOLIA)).resolves.toBe(UNWRAP_HASH)
      await expect(account.resumeUnshield({ token: CUSDT_MOCK_SEPOLIA, unwrapHash: UNWRAP_HASH })).resolves.toEqual({ finalizeHash: FINALIZE_HASH, fee: 20n })
      expect(context.wrapped.resumeUnshield).toHaveBeenCalledWith(UNWRAP_HASH)
    })

    test('resumeUnshield treats an already finalized unshield as success', async () => {
      context.wrapped.resumeUnshield.mockRejectedValue(new UnshieldAlreadyFinalizedError('done', { unwrapTxHash: UNWRAP_HASH, unwrapRequestId: '0x' + '00'.repeat(32) }))

      await expect(account.resumeUnshield({ token: CUSDT_MOCK_SEPOLIA, unwrapHash: UNWRAP_HASH })).resolves.toEqual({ finalizeHash: null, fee: 0n })
    })

    test('resumeUnshield validates the hash', async () => {
      await expect(account.resumeUnshield({ token: CUSDT_MOCK_SEPOLIA, unwrapHash: '0x123' })).rejects.toBeInstanceOf(ValueError)
    })
  })

  describe('getConfidentialTokenFor', () => {
    test('prefers the on-chain registry and falls back to the static pairs', async () => {
      await expect(account.getConfidentialTokenFor(USDT_MOCK_SEPOLIA)).resolves.toBe(CUSDT_MOCK_SEPOLIA)

      context.sdk.registry.getConfidentialToken.mockResolvedValue({ confidentialTokenAddress: '0x' + '99'.repeat(20), isValid: true })

      await expect(account.getConfidentialTokenFor(USDT_MOCK_SEPOLIA)).resolves.toBe('0x' + '99'.repeat(20))

      context.sdk.registry.getConfidentialToken.mockRejectedValue(new Error('rpc down'))

      await expect(account.getConfidentialTokenFor('0x' + '77'.repeat(20))).resolves.toBeNull()
    })
  })

  describe('plaintext balance reads', () => {
    test('getTokenBalance throws UnsupportedTokenError for a known confidential token', async () => {
      await expect(account.getTokenBalance(CUSDT_MOCK_SEPOLIA)).rejects.toBeInstanceOf(UnsupportedTokenError)
      await expect(account.getTokenBalances([USDT_MOCK_SEPOLIA, CUSDT_MOCK_SEPOLIA.toLowerCase()])).rejects.toBeInstanceOf(UnsupportedTokenError)
    })

    test('getTokenBalance keeps working for plain tokens', async () => {
      // No provider: the inherited method throws ProviderRequiredError, proving the override let it through.
      await expect(account.getTokenBalance(USDT_MOCK_SEPOLIA)).rejects.toMatchObject({ name: 'ProviderRequiredError' })
    })
  })

  test('dispose releases the shared context and the signer', async () => {
    const disposable = WalletAccountEvmZama.fromPrivateKey(PRIVATE_KEY, { zama: { chain: 'sepolia' } })

    expect(() => disposable.dispose()).not.toThrow()
    expect(disposable.keyPair.privateKey).toBeNull()
  })
})

import { describe, expect, test } from '@jest/globals'
import { MaximumFeeExceededError, WdkError } from '@tetherto/wdk-wallet'
import { DecryptionFailedError, InsufficientConfidentialBalanceError, SigningRejectedError, TransactionRevertedError, ZamaError } from '@zama-fhe/sdk'

import { PermitRequiredError, UnshieldPendingError, UnsupportedAccountError, UnsupportedTokenError, ZamaWdkError, assertSupportedAccount, runSdkOperation, toWdkError } from '../src/errors.js'

const TOKEN = '0x4E7B06D78965594eB5EF5414c357ca21E1554491'

describe('error classes', () => {
  test('all extend ZamaWdkError and WdkError', () => {
    for (const error of [new UnsupportedTokenError(TOKEN), new UnsupportedAccountError(), new PermitRequiredError([TOKEN]), new UnshieldPendingError('0x' + 'ab'.repeat(32))]) {
      expect(error).toBeInstanceOf(ZamaWdkError)
      expect(error).toBeInstanceOf(WdkError)
      expect(error.name).not.toBe('ZamaWdkError')
    }
  })

  test('flag user-actionable errors', () => {
    expect(new PermitRequiredError([TOKEN]).isUserActionable).toBe(true)
    expect(new UnshieldPendingError('0x' + 'ab'.repeat(32)).isUserActionable).toBe(true)
    expect(new UnsupportedTokenError(TOKEN).isUserActionable).toBe(false)
    expect(new UnsupportedAccountError().isUserActionable).toBe(false)
  })

  test('carry their context', () => {
    expect(new UnsupportedTokenError(TOKEN).token).toBe(TOKEN)
    expect(new PermitRequiredError([TOKEN]).tokens).toEqual([TOKEN])
    expect(new UnshieldPendingError('0x' + 'ab'.repeat(32)).unwrapHash).toBe('0x' + 'ab'.repeat(32))
  })
})

describe('toWdkError', () => {
  test('maps an insufficient balance to a user-actionable error without amounts', () => {
    const sdkError = new InsufficientConfidentialBalanceError('Insufficient confidential balance: requested 1000000, available 250000 (token: 0xabc)', { requested: 1_000_000n, available: 250_000n, token: TOKEN })

    const mapped = toWdkError(sdkError)

    expect(mapped).toBeInstanceOf(ZamaWdkError)
    expect(mapped.isUserActionable).toBe(true)
    expect(mapped.cause).toBe(sdkError)
    expect(mapped.code).toBe(sdkError.code)
    expect(mapped.message).not.toMatch(/1000000|250000|0xabc/)
  })

  test('maps decryption failures and reverts to non-actionable errors', () => {
    expect(toWdkError(new DecryptionFailedError('kms said no')).isUserActionable).toBe(false)
    expect(toWdkError(new TransactionRevertedError('reverted')).isUserActionable).toBe(false)
    expect(toWdkError(new SigningRejectedError('user rejected')).isUserActionable).toBe(true)
  })

  test('falls back to a generic message for other SDK codes', () => {
    const mapped = toWdkError(new ZamaError('CONFIGURATION_ERROR', 'secret handle 0xdeadbeef'))

    expect(mapped).toBeInstanceOf(ZamaWdkError)
    expect(mapped.message).toContain('CONFIGURATION_ERROR')
    expect(mapped.message).not.toContain('0xdeadbeef')
  })

  test('returns WDK errors found in the cause chain', () => {
    const wdkError = new MaximumFeeExceededError('too expensive')
    const wrapped = new ZamaError('TRANSACTION_REVERTED', 'wrapped', { cause: new Error('middle', { cause: wdkError }) })

    expect(toWdkError(wrapped)).toBe(wdkError)
    expect(toWdkError(wdkError)).toBe(wdkError)
  })

  test('returns unrelated errors unchanged', () => {
    const error = new TypeError('oops')

    expect(toWdkError(error)).toBe(error)
    expect(toWdkError('string')).toBe('string')
  })
})

describe('runSdkOperation', () => {
  test('returns the result or rethrows through toWdkError', async () => {
    await expect(runSdkOperation(async () => 42)).resolves.toBe(42)
    await expect(runSdkOperation(async () => { throw new DecryptionFailedError('no') })).rejects.toBeInstanceOf(ZamaWdkError)
  })
})

describe('assertSupportedAccount', () => {
  test('accepts regular accounts and undefined, rejects ERC-4337 accounts', () => {
    expect(() => assertSupportedAccount(undefined)).not.toThrow()
    expect(() => assertSupportedAccount({ getAddress () {} })).not.toThrow()
    expect(() => assertSupportedAccount({ getUserOperationReceipt () {} })).toThrow(UnsupportedAccountError)
  })
})

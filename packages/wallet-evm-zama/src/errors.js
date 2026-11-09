// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

import { WdkError } from '@tetherto/wdk-wallet'
import { ZamaError, ZamaErrorCode } from '@zama-fhe/sdk'

/**
 * Base class for every error thrown by the Zama WDK modules. Catch this to handle all
 * Zama-specific failures without catching unrelated errors. Extends WDK's `WdkError`, so
 * `catch (e) { if (e instanceof WdkError) ... }` also catches these.
 *
 * `isUserActionable` distinguishes errors a wallet UI should surface to the end user
 * (insufficient balance, rejected signature) from developer errors (misconfiguration).
 *
 * Messages never contain amounts, plaintexts or encrypted handles. The original SDK error, which
 * may contain them, is available as `cause`.
 */
export class ZamaWdkError extends WdkError {
  /**
   * @param {string} message - The error's message.
   * @param {boolean} [isUserActionable] - Whether an end user can act on it.
   * @param {ErrorOptions} [options] - The error's options, forwarded to `WdkError`.
   */
  constructor (message, isUserActionable = false, options) {
    super(message, options)

    this.name = 'ZamaWdkError'

    /**
     * Whether an end user can act on this error.
     *
     * @type {boolean}
     */
    this.isUserActionable = isUserActionable

    /**
     * The machine-readable code of the underlying Zama SDK error, if any.
     *
     * @type {string | undefined}
     */
    this.code = options?.cause instanceof ZamaError ? options.cause.code : undefined
  }
}

/**
 * Thrown when a confidential (ERC-7984) token is passed to a method that only works with plain
 * ERC-20 tokens, such as `getTokenBalance`. Use `getConfidentialBalance` instead.
 */
export class UnsupportedTokenError extends ZamaWdkError {
  /**
   * @param {string} token - The offending token address.
   * @param {string} [hint] - What to call instead.
   */
  constructor (token, hint = 'Use getConfidentialBalance(token) for confidential tokens.') {
    super(`Token ${token} is a confidential (ERC-7984) token and is not supported by this method. ${hint}`)

    this.name = 'UnsupportedTokenError'

    /**
     * The offending token address.
     *
     * @type {string}
     */
    this.token = token
  }
}

/**
 * Thrown when the wallet account cannot drive the Zama SDK. ERC-4337 smart accounts are
 * rejected: their signer address differs from the account address, so decrypt permits and
 * ACL checks would fail, and `sendTransaction` returns a user-operation hash instead of a
 * transaction hash.
 */
export class UnsupportedAccountError extends ZamaWdkError {
  /**
   * @param {string} [reason] - Why the account is unsupported.
   */
  constructor (reason = 'ERC-4337 smart accounts are not supported in this release.') {
    super(`Unsupported wallet account: ${reason}`)

    this.name = 'UnsupportedAccountError'
  }
}

/**
 * Thrown by `getConfidentialBalance` when no decrypt permit covers the token and automatic
 * granting was not requested. Call `grantDecryptPermit([token])` behind an explicit user
 * action, or pass `{ autoGrant: true }`.
 */
export class PermitRequiredError extends ZamaWdkError {
  /**
   * @param {string[]} tokens - The token addresses that need a permit.
   */
  constructor (tokens) {
    super('A decrypt permit is required to read confidential balances. Call grantDecryptPermit(tokens) first, or pass { autoGrant: true }.', true)

    this.name = 'PermitRequiredError'

    /**
     * The token addresses that need a permit.
     *
     * @type {string[]}
     */
    this.tokens = tokens
  }
}

/**
 * Thrown by `unshield` when the unwrap transaction was submitted but the finalize phase failed.
 * The funds are not lost: call `resumeUnshield({ token, unwrapHash })` to finish the operation.
 */
export class UnshieldPendingError extends ZamaWdkError {
  /**
   * @param {string} unwrapHash - The hash of the submitted unwrap transaction.
   * @param {ErrorOptions} [options] - The error's options.
   */
  constructor (unwrapHash, options) {
    super('The unshield was interrupted after the unwrap transaction was submitted. Call resumeUnshield({ token, unwrapHash }) to finalize it.', true, options)

    this.name = 'UnshieldPendingError'

    /**
     * The hash of the submitted unwrap transaction.
     *
     * @type {string}
     */
    this.unwrapHash = unwrapHash
  }
}

/**
 * Safe, amount-free messages for the Zama SDK error codes that end users commonly hit.
 *
 * @type {Record<string, { message: string, isUserActionable: boolean }>}
 */
const SDK_ERROR_MESSAGES = {
  [ZamaErrorCode.InsufficientConfidentialBalance]: { message: 'Insufficient confidential balance.', isUserActionable: true },
  [ZamaErrorCode.InsufficientERC20Balance]: { message: 'Insufficient token balance.', isUserActionable: true },
  [ZamaErrorCode.InsufficientAllowance]: { message: 'Insufficient token allowance.', isUserActionable: true },
  [ZamaErrorCode.SigningRejected]: { message: 'The signature request was rejected.', isUserActionable: true },
  [ZamaErrorCode.DecryptionFailed]: { message: 'The confidential value could not be decrypted.', isUserActionable: false },
  [ZamaErrorCode.TransactionReverted]: { message: 'The transaction reverted on-chain.', isUserActionable: false },
  [ZamaErrorCode.RelayerRequestFailed]: { message: 'The Zama relayer request failed.', isUserActionable: false },
  [ZamaErrorCode.NotEntitled]: { message: 'The relayer rejected the request: the API key is missing, invalid or out of quota.', isUserActionable: false },
  [ZamaErrorCode.RpcRateLimited]: { message: 'The RPC provider rate-limited the request. Retry later.', isUserActionable: true }
}

/**
 * Maps an error thrown by the Zama SDK to the error a WDK caller expects.
 *
 * - A `WdkError` anywhere in the `cause` chain (e.g. `MaximumFeeExceededError` thrown by the
 *   account's `sendTransaction` and wrapped by the SDK) is returned as-is, so WDK fee caps and
 *   policies keep their native error types.
 * - A `ZamaError` becomes a `ZamaWdkError` with a safe message and the original error as `cause`.
 * - Anything else is returned unchanged.
 *
 * @param {unknown} error - The caught error.
 * @returns {unknown} The error to throw.
 */
export function toWdkError (error) {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current instanceof WdkError) {
      return current
    }
  }

  if (error instanceof ZamaError) {
    const mapped = SDK_ERROR_MESSAGES[error.code] ?? { message: `Zama SDK operation failed (${error.code}).`, isUserActionable: false }

    return new ZamaWdkError(mapped.message, mapped.isUserActionable, { cause: error })
  }

  return error
}

/**
 * Runs an async SDK operation and rethrows its failure through {@link toWdkError}.
 *
 * @template T
 * @param {() => Promise<T>} operation - The operation to run.
 * @returns {Promise<T>} The operation's result.
 */
export async function runSdkOperation (operation) {
  try {
    return await operation()
  } catch (error) {
    throw toWdkError(error)
  }
}

/**
 * Throws if the account is an ERC-4337 smart account, which this module does not support.
 *
 * @param {unknown} account - The wallet account to inspect.
 * @throws {UnsupportedAccountError} If the account is an ERC-4337 smart account.
 */
export function assertSupportedAccount (account) {
  if (account && typeof account === 'object' && typeof (/** @type {any} */ (account)).getUserOperationReceipt === 'function') {
    throw new UnsupportedAccountError()
  }
}

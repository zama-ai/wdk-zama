// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

import { ValueError } from '@tetherto/wdk-wallet'
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import { PrivateKeySignerEvm } from '@tetherto/wdk-wallet-evm/signers'
import { UnshieldAlreadyFinalizedError } from '@zama-fhe/sdk'
import { getAddress, isAddress } from 'viem'

import { getSharedZamaSdk, disposeSharedZamaSdk } from './adapter/create-zama-sdk.js'
import { PermitRequiredError, UnshieldPendingError, UnsupportedTokenError, runSdkOperation, toWdkError } from './errors.js'
import { findPairByConfidential, findPairByErc20 } from './tokens.js'

/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmWalletConfig} EvmWalletConfig */
/** @typedef {import('@tetherto/wdk-wallet-evm').SignerOptions} SignerOptions */
/** @typedef {import('@tetherto/wdk-wallet-evm/signers').ISignerEvm} ISignerEvm */
/** @typedef {import('./adapter/create-zama-sdk.js').ZamaModuleConfig} ZamaModuleConfig */
/** @typedef {import('./adapter/create-zama-sdk.js').ZamaContext} ZamaContext */

/**
 * The configuration of a Zama-enabled EVM wallet account: the standard EVM wallet configuration
 * plus the Zama module configuration under `zama`.
 *
 * @typedef {EvmWalletConfig & { zama?: ZamaModuleConfig }} EvmZamaWalletConfig
 */

/**
 * @typedef {Object} ConfidentialTransferOptions
 * @property {string} token - The address of the confidential (ERC-7984) token.
 * @property {string} recipient - The recipient's address.
 * @property {bigint} amount - The amount to transfer, in the token's base units. Encrypted on the client before sending.
 */

/**
 * @typedef {Object} ShieldOptions
 * @property {string} token - The address of the confidential (ERC-7984) wrapper token.
 * @property {bigint} amount - The amount of the underlying ERC-20 to shield, in base units.
 */

/**
 * @typedef {Object} ShieldResult
 * @property {string} hash - The hash of the wrap (or ERC-1363 transfer-and-call) transaction.
 * @property {bigint} fee - The total quoted fee of the shield's transactions, in wei.
 * @property {string} [approvalHash] - The hash of the ERC-20 approval transaction, when the two-transaction path was used.
 */

/**
 * @typedef {Object} UnshieldOptions
 * @property {string} token - The address of the confidential (ERC-7984) wrapper token.
 * @property {bigint} amount - The amount of confidential tokens to unshield, in base units.
 */

/**
 * Progress callbacks of the two-phase unshield.
 *
 * @typedef {Object} UnshieldCallbacks
 * @property {(unwrapHash: string) => void} [onUnwrapSubmitted] - Fired after the unwrap transaction is submitted.
 * @property {() => void} [onFinalizing] - Fired when the finalize phase begins (the KMS is decrypting the amount).
 * @property {(finalizeHash: string) => void} [onFinalizeSubmitted] - Fired after the finalize transaction is submitted.
 */

/**
 * @typedef {Object} UnshieldResult
 * @property {string} unwrapHash - The hash of the unwrap (phase 1) transaction.
 * @property {string} finalizeHash - The hash of the finalize (phase 2) transaction.
 * @property {bigint} fee - The total quoted fee of both transactions, in wei.
 */

/**
 * @typedef {Object} ResumeUnshieldOptions
 * @property {string} token - The address of the confidential (ERC-7984) wrapper token.
 * @property {string} unwrapHash - The hash of the unwrap transaction to finalize.
 */

/**
 * @typedef {Object} ResumeUnshieldResult
 * @property {string | null} finalizeHash - The hash of the finalize transaction, or null if the unshield had already been finalized.
 * @property {bigint} fee - The quoted fee of the finalize transaction, in wei (0n if nothing was sent).
 */

/**
 * An EVM wallet account with Zama confidential token support.
 *
 * Extends the standard {@link WalletAccountEvm} with decrypted confidential balances, confidential
 * transfers, and shield / unshield between an ERC-20 and its confidential (ERC-7984) wrapper.
 *
 * Every `token` argument is the address of the **confidential** token. All amounts are `bigint`
 * base units.
 *
 * Privacy: shield and unshield amounts are public ERC-20 transfers. Confidential balances and
 * confidential-transfer amounts are encrypted. Sender and recipient addresses are always public.
 *
 * Inherited methods keep their public, plaintext behavior: `transfer()` on a confidential token is
 * **not** a confidential transfer, and `getTokenBalance()` on a confidential token throws
 * {@link UnsupportedTokenError} because ERC-7984 has no plaintext `balanceOf`.
 */
export default class WalletAccountEvmZama extends WalletAccountEvm {
  /**
   * Creates a new Zama-enabled evm wallet account from a BIP-39 seed, deriving the account's key at
   * the given BIP-44 path.
   *
   * @overload
   * @param {string | Uint8Array} seed - A BIP-39 mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
   * @param {string} path - The BIP-44 account path, relative to "m/44'/60'" (e.g. "0'/0/0").
   * @param {EvmZamaWalletConfig} [config] - The configuration object.
   */

  /**
   * Creates a new Zama-enabled evm wallet account from a BIP-39 seed at path m/44'/60'/0'/0/0.
   *
   * @overload
   * @param {string | Uint8Array} seed - A BIP-39 mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
   * @param {EvmZamaWalletConfig} [config] - The configuration object.
   */

  /**
   * Creates a new Zama-enabled evm wallet account using a signer.
   *
   * @overload
   * @param {ISignerEvm} signer - A signer implementing the EVM signer interface.
   * @param {EvmZamaWalletConfig & SignerOptions} [config] - The configuration object.
   */
  constructor (seedOrSigner, pathOrConfig = {}, config = {}) {
    super(seedOrSigner, pathOrConfig, config)

    const configuration = typeof pathOrConfig === 'string' ? config : pathOrConfig

    /**
     * The Zama module configuration.
     *
     * @protected
     * @type {ZamaModuleConfig}
     */
    this._zamaConfig = configuration.zama ?? {}
  }

  /**
   * Creates a new Zama-enabled evm wallet account from a raw private key.
   *
   * @param {string | Uint8Array} privateKey - The raw private key (hex string with or without 0x, or 32 bytes).
   * @param {EvmZamaWalletConfig} [config] - The configuration object.
   * @returns {WalletAccountEvmZama} The wallet account.
   */
  static fromPrivateKey (privateKey, config = {}) {
    const signer = new PrivateKeySignerEvm(privateKey)

    return new WalletAccountEvmZama(signer, { ...config, shouldWipeSignerOnDisposal: true })
  }

  /**
   * Returns the Zama context (SDK, chain, pairs) of this account, creating it on first use.
   *
   * @protected
   * @returns {Promise<ZamaContext>} The Zama context.
   */
  async _getZama () {
    return await getSharedZamaSdk(this, this._zamaConfig)
  }

  /**
   * Returns the account's decrypted balance of a confidential token.
   *
   * This is a decrypting read: it takes a round trip to the Zama relayer and KMS (seconds), so do
   * not call it on every render. A decrypt permit must cover the token. Without one, the method
   * throws {@link PermitRequiredError} unless `autoGrant` is set, in which case it signs a permit
   * first (silent for seed and private-key accounts, a wallet prompt for interactive signers).
   *
   * @param {string} token - The address of the confidential (ERC-7984) token.
   * @param {{ autoGrant?: boolean }} [options] - Whether to sign a decrypt permit automatically when none exists.
   * @returns {Promise<bigint>} The balance, in the token's base units.
   * @throws {PermitRequiredError} If no permit covers the token and `autoGrant` is not set.
   * @throws {ZamaWdkError} If decryption fails.
   */
  async getConfidentialBalance (token, options = {}) {
    const address = getAddress(assertAddress(token, 'token'))
    const { sdk } = await this._getZama()
    const owner = getAddress(await this.getAddress())

    if (!(await sdk.permits.hasPermit([address]))) {
      if (!options.autoGrant) {
        throw new PermitRequiredError([address])
      }

      await runSdkOperation(() => sdk.permits.grantPermit([address]))
    }

    return await runSdkOperation(() => sdk.createToken(address).balanceOf(owner))
  }

  /**
   * Whether a decrypt permit covers the given confidential tokens. Never prompts.
   *
   * @param {string[]} tokens - The addresses of the confidential tokens.
   * @returns {Promise<boolean>} True if a stored permit covers every token.
   */
  async hasDecryptPermit (tokens) {
    const { sdk } = await this._getZama()

    return await sdk.permits.hasPermit(tokens.map(token => getAddress(assertAddress(token, 'token'))))
  }

  /**
   * Signs and stores a decrypt permit for the given confidential tokens (one EIP-712 signature).
   * Idempotent: tokens already covered by a valid permit are skipped.
   *
   * Wallet UIs should call this behind an explicit user action, such as a "show balance" button.
   *
   * @param {string[]} tokens - The addresses of the confidential tokens.
   * @returns {Promise<void>}
   * @throws {ZamaWdkError} If the signature is rejected or the permit cannot be stored.
   */
  async grantDecryptPermit (tokens) {
    const { sdk } = await this._getZama()

    await runSdkOperation(() => sdk.permits.grantPermit(tokens.map(token => getAddress(assertAddress(token, 'token')))))
  }

  /**
   * Revokes the stored decrypt permits of the given confidential tokens, or all of them.
   * Use it on sign-out and reset.
   *
   * @param {string[]} [tokens] - The addresses of the confidential tokens. Omit to revoke every permit.
   * @returns {Promise<void>}
   */
  async revokeDecryptPermits (tokens) {
    const { sdk } = await this._getZama()

    await runSdkOperation(() => sdk.permits.revokePermits(tokens?.map(token => getAddress(assertAddress(token, 'token')))))
  }

  /**
   * Transfers confidential tokens to another address. The amount is encrypted on the client; only
   * the sender, the recipient and the token contract can ever decrypt it.
   *
   * The account's confidential balance is checked before sending (a decrypting read).
   *
   * @param {ConfidentialTransferOptions} options - The transfer's options.
   * @returns {Promise<TransactionResult>} The transaction's hash and quoted fee.
   * @throws {ValueError} If the recipient or amount is invalid.
   * @throws {ZamaWdkError} If the balance is insufficient or the transfer fails.
   * @throws {MaximumFeeExceededError} If the transaction's cost exceeds the `transactionMaxFee` option.
   */
  async confidentialTransfer ({ token, recipient, amount }) {
    const tokenAddress = getAddress(assertAddress(token, 'token'))
    const to = getAddress(assertAddress(recipient, 'recipient'))
    const value = assertPositiveAmount(amount)
    const { sdk, signer } = await this._getZama()

    const result = await runSdkOperation(() => sdk.createToken(tokenAddress).confidentialTransfer(to, value))

    return { hash: result.txHash, fee: signer.takeFee(result.txHash) }
  }

  /**
   * Quotes the fee of a confidential transfer.
   *
   * The input proof is generated only in the real call, so the quote is approximate: it is the
   * configured gas estimate for a confidential transfer times the current fee rate.
   *
   * @param {ConfidentialTransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The quoted fee, in wei.
   */
  async quoteConfidentialTransfer (options) {
    assertAddress(options.token, 'token')

    const { gasEstimates } = await this._getZama()

    return { fee: await this._estimateFee(gasEstimates.confidentialTransfer) }
  }

  /**
   * Shields ERC-20 tokens into their confidential wrapper. The amount is public (it is an ERC-20
   * transfer into the wrapper); the resulting confidential balance is encrypted.
   *
   * The SDK picks the one-transaction ERC-1363 path when the ERC-20 supports it, and the
   * approve + wrap path otherwise.
   *
   * @param {ShieldOptions} options - The shield's options.
   * @returns {Promise<ShieldResult>} The transaction hashes and total quoted fee.
   * @throws {ValueError} If the amount is invalid.
   * @throws {ZamaWdkError} If the ERC-20 balance is insufficient or the shield fails.
   * @throws {MaximumFeeExceededError} If a transaction's cost exceeds the `transactionMaxFee` option.
   */
  async shield ({ token, amount }) {
    const tokenAddress = getAddress(assertAddress(token, 'token'))
    const value = assertPositiveAmount(amount)
    const { sdk, signer } = await this._getZama()

    let approvalHash

    const result = await runSdkOperation(() => sdk.createWrappedToken(tokenAddress).shield(value, {
      onApprovalSubmitted: hash => { approvalHash = hash }
    }))

    let fee = signer.takeFee(result.txHash)

    if (approvalHash) {
      fee += signer.takeFee(approvalHash)
    }

    return approvalHash ? { hash: result.txHash, fee, approvalHash } : { hash: result.txHash, fee }
  }

  /**
   * Unshields confidential tokens back to the ERC-20. Runs both phases: the unwrap transaction,
   * then, once the KMS has decrypted the amount (seconds), the finalize transaction.
   *
   * If phase 2 fails after the unwrap was submitted, the method throws {@link UnshieldPendingError}
   * with the `unwrapHash`; call {@link resumeUnshield} to finish. The SDK also records the pending
   * unwrap in the configured storage, see {@link getPendingUnshield}.
   *
   * @param {UnshieldOptions} options - The unshield's options.
   * @param {UnshieldCallbacks} [callbacks] - Progress callbacks.
   * @returns {Promise<UnshieldResult>} The transaction hashes and total quoted fee.
   * @throws {ValueError} If the amount is invalid.
   * @throws {UnshieldPendingError} If the finalize phase fails after the unwrap was submitted.
   * @throws {ZamaWdkError} If the confidential balance is insufficient or the unwrap fails.
   * @throws {MaximumFeeExceededError} If a transaction's cost exceeds the `transactionMaxFee` option.
   */
  async unshield ({ token, amount }, callbacks = {}) {
    const tokenAddress = getAddress(assertAddress(token, 'token'))
    const value = assertPositiveAmount(amount)
    const { sdk, signer } = await this._getZama()

    let unwrapHash

    try {
      const result = await sdk.createWrappedToken(tokenAddress).unshield(value, {
        onUnwrapSubmitted: hash => {
          unwrapHash = hash

          callbacks.onUnwrapSubmitted?.(hash)
        },
        onFinalizing: callbacks.onFinalizing,
        onFinalizeSubmitted: callbacks.onFinalizeSubmitted
      })

      return {
        unwrapHash,
        finalizeHash: result.txHash,
        fee: signer.takeFee(unwrapHash) + signer.takeFee(result.txHash)
      }
    } catch (error) {
      if (unwrapHash) {
        throw new UnshieldPendingError(unwrapHash, { cause: toWdkError(error) })
      }

      throw toWdkError(error)
    }
  }

  /**
   * Returns the unwrap transaction hash of an unshield that was started but not finalized, if the
   * configured storage holds one. Nothing resumes automatically: call {@link resumeUnshield}.
   *
   * @param {string} token - The address of the confidential (ERC-7984) wrapper token.
   * @returns {Promise<string | null>} The pending unwrap transaction hash, or null.
   */
  async getPendingUnshield (token) {
    const tokenAddress = getAddress(assertAddress(token, 'token'))
    const { sdk } = await this._getZama()

    return await runSdkOperation(() => sdk.createWrappedToken(tokenAddress).getPendingUnshield())
  }

  /**
   * Finalizes an unshield whose unwrap transaction was submitted earlier.
   *
   * @param {ResumeUnshieldOptions} options - The token and the unwrap transaction hash.
   * @returns {Promise<ResumeUnshieldResult>} The finalize transaction hash, or null if it had already been finalized.
   * @throws {ZamaWdkError} If the finalize fails.
   * @throws {MaximumFeeExceededError} If the transaction's cost exceeds the `transactionMaxFee` option.
   */
  async resumeUnshield ({ token, unwrapHash }) {
    const tokenAddress = getAddress(assertAddress(token, 'token'))
    const hash = assertTransactionHash(unwrapHash, 'unwrapHash')
    const { sdk, signer } = await this._getZama()

    try {
      const result = await sdk.createWrappedToken(tokenAddress).resumeUnshield(hash)

      return { finalizeHash: result.txHash, fee: signer.takeFee(result.txHash) }
    } catch (error) {
      if (error instanceof UnshieldAlreadyFinalizedError) {
        return { finalizeHash: null, fee: 0n }
      }

      throw toWdkError(error)
    }
  }

  /**
   * Returns the confidential wrapper of an ERC-20 token, from the on-chain wrappers registry, or
   * from the configured pairs when the registry has no valid entry.
   *
   * @param {string} erc20 - The address of the plain ERC-20 token.
   * @returns {Promise<string | null>} The confidential token's address, or null if none is known.
   */
  async getConfidentialTokenFor (erc20) {
    const address = getAddress(assertAddress(erc20, 'erc20'))
    const { sdk, pairs } = await this._getZama()

    try {
      const entry = await sdk.registry.getConfidentialToken(address)

      if (entry?.isValid) {
        return entry.confidentialTokenAddress
      }
    } catch {
      // Fall back to the static pair table below.
    }

    return findPairByErc20(pairs, address)?.confidential ?? null
  }

  /**
   * Returns the account balance for a specific ERC-20 token.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<bigint>} The token balance (in base unit).
   * @throws {UnsupportedTokenError} If the token is a known confidential token. Use {@link getConfidentialBalance}.
   */
  async getTokenBalance (tokenAddress) {
    await this._assertPlainToken(tokenAddress)

    return await super.getTokenBalance(tokenAddress)
  }

  /**
   * Returns the account balances for multiple ERC-20 tokens.
   *
   * @param {string[]} tokenAddresses - The smart contract addresses of the tokens.
   * @returns {Promise<Record<string, bigint>>} A mapping of token addresses to their balances (in base units).
   * @throws {UnsupportedTokenError} If any token is a known confidential token. Use {@link getConfidentialBalance}.
   */
  async getTokenBalances (tokenAddresses) {
    for (const tokenAddress of tokenAddresses) {
      await this._assertPlainToken(tokenAddress)
    }

    return await super.getTokenBalances(tokenAddresses)
  }

  /**
   * Disposes the Zama SDK (relayer worker pool, permit cache) and then the account itself.
   */
  dispose () {
    disposeSharedZamaSdk(this, this._zamaConfig).catch(() => {})

    super.dispose()
  }

  /**
   * Throws if the token is one of the known confidential tokens of the chain.
   *
   * Known tokens are the chain's defaults plus the configured `pairs`; the check never hits the
   * network, so unknown confidential tokens pass through to the plaintext read.
   *
   * @private
   * @param {string} tokenAddress - The token address.
   * @throws {UnsupportedTokenError} If the token is a known confidential token.
   */
  async _assertPlainToken (tokenAddress) {
    let pairs

    try {
      ({ pairs } = await this._getZama())
    } catch {
      return
    }

    if (findPairByConfidential(pairs, tokenAddress)) {
      throw new UnsupportedTokenError(tokenAddress)
    }
  }

  /**
   * Estimates a fee from a gas amount and the current fee rate.
   *
   * @private
   * @param {bigint} gas - The gas units.
   * @returns {Promise<bigint>} The fee, in wei.
   */
  async _estimateFee (gas) {
    const { provider } = await this._getZama()
    const { maxFeePerGas, gasPrice } = await provider.getFeeData()

    return gas * BigInt(maxFeePerGas ?? gasPrice ?? 0n)
  }
}

/**
 * @param {unknown} value - The value to check.
 * @param {string} name - The argument name, for the error message.
 * @returns {string} The address.
 * @throws {ValueError} If the value is not an EVM address.
 */
function assertAddress (value, name) {
  if (typeof value !== 'string' || !isAddress(value, { strict: false })) {
    throw new ValueError(`Invalid ${name}: expected an EVM address.`)
  }

  return value
}

/**
 * @param {unknown} value - The value to check.
 * @returns {bigint} The amount.
 * @throws {ValueError} If the value is not a positive integer.
 */
function assertPositiveAmount (value) {
  let amount

  try {
    amount = BigInt(/** @type {any} */ (value))
  } catch {
    throw new ValueError('Invalid amount: expected a positive integer in base units.')
  }

  if (amount <= 0n) {
    throw new ValueError('Invalid amount: expected a positive integer in base units.')
  }

  return amount
}

/**
 * @param {unknown} value - The value to check.
 * @param {string} name - The argument name, for the error message.
 * @returns {`0x${string}`} The hash.
 * @throws {ValueError} If the value is not a transaction hash.
 */
function assertTransactionHash (value, name) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new ValueError(`Invalid ${name}: expected a transaction hash.`)
  }

  return /** @type {`0x${string}`} */ (value)
}

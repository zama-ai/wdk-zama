// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

import { createWalletAccountStore, WalletNotConnectedError } from '@zama-fhe/sdk'
import { encodeFunctionData, getAddress } from 'viem'

import { assertSupportedAccount } from '../errors.js'
import { toWdkTypedData } from './typed-data.js'

/** @typedef {import('@zama-fhe/sdk').GenericSigner} GenericSigner */
/** @typedef {import('@zama-fhe/sdk').WalletAccount} WalletAccount */
/** @typedef {import('@zama-fhe/sdk').WalletAccountStore} WalletAccountStore */
/** @typedef {import('@zama-fhe/sdk').EIP712TypedData} EIP712TypedData */
/** @typedef {import('@zama-fhe/sdk').WriteContractConfig} WriteContractConfig */
/** @typedef {import('@tetherto/wdk-wallet-evm').WalletAccountEvm} WalletAccountEvm */

/**
 * The subset of a WDK EVM account the signer relies on. Only public methods are used, so seed,
 * private-key, named and hardware signers all work, and WDK policies and middleware keep applying.
 *
 * @typedef {Object} WdkSignerAccount
 * @property {() => Promise<string>} getAddress - Returns the account's address.
 * @property {(typedData: import('@tetherto/wdk-wallet-evm').TypedData) => Promise<string>} signTypedData - Signs EIP-712 typed data.
 * @property {(tx: import('@tetherto/wdk-wallet-evm').EvmTransaction) => Promise<import('@tetherto/wdk-wallet').TransactionResult>} sendTransaction - Sends a transaction.
 * @property {boolean} [disposed] - Whether the account has been disposed.
 */

/** The maximum number of transaction fees kept in memory for later retrieval. */
const MAX_REMEMBERED_FEES = 64

/**
 * A Zama SDK `GenericSigner` backed by a WDK EVM wallet account.
 *
 * Signing goes through `account.signTypedData` and every contract write through
 * `account.sendTransaction`, so WDK's `transactionMaxFee` check, registered policies and
 * middleware all apply. The adapter never touches seeds or private keys.
 *
 * @implements {GenericSigner}
 */
export default class WdkZamaSigner {
  /**
   * Creates a signer from a WDK account whose address is already known. Prefer {@link WdkZamaSigner.create}.
   *
   * @param {WdkSignerAccount} account - The WDK wallet account.
   * @param {WalletAccount} walletAccount - The account's address and chain id.
   */
  constructor (account, walletAccount) {
    assertSupportedAccount(account)

    /** @private */
    this._account = account

    /**
     * Observable wallet account state. WDK accounts never change address, so the store emits its
     * snapshot once, synchronously, to every subscriber and never again.
     *
     * @type {WalletAccountStore}
     */
    this.walletAccount = createWalletAccountStore(walletAccount)

    /**
     * The quoted fee of each transaction sent through this signer, by hash.
     *
     * @private
     * @type {Map<string, bigint>}
     */
    this._fees = new Map()
  }

  /**
   * Creates a signer for a WDK account on the given chain.
   *
   * @param {WdkSignerAccount} account - The WDK wallet account.
   * @param {number} chainId - The chain id the account operates on.
   * @returns {Promise<WdkZamaSigner>} The signer.
   */
  static async create (account, chainId) {
    assertSupportedAccount(account)

    const address = getAddress(await account.getAddress())

    return new WdkZamaSigner(account, { address, chainId })
  }

  /**
   * Returns the connected wallet account.
   *
   * @param {string} operation - The name of the SDK operation asking for it.
   * @returns {WalletAccount} The wallet account.
   * @throws {WalletNotConnectedError} If the WDK account has been disposed.
   */
  requireWalletAccount (operation) {
    const snapshot = this.walletAccount.getSnapshot()

    if (!snapshot || this._account.disposed === true) {
      throw new WalletNotConnectedError(operation)
    }

    return snapshot
  }

  /**
   * Signs EIP-712 typed data (decrypt permits and delegations) with the WDK account.
   *
   * @param {EIP712TypedData} typedData - The typed data emitted by the Zama SDK.
   * @returns {Promise<`0x${string}`>} The signature.
   */
  async signTypedData (typedData) {
    const signature = await this._account.signTypedData(toWdkTypedData(typedData))

    return /** @type {`0x${string}`} */ (signature)
  }

  /**
   * Encodes a contract call and sends it through the WDK account.
   *
   * @param {WriteContractConfig} config - The contract call.
   * @returns {Promise<`0x${string}`>} The transaction hash.
   */
  async writeContract (config) {
    const data = encodeFunctionData({ abi: config.abi, functionName: config.functionName, args: config.args })

    /** @type {import('@tetherto/wdk-wallet-evm').EvmTransaction} */
    const tx = { to: config.address, value: config.value ?? 0n, data }

    if (config.gas !== undefined) {
      tx.gasLimit = config.gas
    }

    const { hash, fee } = await this._account.sendTransaction(tx)

    this._rememberFee(hash, fee)

    return /** @type {`0x${string}`} */ (hash)
  }

  /**
   * Returns and forgets the fee WDK quoted for a transaction sent through this signer.
   *
   * @param {string} hash - The transaction hash.
   * @returns {bigint} The quoted fee in wei, or 0n if the hash is unknown.
   */
  takeFee (hash) {
    const key = hash.toLowerCase()
    const fee = this._fees.get(key) ?? 0n

    this._fees.delete(key)

    return fee
  }

  /**
   * Does nothing: the WDK account belongs to the caller and is disposed by them.
   */
  dispose () {}

  /**
   * @private
   * @param {string} hash - The transaction hash.
   * @param {bigint} fee - The quoted fee.
   */
  _rememberFee (hash, fee) {
    if (this._fees.size >= MAX_REMEMBERED_FEES) {
      this._fees.delete(this._fees.keys().next().value)
    }

    this._fees.set(hash.toLowerCase(), BigInt(fee))
  }
}

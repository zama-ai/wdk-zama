// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

import { MaximumFeeExceededError, NoSuchElementError, ValueError } from '@tetherto/wdk-wallet'
import { AccountRequiredError, SwidgeProtocol } from '@tetherto/wdk-wallet/protocols'
import { Topics, UnshieldAlreadyFinalizedError, decimalsContract, findUnwrapRequested, rateContract, symbolContract, unwrapRequesterContract } from '@zama-fhe/sdk'
import {
  CHAIN_METADATA,
  getSharedZamaSdk,
  disposeSharedZamaSdk,
  isWritableAccount,
  findPairByConfidential,
  findPairByErc20,
  isSameAddress,
  runSdkOperation,
  toWdkError
} from '@zama-fhe/wdk-wallet-evm-zama/adapter'
import { getAddress, isAddress, zeroAddress } from 'viem'

import { FeePriceRequiredError, UnsupportedRouteError } from './errors.js'
import { decodeSwidgeId, encodeSwidgeId } from './swidge-id.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeOptions} SwidgeOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeQuote} SwidgeQuote */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeResult} SwidgeResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeFee} SwidgeFee */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeTransaction} SwidgeTransaction */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeProtocolConfig} SwidgeProtocolConfig */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeStatusOptions} SwidgeStatusOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeStatusResult} SwidgeStatusResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeSupportedChain} SwidgeSupportedChain */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeSupportedToken} SwidgeSupportedToken */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeSupportedTokensOptions} SwidgeSupportedTokensOptions */
/** @typedef {import('@zama-fhe/wdk-wallet-evm-zama/adapter').ZamaModuleConfig} ZamaModuleConfig */
/** @typedef {import('@zama-fhe/wdk-wallet-evm-zama/adapter').ZamaContext} ZamaContext */
/** @typedef {import('@zama-fhe/wdk-wallet-evm-zama').TokenPair} TokenPair */

/**
 * The direction of a route: `shield` moves an ERC-20 into its confidential wrapper, `unshield`
 * moves confidential tokens back to the ERC-20.
 *
 * @typedef {'shield' | 'unshield'} ShieldDirection
 */

/**
 * The configuration of the Zama shield protocol: the Zama module configuration, the WDK swidge
 * fee caps, and the price needed to value network fees against those caps.
 *
 * @typedef {ZamaModuleConfig & SwidgeProtocolConfig & {
 *   nativeTokenPrice?: number
 * }} ZamaShieldProtocolConfig
 */

/**
 * A resolved route: its direction, pair and chain.
 *
 * @typedef {Object} Route
 * @property {ShieldDirection} direction - The direction.
 * @property {TokenPair} pair - The token pair.
 * @property {number} chainId - The chain id.
 */

/** Token identifier used for network fees, which are denominated in the chain's native token. */
const NATIVE_TOKEN = zeroAddress

/** Approximate durations, in seconds, used in quotes. */
const ESTIMATED_DURATION = Object.freeze({
  shield: 30,
  unshield: 90
})

/** Decimal digits kept when converting the native token price to an integer. */
const PRICE_PRECISION = 6n

/**
 * A WDK swidge protocol that shields an ERC-20 into its Zama confidential (ERC-7984) wrapper and
 * unshields it back, as a same-chain "swap". Any WDK wallet with a swap screen gets shielding
 * with no new UI.
 *
 * Routes are limited to the configured token pairs on the configured chain (by default USDT and
 * cUSDT on Ethereum mainnet, and their mocks on Sepolia). Shield and unshield amounts are public
 * ERC-20 transfers; only the resulting confidential balance is encrypted.
 *
 * An unshield takes two transactions: the unwrap request, and the finalize once the Zama KMS has
 * decrypted the amount (seconds). If the second one fails, `getSwidgeStatus` reports
 * `action-required` and the provider-specific {@link ZamaShieldProtocol.resumeSwidge} finishes it.
 *
 * @extends {SwidgeProtocol}
 */
export default class ZamaShieldProtocol extends SwidgeProtocol {
  /**
   * Creates a new Zama shield protocol without binding it to a wallet account. Quotes work; execution does not.
   *
   * @overload
   * @param {undefined} [account] - No account.
   * @param {ZamaShieldProtocolConfig} [config] - The protocol configuration.
   */

  /**
   * Creates a new read-only Zama shield protocol. Quotes work; execution does not.
   *
   * @overload
   * @param {IWalletAccountReadOnly} account - The read-only wallet account.
   * @param {ZamaShieldProtocolConfig} [config] - The protocol configuration.
   */

  /**
   * Creates a new Zama shield protocol.
   *
   * @overload
   * @param {IWalletAccount} account - The wallet account (a `WalletAccountEvm` or a subclass).
   * @param {ZamaShieldProtocolConfig} [config] - The protocol configuration.
   */
  constructor (account, config = {}) {
    super(account, config)

    /**
     * The protocol configuration.
     *
     * @protected
     * @type {ZamaShieldProtocolConfig}
     */
    this._config = config
  }

  /**
   * Returns the Zama context (SDK, chain, pairs) of this protocol, creating it on first use.
   *
   * The context is shared with every protocol instance built for the same account and
   * configuration, so WDK rebuilding the protocol on each `getSwidgeProtocol` call reuses one
   * relayer and one permit cache.
   *
   * @protected
   * @returns {Promise<ZamaContext>} The Zama context.
   */
  async _getZama () {
    return await getSharedZamaSdk(this._account, this._config)
  }

  /**
   * Quotes a shield or unshield.
   *
   * Amounts follow the wrapper's `rate()` (1 for USDT and cUSDT), with no slippage: `toTokenAmountMin`
   * equals `toTokenAmount`. The network fee is an estimate: the configured gas units of the
   * operation's transactions times the current fee rate, denominated in the native token
   * (`token` is the zero address). There is no protocol fee.
   *
   * @param {SwidgeOptions} options - The swidge options.
   * @returns {Promise<SwidgeQuote>} The quote.
   * @throws {UnsupportedRouteError} If the tokens are not a configured pair on the configured chain, or `toChain` differs.
   * @throws {ValueError} If the options are invalid.
   */
  async quoteSwidge (options) {
    const route = await this._resolveRoute(options)
    const { fromTokenAmount, toTokenAmount } = await this._resolveAmounts(route, options)

    await this._assertRecipient(options.recipient)

    if (options.minAmountOut !== undefined && BigInt(options.minAmountOut) > toTokenAmount) {
      throw new ValueError('The min. amount out exceeds the amount the route can deliver.')
    }

    const networkFee = await this._quoteNetworkFee(route)

    return {
      fromTokenAmount,
      toTokenAmount,
      toTokenAmountMin: toTokenAmount,
      fees: [networkFee],
      estimatedDuration: ESTIMATED_DURATION[route.direction],
      priceImpact: 0
    }
  }

  /**
   * Executes a shield or unshield.
   *
   * A shield returns once the wrap transaction is submitted. An unshield waits for both phases:
   * the unwrap and, after the KMS decryption, the finalize. If the finalize fails after the unwrap
   * was submitted, the result carries only the unwrap transaction and `getSwidgeStatus(id)`
   * reports `action-required` until {@link resumeSwidge} completes it.
   *
   * @param {SwidgeOptions} options - The swidge options.
   * @param {SwidgeProtocolConfig} [config] - Overrides for the fee caps of this call.
   * @returns {Promise<SwidgeResult>} The result. Its `id` is `"<chainId>:<shield|unshield>:<sourceTxHash>"`.
   * @throws {AccountRequiredError} If the protocol has no writable account.
   * @throws {UnsupportedRouteError} If the route is not supported.
   * @throws {ValueError} If the options are invalid, including a `recipient` other than the account's own address.
   * @throws {MaximumFeeExceededError} If the estimated network fee exceeds `maxNetworkFeeBps`.
   * @throws {FeePriceRequiredError} If `maxNetworkFeeBps` is set without `nativeTokenPrice`.
   * @throws {ZamaWdkError} If the Zama SDK operation fails.
   */
  async swidge (options, config = {}) {
    if (!isWritableAccount(this._account)) {
      throw new AccountRequiredError('A wallet account with signing capabilities is required to shield or unshield.')
    }

    const route = await this._resolveRoute(options)
    const { fromTokenAmount, toTokenAmount } = await this._resolveAmounts(route, options)

    await this._assertRecipient(options.recipient)

    if (options.minAmountOut !== undefined && BigInt(options.minAmountOut) > toTokenAmount) {
      throw new ValueError('The min. amount out exceeds the amount the route can deliver.')
    }

    const feeConfig = { ...this._config, ...config }
    const estimatedFee = await this._quoteNetworkFee(route)

    this._assertFeeCaps(feeConfig, route, fromTokenAmount, estimatedFee.amount)

    const { sdk, signer, chain } = await this._getZama()
    const wrapped = sdk.createWrappedToken(getAddress(route.pair.confidential))

    if (route.direction === 'shield') {
      let approvalHash

      const result = await runSdkOperation(() => wrapped.shield(fromTokenAmount, {
        onApprovalSubmitted: hash => { approvalHash = hash }
      }))

      /** @type {SwidgeTransaction[]} */
      const transactions = []
      let fee = signer.takeFee(result.txHash)

      if (approvalHash) {
        fee += signer.takeFee(approvalHash)

        transactions.push({ hash: approvalHash, chain: chain.id, type: 'approval' })
      }

      transactions.push({ hash: result.txHash, chain: chain.id, type: 'source' })

      return {
        id: encodeSwidgeId({ chainId: chain.id, operation: 'shield', hash: result.txHash }),
        hash: result.txHash,
        fees: [networkFee(chain.id, fee)],
        transactions,
        fromTokenAmount,
        toTokenAmount,
        toTokenAmountMin: toTokenAmount
      }
    }

    let unwrapHash

    try {
      const result = await wrapped.unshield(fromTokenAmount, {
        onUnwrapSubmitted: hash => { unwrapHash = hash }
      })

      return {
        id: encodeSwidgeId({ chainId: chain.id, operation: 'unshield', hash: unwrapHash }),
        hash: unwrapHash,
        fees: [networkFee(chain.id, signer.takeFee(unwrapHash) + signer.takeFee(result.txHash))],
        transactions: [
          { hash: unwrapHash, chain: chain.id, type: 'source' },
          { hash: result.txHash, chain: chain.id, type: 'destination' }
        ],
        fromTokenAmount,
        toTokenAmount,
        toTokenAmountMin: toTokenAmount
      }
    } catch (error) {
      if (!unwrapHash) {
        throw toWdkError(error)
      }

      // Phase 1 is on-chain; the caller resumes phase 2 through resumeSwidge(id).
      return {
        id: encodeSwidgeId({ chainId: chain.id, operation: 'unshield', hash: unwrapHash }),
        hash: unwrapHash,
        fees: [networkFee(chain.id, signer.takeFee(unwrapHash))],
        transactions: [{ hash: unwrapHash, chain: chain.id, type: 'source' }],
        fromTokenAmount,
        toTokenAmount,
        toTokenAmountMin: toTokenAmount
      }
    }
  }

  /**
   * Returns the status of a shield or unshield from its id, reading the chain only.
   *
   * - Shield: `pending` until the wrap is mined, then `completed` or `failed`.
   * - Unshield: `pending` until the unwrap is mined; `failed` if it reverted; `action-required`
   *   while the unwrap request is not finalized (call {@link resumeSwidge}); `completed` once it is,
   *   with the finalize transaction as `destination` when it can be found in the logs.
   *
   * @param {string} id - The id returned by `swidge`.
   * @param {SwidgeStatusOptions} [options] - Unused: the id carries the chain.
   * @returns {Promise<SwidgeStatusResult>} The status.
   * @throws {ValueError} If the id is invalid or belongs to another chain.
   * @throws {NoSuchElementError} If the chain has no transaction with the id's hash.
   */
  async getSwidgeStatus (id, options) {
    const { chainId, operation, hash } = decodeSwidgeId(id)
    const { chain, provider, sdk } = await this._getZama()

    if (chainId !== chain.id) {
      throw new ValueError(`The swidge id belongs to chain ${chainId} but the protocol is configured for chain ${chain.id}.`)
    }

    const receipt = await provider.getTransactionReceipt(hash)

    if (!receipt) {
      if (!(await provider.getTransaction(hash))) {
        throw new NoSuchElementError(`No transaction found for swidge id ${id}.`)
      }

      return { status: 'pending', transactions: [{ hash, chain: chainId, type: 'source' }] }
    }

    /** @type {SwidgeTransaction[]} */
    const transactions = [{ hash, chain: chainId, type: 'source' }]

    if (receipt.status === 0) {
      return { status: 'failed', transactions }
    }

    if (operation === 'shield') {
      return { status: 'completed', transactions }
    }

    const unwrap = findUnwrapRequested(receipt.logs.map(toRawLog))

    if (!unwrap) {
      return { status: 'failed', transactions }
    }

    const wrapper = getAddress(receipt.logs.find(log => log.topics[0] === Topics.UnwrapRequested).address)
    const requester = await sdk.provider.readContract(unwrapRequesterContract(wrapper, unwrap.unwrapRequestId))

    if (requester !== zeroAddress) {
      return { status: 'action-required', transactions }
    }

    const finalizeHash = await this._findFinalizeHash(wrapper, unwrap.unwrapRequestId, receipt.blockNumber)

    if (finalizeHash) {
      transactions.push({ hash: finalizeHash, chain: chainId, type: 'destination' })
    }

    return { status: 'completed', transactions }
  }

  /**
   * Finalizes an unshield that is in the `action-required` state. Provider-specific.
   *
   * @param {string} id - The id of the unshield returned by `swidge`.
   * @returns {Promise<SwidgeResult>} The completed result, with both transactions.
   * @throws {AccountRequiredError} If the protocol has no writable account.
   * @throws {ValueError} If the id is invalid, belongs to another chain, or is not an unshield.
   * @throws {NoSuchElementError} If the chain has no transaction with the id's hash.
   * @throws {ZamaWdkError} If the finalize fails.
   */
  async resumeSwidge (id) {
    if (!isWritableAccount(this._account)) {
      throw new AccountRequiredError('A wallet account with signing capabilities is required to resume an unshield.')
    }

    const { chainId, operation, hash } = decodeSwidgeId(id)
    const { chain, provider, sdk, signer } = await this._getZama()

    if (chainId !== chain.id) {
      throw new ValueError(`The swidge id belongs to chain ${chainId} but the protocol is configured for chain ${chain.id}.`)
    }

    if (operation !== 'unshield') {
      throw new ValueError('Only unshield operations can be resumed.')
    }

    const receipt = await provider.getTransactionReceipt(hash)

    if (!receipt) {
      throw new NoSuchElementError(`No mined transaction found for swidge id ${id}.`)
    }

    const unwrapLog = receipt.logs.find(log => log.topics[0] === Topics.UnwrapRequested)

    if (receipt.status === 0 || !unwrapLog) {
      throw new ValueError('The unwrap transaction failed; there is nothing to resume.')
    }

    const wrapper = getAddress(unwrapLog.address)
    const unwrap = findUnwrapRequested([toRawLog(unwrapLog)])
    const rate = await this._readRate(wrapper)

    // The unwrap amount is encrypted; the delivered ERC-20 amount is only known once finalized.
    /** @type {SwidgeTransaction[]} */
    const transactions = [{ hash, chain: chainId, type: 'source' }]
    let finalizeHash = null
    let fee = 0n

    try {
      const result = await sdk.createWrappedToken(wrapper).resumeUnshield(hash)

      finalizeHash = result.txHash
      fee = signer.takeFee(result.txHash)
    } catch (error) {
      if (!(error instanceof UnshieldAlreadyFinalizedError)) {
        throw toWdkError(error)
      }

      finalizeHash = await this._findFinalizeHash(wrapper, unwrap.unwrapRequestId, receipt.blockNumber)
    }

    if (finalizeHash) {
      transactions.push({ hash: finalizeHash, chain: chainId, type: 'destination' })
    }

    const amounts = await this._readFinalizedAmounts(wrapper, unwrap.unwrapRequestId, receipt.blockNumber, rate)

    return {
      id,
      hash,
      fees: [networkFee(chainId, fee)],
      transactions,
      fromTokenAmount: amounts.fromTokenAmount,
      toTokenAmount: amounts.toTokenAmount,
      toTokenAmountMin: amounts.toTokenAmount
    }
  }

  /**
   * Returns the configured chain.
   *
   * @returns {Promise<SwidgeSupportedChain[]>} One entry: the chain of the configuration.
   */
  async getSupportedChains () {
    const { chain } = await this._getZama()
    const metadata = CHAIN_METADATA[chain.id] ?? { name: `Chain ${chain.id}`, nativeToken: 'ETH' }

    return [{ id: chain.id, name: metadata.name, type: 'evm', nativeToken: metadata.nativeToken }]
  }

  /**
   * Returns both sides of every configured pair, with symbol and decimals.
   *
   * With `fromToken`, returns only the tokens reachable from it (the other side of its pair).
   * With a `fromChain` or `toChain` other than the configured chain, returns nothing.
   *
   * @param {SwidgeSupportedTokensOptions} [options] - Filters.
   * @returns {Promise<SwidgeSupportedToken[]>} The supported tokens.
   */
  async getSupportedTokens (options = {}) {
    const { chain, pairs } = await this._getZama()

    for (const filter of [options.fromChain, options.toChain]) {
      if (filter !== undefined && Number(filter) !== chain.id) {
        return []
      }
    }

    let selected = pairs
    let side = /** @type {'both' | 'erc20' | 'confidential'} */ ('both')

    if (options.fromToken !== undefined) {
      const asErc20 = findPairByErc20(pairs, options.fromToken)
      const asConfidential = findPairByConfidential(pairs, options.fromToken)

      selected = [asErc20 ?? asConfidential].filter(Boolean)
      side = asErc20 ? 'confidential' : 'erc20'
    }

    const tokens = []

    for (const pair of selected) {
      if (side !== 'confidential') {
        tokens.push(await this._describeToken(chain.id, pair.erc20, pair.symbol, pair.decimals))
      }

      if (side !== 'erc20') {
        tokens.push(await this._describeToken(chain.id, pair.confidential, pair.confidentialSymbol, pair.confidentialDecimals))
      }
    }

    return tokens
  }

  /**
   * Releases the Zama SDK shared by every protocol instance built for this account and
   * configuration (relayer worker pool, permit cache). Call it on shutdown or sign-out; a later call
   * on any instance rebuilds the SDK on demand.
   *
   * @returns {Promise<void>}
   */
  async dispose () {
    await disposeSharedZamaSdk(this._account, this._config)
  }

  /**
   * Resolves the route of a swidge request.
   *
   * @private
   * @param {SwidgeOptions} options - The swidge options.
   * @returns {Promise<Route>} The route.
   * @throws {UnsupportedRouteError} If the route is not supported.
   * @throws {ValueError} If the token addresses are invalid.
   */
  async _resolveRoute ({ fromToken, toToken, toChain }) {
    for (const [name, value] of [['fromToken', fromToken], ['toToken', toToken]]) {
      if (typeof value !== 'string' || !isAddress(value, { strict: false })) {
        throw new ValueError(`Invalid ${name}: expected an EVM address.`)
      }
    }

    const { chain, pairs } = await this._getZama()

    if (toChain !== undefined && Number(toChain) !== chain.id) {
      throw new UnsupportedRouteError(`Cross-chain routes are not supported: this protocol only shields and unshields on chain ${chain.id}.`)
    }

    const shieldPair = findPairByErc20(pairs, fromToken)

    if (shieldPair && isSameAddress(shieldPair.confidential, toToken)) {
      return { direction: 'shield', pair: shieldPair, chainId: chain.id }
    }

    const unshieldPair = findPairByConfidential(pairs, fromToken)

    if (unshieldPair && isSameAddress(unshieldPair.erc20, toToken)) {
      return { direction: 'unshield', pair: unshieldPair, chainId: chain.id }
    }

    throw new UnsupportedRouteError('Unsupported route: only an ERC-20 to its confidential wrapper (shield) or back (unshield) is supported, for the configured pairs.')
  }

  /**
   * Resolves the input and output amounts of a request from the wrapper's rate.
   *
   * The wrapper mints `floor(erc20 / rate)` confidential units on wrap and returns
   * `confidential * rate` ERC-20 units on unwrap.
   *
   * @private
   * @param {Route} route - The route.
   * @param {SwidgeOptions} options - The swidge options.
   * @returns {Promise<{ fromTokenAmount: bigint, toTokenAmount: bigint }>} The amounts.
   * @throws {ValueError} If neither or both amounts are given, or an amount is not positive.
   */
  async _resolveAmounts (route, options) {
    const hasIn = options.fromTokenAmount !== undefined
    const hasOut = options.toTokenAmount !== undefined

    if (hasIn === hasOut) {
      throw new ValueError('Exactly one of fromTokenAmount (exact-in) or toTokenAmount (exact-out) must be set.')
    }

    const rate = await this._readRate(route.pair.confidential)

    if (hasIn) {
      const fromTokenAmount = toPositiveBigInt(options.fromTokenAmount, 'fromTokenAmount')
      const toTokenAmount = route.direction === 'shield' ? fromTokenAmount / rate : fromTokenAmount * rate

      return { fromTokenAmount, toTokenAmount }
    }

    // Exact-out: round the input up to what the wrapper needs, then report the output it will
    // actually deliver for that input (which can exceed the request when the rate is not 1).
    const requested = toPositiveBigInt(options.toTokenAmount, 'toTokenAmount')
    const fromTokenAmount = route.direction === 'shield' ? requested * rate : ceilDiv(requested, rate)
    const toTokenAmount = route.direction === 'shield' ? fromTokenAmount / rate : fromTokenAmount * rate

    return { fromTokenAmount, toTokenAmount }
  }

  /**
   * Reads the wrap/unwrap conversion rate of a wrapper.
   *
   * @private
   * @param {string} wrapper - The confidential wrapper address.
   * @returns {Promise<bigint>} The rate (1 for USDT and cUSDT).
   */
  async _readRate (wrapper) {
    const { sdk } = await this._getZama()

    const rate = await runSdkOperation(() => sdk.provider.readContract(rateContract(getAddress(wrapper))))

    return BigInt(rate) > 0n ? BigInt(rate) : 1n
  }

  /**
   * Throws if a recipient other than the account's own address is requested. Shielding straight
   * to a third party is not supported in this release.
   *
   * @private
   * @param {string | undefined} recipient - The requested recipient.
   * @throws {ValueError} If the recipient differs from the account's address.
   */
  async _assertRecipient (recipient) {
    if (recipient === undefined || !this._account || typeof this._account.getAddress !== 'function') {
      return
    }

    if (!isSameAddress(recipient, await this._account.getAddress())) {
      throw new ValueError('Shielding or unshielding to a different recipient is not supported: the recipient must be the account itself.')
    }
  }

  /**
   * Estimates the network fee of a route: the gas units of its transactions times the fee rate.
   *
   * @private
   * @param {Route} route - The route.
   * @returns {Promise<SwidgeFee>} The network fee.
   */
  async _quoteNetworkFee (route) {
    const { chain, provider, gasEstimates } = await this._getZama()
    const { maxFeePerGas, gasPrice } = await provider.getFeeData()
    const feeRate = BigInt(maxFeePerGas ?? gasPrice ?? 0n)

    const gas = route.direction === 'shield'
      ? gasEstimates.approve + gasEstimates.wrap
      : gasEstimates.unwrap + gasEstimates.finalizeUnwrap

    return networkFee(chain.id, gas * feeRate, route.direction === 'shield'
      ? 'Estimated gas of the approve and wrap transactions.'
      : 'Estimated gas of the unwrap and finalize transactions.')
  }

  /**
   * Checks the fee caps of a request.
   *
   * There is no protocol fee, so `maxProtocolFeeBps` always passes. `maxNetworkFeeBps` compares the
   * estimated network fee, valued in the source token through `nativeTokenPrice`, against the input.
   *
   * @private
   * @param {ZamaShieldProtocolConfig} config - The effective configuration.
   * @param {Route} route - The route.
   * @param {bigint} fromTokenAmount - The input amount.
   * @param {bigint} networkFeeWei - The estimated network fee, in wei.
   * @throws {FeePriceRequiredError} If the cap is set without a price.
   * @throws {MaximumFeeExceededError} If the fee exceeds the cap.
   */
  _assertFeeCaps (config, route, fromTokenAmount, networkFeeWei) {
    if (config.maxNetworkFeeBps === undefined) {
      return
    }

    if (config.nativeTokenPrice === undefined) {
      throw new FeePriceRequiredError()
    }

    const decimals = BigInt(route.direction === 'shield' ? route.pair.decimals ?? 6 : route.pair.confidentialDecimals ?? 6)
    const scaledPrice = BigInt(Math.round(config.nativeTokenPrice * Number(10n ** PRICE_PRECISION)))
    const feeInToken = networkFeeWei * scaledPrice * 10n ** decimals / (10n ** 18n * 10n ** PRICE_PRECISION)
    const maxFee = fromTokenAmount * BigInt(config.maxNetworkFeeBps) / 10_000n

    if (feeInToken > maxFee) {
      throw new MaximumFeeExceededError('Exceeded maximum network fee for swidge operation.')
    }
  }

  /**
   * Looks up the finalize transaction of an unwrap request in the wrapper's logs.
   *
   * @private
   * @param {string} wrapper - The wrapper address.
   * @param {string} unwrapRequestId - The unwrap request id.
   * @param {number} fromBlock - The block of the unwrap transaction.
   * @returns {Promise<string | null>} The finalize transaction hash, or null if it cannot be found.
   */
  async _findFinalizeHash (wrapper, unwrapRequestId, fromBlock) {
    const { provider } = await this._getZama()

    try {
      const logs = await provider.getLogs({ address: wrapper, topics: [Topics.UnwrapFinalized, null, unwrapRequestId], fromBlock, toBlock: 'latest' })

      return logs[0]?.transactionHash ?? null
    } catch {
      return null
    }
  }

  /**
   * Reads the amounts of a finalized unwrap from the `UnwrapFinalized` event.
   *
   * @private
   * @param {string} wrapper - The wrapper address.
   * @param {string} unwrapRequestId - The unwrap request id.
   * @param {number} fromBlock - The block of the unwrap transaction.
   * @param {bigint} rate - The wrapper's rate.
   * @returns {Promise<{ fromTokenAmount: bigint, toTokenAmount: bigint }>} The amounts, or zeros if the event cannot be read.
   */
  async _readFinalizedAmounts (wrapper, unwrapRequestId, fromBlock, rate) {
    const { provider } = await this._getZama()

    try {
      const [log] = await provider.getLogs({ address: wrapper, topics: [Topics.UnwrapFinalized, null, unwrapRequestId], fromBlock, toBlock: 'latest' })

      if (!log) {
        return { fromTokenAmount: 0n, toTokenAmount: 0n }
      }

      // UnwrapFinalized(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 encryptedAmount, uint64 cleartextAmount)
      const cleartextAmount = BigInt('0x' + log.data.slice(2 + 64, 2 + 128))

      return { fromTokenAmount: cleartextAmount, toTokenAmount: cleartextAmount * rate }
    } catch {
      return { fromTokenAmount: 0n, toTokenAmount: 0n }
    }
  }

  /**
   * Describes a token for `getSupportedTokens`, reading symbol and decimals from the chain when the
   * pair does not provide them.
   *
   * @private
   * @param {number} chainId - The chain id.
   * @param {string} address - The token address.
   * @param {string | undefined} symbol - The known symbol, if any.
   * @param {number | undefined} decimals - The known decimals, if any.
   * @returns {Promise<SwidgeSupportedToken>} The token description.
   */
  async _describeToken (chainId, address, symbol, decimals) {
    const { sdk } = await this._getZama()
    const token = getAddress(address)

    return {
      token,
      chain: chainId,
      address: token,
      symbol: symbol ?? await sdk.provider.readContract(symbolContract(token)),
      decimals: decimals ?? Number(await sdk.provider.readContract(decimalsContract(token)))
    }
  }
}

/**
 * Builds a network fee entry.
 *
 * @param {number} chainId - The chain id.
 * @param {bigint} amount - The fee, in wei.
 * @param {string} [description] - A description.
 * @returns {SwidgeFee} The fee.
 */
function networkFee (chainId, amount, description = 'Gas of the transactions sent by the account.') {
  return { type: 'network', amount, token: NATIVE_TOKEN, chain: chainId, included: false, description }
}

/**
 * Converts an ethers log to the SDK's raw log shape.
 *
 * @param {{ address: string, topics: readonly string[], data: string }} log - The ethers log.
 * @returns {import('@zama-fhe/sdk').RawLog} The raw log.
 */
function toRawLog (log) {
  return {
    address: /** @type {`0x${string}`} */ (log.address),
    topics: /** @type {`0x${string}`[]} */ ([...log.topics]),
    data: /** @type {`0x${string}`} */ (log.data)
  }
}

/**
 * @param {unknown} value - The value to convert.
 * @param {string} name - The argument name, for the error message.
 * @returns {bigint} The amount.
 * @throws {ValueError} If the value is not a positive integer.
 */
function toPositiveBigInt (value, name) {
  let amount

  try {
    amount = BigInt(/** @type {any} */ (value))
  } catch {
    throw new ValueError(`Invalid ${name}: expected a positive integer in base units.`)
  }

  if (amount <= 0n) {
    throw new ValueError(`Invalid ${name}: expected a positive integer in base units.`)
  }

  return amount
}

/**
 * @param {bigint} a - The dividend.
 * @param {bigint} b - The divisor.
 * @returns {bigint} The quotient, rounded up.
 */
function ceilDiv (a, b) {
  return (a + b - 1n) / b
}

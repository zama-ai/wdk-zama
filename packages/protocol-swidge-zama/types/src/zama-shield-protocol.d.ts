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
    constructor(account?: undefined, config?: ZamaShieldProtocolConfig);
    /**
     * Creates a new read-only Zama shield protocol. Quotes work; execution does not.
     *
     * @overload
     * @param {IWalletAccountReadOnly} account - The read-only wallet account.
     * @param {ZamaShieldProtocolConfig} [config] - The protocol configuration.
     */
    constructor(account: IWalletAccountReadOnly, config?: ZamaShieldProtocolConfig);
    /**
     * Creates a new Zama shield protocol.
     *
     * @overload
     * @param {IWalletAccount} account - The wallet account (a `WalletAccountEvm` or a subclass).
     * @param {ZamaShieldProtocolConfig} [config] - The protocol configuration.
     */
    constructor(account: IWalletAccount, config?: ZamaShieldProtocolConfig);
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
    protected _getZama(): Promise<ZamaContext>;
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
    resumeSwidge(id: string): Promise<SwidgeResult>;
    /**
     * Releases the Zama SDK shared by every protocol instance built for this account and
     * configuration (relayer worker pool, permit cache). Call it on shutdown or sign-out; a later call
     * on any instance rebuilds the SDK on demand.
     *
     * @returns {Promise<void>}
     */
    dispose(): Promise<void>;
    /**
     * Resolves the route of a swidge request.
     *
     * @private
     * @param {SwidgeOptions} options - The swidge options.
     * @returns {Promise<Route>} The route.
     * @throws {UnsupportedRouteError} If the route is not supported.
     * @throws {ValueError} If the token addresses are invalid.
     */
    private _resolveRoute;
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
    private _resolveAmounts;
    /**
     * Reads the wrap/unwrap conversion rate of a wrapper.
     *
     * @private
     * @param {string} wrapper - The confidential wrapper address.
     * @returns {Promise<bigint>} The rate (1 for USDT and cUSDT).
     */
    private _readRate;
    /**
     * Throws if a recipient other than the account's own address is requested. Shielding straight
     * to a third party is not supported in this release.
     *
     * @private
     * @param {string | undefined} recipient - The requested recipient.
     * @throws {ValueError} If the recipient differs from the account's address.
     */
    private _assertRecipient;
    /**
     * Estimates the network fee of a route: the gas units of its transactions times the fee rate.
     *
     * @private
     * @param {Route} route - The route.
     * @returns {Promise<SwidgeFee>} The network fee.
     */
    private _quoteNetworkFee;
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
    private _assertFeeCaps;
    /**
     * Looks up the finalize transaction of an unwrap request in the wrapper's logs.
     *
     * @private
     * @param {string} wrapper - The wrapper address.
     * @param {string} unwrapRequestId - The unwrap request id.
     * @param {number} fromBlock - The block of the unwrap transaction.
     * @returns {Promise<string | null>} The finalize transaction hash, or null if it cannot be found.
     */
    private _findFinalizeHash;
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
    private _readFinalizedAmounts;
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
    private _describeToken;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type SwidgeOptions = import("@tetherto/wdk-wallet/protocols").SwidgeOptions;
export type SwidgeQuote = import("@tetherto/wdk-wallet/protocols").SwidgeQuote;
export type SwidgeResult = import("@tetherto/wdk-wallet/protocols").SwidgeResult;
export type SwidgeFee = import("@tetherto/wdk-wallet/protocols").SwidgeFee;
export type SwidgeTransaction = import("@tetherto/wdk-wallet/protocols").SwidgeTransaction;
export type SwidgeProtocolConfig = import("@tetherto/wdk-wallet/protocols").SwidgeProtocolConfig;
export type SwidgeStatusOptions = import("@tetherto/wdk-wallet/protocols").SwidgeStatusOptions;
export type SwidgeStatusResult = import("@tetherto/wdk-wallet/protocols").SwidgeStatusResult;
export type SwidgeSupportedChain = import("@tetherto/wdk-wallet/protocols").SwidgeSupportedChain;
export type SwidgeSupportedToken = import("@tetherto/wdk-wallet/protocols").SwidgeSupportedToken;
export type SwidgeSupportedTokensOptions = import("@tetherto/wdk-wallet/protocols").SwidgeSupportedTokensOptions;
export type ZamaModuleConfig = import("@zama-fhe/wdk-wallet-evm-zama/adapter").ZamaModuleConfig;
export type ZamaContext = import("@zama-fhe/wdk-wallet-evm-zama/adapter").ZamaContext;
export type TokenPair = import("@zama-fhe/wdk-wallet-evm-zama").TokenPair;
/**
 * The direction of a route: `shield` moves an ERC-20 into its confidential wrapper, `unshield`
 * moves confidential tokens back to the ERC-20.
 */
export type ShieldDirection = "shield" | "unshield";
/**
 * The configuration of the Zama shield protocol: the Zama module configuration, the WDK swidge
 * fee caps, and the price needed to value network fees against those caps.
 */
export type ZamaShieldProtocolConfig = ZamaModuleConfig & SwidgeProtocolConfig & {
    nativeTokenPrice?: number;
};
/**
 * A resolved route: its direction, pair and chain.
 */
export type Route = {
    /**
     * - The direction.
     */
    direction: ShieldDirection;
    /**
     * - The token pair.
     */
    pair: TokenPair;
    /**
     * - The chain id.
     */
    chainId: number;
};
import { SwidgeProtocol } from '@tetherto/wdk-wallet/protocols';

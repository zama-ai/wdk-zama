/**
 * Resolves the relayer option to a relayer transport configuration.
 *
 * The transports are imported lazily so a browser bundle never pulls in the Node transport.
 *
 * @param {ZamaModuleConfig['relayer']} relayer - The relayer option.
 * @returns {Promise<RelayerConfig>} The relayer configuration.
 * @throws {ZamaWdkError} If the option is invalid.
 */
export function resolveRelayer(relayer: ZamaModuleConfig["relayer"]): Promise<RelayerConfig>;
/**
 * Whether the account can sign and send transactions (as opposed to a read-only account).
 *
 * @param {unknown} account - The account to inspect.
 * @returns {account is WdkSignerAccount} True if the account is writable.
 */
export function isWritableAccount(account: unknown): account is WdkSignerAccount;
/**
 * Builds a Zama SDK for a WDK account.
 *
 * The signer is the account itself (through its public `signTypedData` and `sendTransaction`),
 * the provider is built from the same RPC configuration as the account's, and the chain comes from
 * the configuration or, when omitted, from the RPC's chain id.
 *
 * @param {unknown} account - A WDK EVM account (writable or read-only), or undefined for a read-only SDK.
 * @param {ZamaModuleConfig} [config] - The module configuration.
 * @returns {Promise<ZamaContext>} The Zama context.
 * @throws {ZamaWdkError} If the configuration is invalid, no RPC is available, or the RPC's chain does not match the configured chain.
 * @throws {UnsupportedAccountError} If the account is an ERC-4337 smart account.
 */
export function createZamaSdk(account: unknown, config?: ZamaModuleConfig): Promise<ZamaContext>;
/**
 * Returns the Zama context for an account and configuration, creating it on first use and
 * sharing it afterwards. A failed creation is not cached, so the next call retries.
 *
 * @param {unknown} account - A WDK EVM account, or undefined for a read-only context.
 * @param {ZamaModuleConfig} [config] - The module configuration. Must be the same object to share.
 * @returns {Promise<ZamaContext>} The Zama context.
 */
export function getSharedZamaSdk(account: unknown, config?: ZamaModuleConfig): Promise<ZamaContext>;
/**
 * Disposes and forgets the shared context of an account and configuration, if any.
 *
 * @param {unknown} account - The WDK EVM account.
 * @param {ZamaModuleConfig} [config] - The module configuration.
 * @returns {Promise<void>}
 */
export function disposeSharedZamaSdk(account: unknown, config?: ZamaModuleConfig): Promise<void>;
/** @typedef {import('@zama-fhe/sdk/chains').FheChain} FheChain */
/** @typedef {import('@zama-fhe/sdk/chains').FheChainAuth} FheChainAuth */
/** @typedef {import('@zama-fhe/sdk').GenericStorage} GenericStorage */
/** @typedef {import('@zama-fhe/sdk').GenericLogger} GenericLogger */
/** @typedef {import('@zama-fhe/sdk').RelayerConfig} RelayerConfig */
/** @typedef {import('@zama-fhe/sdk').ZamaSDKEventListener} ZamaSDKEventListener */
/** @typedef {import('@zama-fhe/sdk').FhevmRuntimeConfig} FhevmRuntimeConfig */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmWalletConfig} EvmWalletConfig */
/** @typedef {import('../tokens.js').TokenPair} TokenPair */
/** @typedef {import('./wdk-signer.js').WdkSignerAccount} WdkSignerAccount */
/**
 * Approximate gas units of each confidential operation, used for quotes. The real cost depends on
 * the FHE operations the wrapper performs; measure on mainnet and override if needed.
 *
 * @typedef {Object} GasEstimates
 * @property {bigint} approve - ERC-20 approval of the wrapper (two-transaction shield path).
 * @property {bigint} wrap - Wrap after approval (two-transaction shield path).
 * @property {bigint} transferAndCall - ERC-1363 single-transaction shield path.
 * @property {bigint} confidentialTransfer - Confidential transfer with an input proof.
 * @property {bigint} unwrap - Unshield phase 1 (burn request with an input proof).
 * @property {bigint} finalizeUnwrap - Unshield phase 2 (finalize with the KMS decryption proof).
 */
/**
 * @typedef {Object} ZamaModuleConfig
 * @property {'mainnet' | 'sepolia' | FheChain} [chain] - The chain to operate on. Defaults to the preset matching the RPC's chain id.
 * @property {EvmWalletConfig['provider']} [rpc] - The RPC to use for reads and for the relayer client. Defaults to the account's `EvmWalletConfig.provider`, then to the chain preset's public RPC.
 * @property {FheChainAuth} [relayerAuth] - The relayer authentication. The Zama-hosted relayer needs `{ __type: 'ApiKeyHeader', value }`.
 * @property {'node' | 'web' | 'cleartext' | RelayerConfig | (() => RelayerConfig)} [relayer] - The relayer transport. Default: `'node'` in Node.js, `'web'` in browsers.
 * @property {GenericStorage} [storage] - Storage for decrypt permits, the transport key pair and the pending-unshield pointer. Default: in-memory. Production apps must pass a persistent, secure storage.
 * @property {number} [permitTtlDays] - Decrypt permit lifetime in days. Default: the SDK default (30).
 * @property {TokenPair[]} [pairs] - Extra ERC-20 / confidential token pairs, in addition to the chain's defaults.
 * @property {Partial<GasEstimates>} [gasEstimates] - Overrides for the gas units used in quotes.
 * @property {ZamaSDKEventListener} [onEvent] - Zama SDK lifecycle event listener.
 * @property {GenericLogger} [logger] - Zama SDK logger.
 * @property {boolean} [telemetry] - Whether the SDK attaches usage headers to relayer requests. Default: true.
 * @property {FhevmRuntimeConfig} [runtime] - Global `@fhevm/sdk` runtime options (WASM load mode, thread count, logger), applied once per process.
 */
/**
 * Everything a module needs to drive the Zama SDK for one account and chain.
 *
 * @typedef {Object} ZamaContext
 * @property {ZamaSDK} sdk - The Zama SDK instance.
 * @property {FheChain} chain - The resolved chain.
 * @property {import('ethers').Provider} provider - The ethers provider used for reads.
 * @property {WdkZamaSigner | undefined} signer - The WDK-backed signer, or undefined for a read-only context.
 * @property {TokenPair[]} pairs - The token pairs available on the chain (defaults plus configured extras).
 * @property {GasEstimates} gasEstimates - The gas units used for quotes.
 * @property {() => void} dispose - Releases the SDK's resources (relayer worker pool).
 */
/**
 * The default gas units used for quotes.
 *
 * @type {GasEstimates}
 */
export const DEFAULT_GAS_ESTIMATES: GasEstimates;
export type FheChain = import("@zama-fhe/sdk/chains").FheChain;
export type FheChainAuth = import("@zama-fhe/sdk/chains").FheChainAuth;
export type GenericStorage = import("@zama-fhe/sdk").GenericStorage;
export type GenericLogger = import("@zama-fhe/sdk").GenericLogger;
export type RelayerConfig = import("@zama-fhe/sdk").RelayerConfig;
export type ZamaSDKEventListener = import("@zama-fhe/sdk").ZamaSDKEventListener;
export type FhevmRuntimeConfig = import("@zama-fhe/sdk").FhevmRuntimeConfig;
export type EvmWalletConfig = import("@tetherto/wdk-wallet-evm").EvmWalletConfig;
export type TokenPair = import("../tokens.js").TokenPair;
export type WdkSignerAccount = import("./wdk-signer.js").WdkSignerAccount;
/**
 * Approximate gas units of each confidential operation, used for quotes. The real cost depends on
 * the FHE operations the wrapper performs; measure on mainnet and override if needed.
 */
export type GasEstimates = {
    /**
     * - ERC-20 approval of the wrapper (two-transaction shield path).
     */
    approve: bigint;
    /**
     * - Wrap after approval (two-transaction shield path).
     */
    wrap: bigint;
    /**
     * - ERC-1363 single-transaction shield path.
     */
    transferAndCall: bigint;
    /**
     * - Confidential transfer with an input proof.
     */
    confidentialTransfer: bigint;
    /**
     * - Unshield phase 1 (burn request with an input proof).
     */
    unwrap: bigint;
    /**
     * - Unshield phase 2 (finalize with the KMS decryption proof).
     */
    finalizeUnwrap: bigint;
};
export type ZamaModuleConfig = {
    /**
     * - The chain to operate on. Defaults to the preset matching the RPC's chain id.
     */
    chain?: "mainnet" | "sepolia" | FheChain;
    /**
     * - The RPC to use for reads and for the relayer client. Defaults to the account's `EvmWalletConfig.provider`, then to the chain preset's public RPC.
     */
    rpc?: EvmWalletConfig["provider"];
    /**
     * - The relayer authentication. The Zama-hosted relayer needs `{ __type: 'ApiKeyHeader', value }`.
     */
    relayerAuth?: FheChainAuth;
    /**
     * - The relayer transport. Default: `'node'` in Node.js, `'web'` in browsers.
     */
    relayer?: "node" | "web" | "cleartext" | RelayerConfig | (() => RelayerConfig);
    /**
     * - Storage for decrypt permits, the transport key pair and the pending-unshield pointer. Default: in-memory. Production apps must pass a persistent, secure storage.
     */
    storage?: GenericStorage;
    /**
     * - Decrypt permit lifetime in days. Default: the SDK default (30).
     */
    permitTtlDays?: number;
    /**
     * - Extra ERC-20 / confidential token pairs, in addition to the chain's defaults.
     */
    pairs?: TokenPair[];
    /**
     * - Overrides for the gas units used in quotes.
     */
    gasEstimates?: Partial<GasEstimates>;
    /**
     * - Zama SDK lifecycle event listener.
     */
    onEvent?: ZamaSDKEventListener;
    /**
     * - Zama SDK logger.
     */
    logger?: GenericLogger;
    /**
     * - Whether the SDK attaches usage headers to relayer requests. Default: true.
     */
    telemetry?: boolean;
    /**
     * - Global `@fhevm/sdk` runtime options (WASM load mode, thread count, logger), applied once per process.
     */
    runtime?: FhevmRuntimeConfig;
};
/**
 * Everything a module needs to drive the Zama SDK for one account and chain.
 */
export type ZamaContext = {
    /**
     * - The Zama SDK instance.
     */
    sdk: ZamaSDK;
    /**
     * - The resolved chain.
     */
    chain: FheChain;
    /**
     * - The ethers provider used for reads.
     */
    provider: import("ethers").Provider;
    /**
     * - The WDK-backed signer, or undefined for a read-only context.
     */
    signer: WdkZamaSigner | undefined;
    /**
     * - The token pairs available on the chain (defaults plus configured extras).
     */
    pairs: TokenPair[];
    /**
     * - The gas units used for quotes.
     */
    gasEstimates: GasEstimates;
    /**
     * - Releases the SDK's resources (relayer worker pool).
     */
    dispose: () => void;
};
import { ZamaSDK } from '@zama-fhe/sdk';
import WdkZamaSigner from './wdk-signer.js';

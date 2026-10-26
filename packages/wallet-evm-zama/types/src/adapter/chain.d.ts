/**
 * Resolves the chain option of the module configuration to a Zama `FheChain`.
 *
 * @param {'mainnet' | 'sepolia' | FheChain | undefined} chain - The chain name, a full chain object, or undefined.
 * @param {number} [detectedChainId] - The chain id reported by the RPC, used when `chain` is undefined.
 * @returns {FheChain} The resolved chain.
 * @throws {ZamaWdkError} If the chain is unknown or unsupported.
 */
export function resolveChain(chain: "mainnet" | "sepolia" | FheChain | undefined, detectedChainId?: number): FheChain;
/**
 * Picks the single RPC entry to use from a WDK provider configuration.
 *
 * A failover list uses its first entry in this release.
 *
 * @param {RpcConfig} rpc - The WDK provider configuration.
 * @returns {string | Provider | Eip1193Provider | undefined} The entry to use.
 */
export function pickRpc(rpc: RpcConfig): string | Provider | Eip1193Provider | undefined;
/**
 * Builds an ethers provider from a WDK provider configuration, reusing WDK's own logic:
 * a url becomes a `JsonRpcProvider`, an EIP-1193 object a `BrowserProvider`, an ethers provider is
 * reused as-is, and a list becomes a failover provider.
 *
 * @param {RpcConfig} rpc - The WDK provider configuration.
 * @param {number} [chainId] - The expected chain id, to skip network detection.
 * @returns {Provider} The ethers provider.
 * @throws {ZamaWdkError} If no RPC is configured.
 */
export function buildEthersProvider(rpc: RpcConfig, chainId?: number): Provider;
/**
 * Converts a WDK provider configuration into the `network` value the Zama relayer client accepts:
 * an RPC url or an EIP-1193 provider. An ethers provider is wrapped in a minimal EIP-1193 shim
 * that forwards `request` to its `send` method.
 *
 * @param {RpcConfig} rpc - The WDK provider configuration.
 * @returns {string | Eip1193Provider} The relayer network value.
 * @throws {ZamaWdkError} If the value cannot be converted.
 */
export function toRelayerNetwork(rpc: RpcConfig): string | Eip1193Provider;
/** @typedef {import('@zama-fhe/sdk/chains').FheChain} FheChain */
/** @typedef {import('ethers').Provider} Provider */
/** @typedef {import('ethers').Eip1193Provider} Eip1193Provider */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmWalletConfig} EvmWalletConfig */
/** @typedef {EvmWalletConfig['provider']} RpcConfig */
/**
 * The chain presets this module knows by name.
 *
 * @type {Record<string, FheChain>}
 */
export const CHAIN_PRESETS: Record<string, FheChain>;
/**
 * Human-readable metadata of the supported chains, keyed by chain id.
 *
 * @type {Record<number, { name: string, nativeToken: string }>}
 */
export const CHAIN_METADATA: Record<number, {
    name: string;
    nativeToken: string;
}>;
export type FheChain = import("@zama-fhe/sdk/chains").FheChain;
export type Provider = import("ethers").Provider;
export type Eip1193Provider = import("ethers").Eip1193Provider;
export type EvmWalletConfig = import("@tetherto/wdk-wallet-evm").EvmWalletConfig;
export type RpcConfig = EvmWalletConfig["provider"];

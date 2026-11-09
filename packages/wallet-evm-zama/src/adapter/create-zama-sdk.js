// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

import { createConfig, ZamaSDK } from '@zama-fhe/sdk'
import { EthersProvider } from '@zama-fhe/sdk/ethers'

import { ZamaWdkError, assertSupportedAccount } from '../errors.js'
import { getDefaultPairs, normalizePairs } from '../tokens.js'
import { buildEthersProvider, getRpcChainId, resolveChain, toRelayerNetwork } from './chain.js'
import WdkZamaSigner from './wdk-signer.js'

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
export const DEFAULT_GAS_ESTIMATES = Object.freeze({
  approve: 60_000n,
  wrap: 300_000n,
  transferAndCall: 350_000n,
  confidentialTransfer: 400_000n,
  unwrap: 400_000n,
  finalizeUnwrap: 250_000n
})

/**
 * Whether the current runtime is Node.js (or a Node-compatible runtime without a DOM).
 *
 * @returns {boolean} True in Node.js.
 */
function isNodeRuntime () {
  return typeof process !== 'undefined' && typeof process.versions === 'object' && !!process.versions.node && typeof window === 'undefined'
}

/**
 * Resolves the relayer option to a relayer transport configuration.
 *
 * The transports are imported lazily so a browser bundle never pulls in the Node transport.
 *
 * @param {ZamaModuleConfig['relayer']} relayer - The relayer option.
 * @returns {Promise<RelayerConfig>} The relayer configuration.
 * @throws {ZamaWdkError} If the option is invalid.
 */
export async function resolveRelayer (relayer) {
  if (relayer && typeof relayer === 'object' && typeof relayer.type === 'string') {
    return relayer
  }

  if (typeof relayer === 'function') {
    return relayer()
  }

  const kind = relayer ?? (isNodeRuntime() ? 'node' : 'web')

  switch (kind) {
    case 'node': {
      const { node } = await import('@zama-fhe/sdk/node')

      return node()
    }
    case 'web': {
      const { web } = await import('@zama-fhe/sdk/web')

      return web()
    }
    case 'cleartext': {
      const { cleartext } = await import('@zama-fhe/sdk')

      return cleartext()
    }
    default:
      throw new ZamaWdkError(`Unknown relayer "${String(kind)}". Use "node", "web", "cleartext" or a relayer configuration object.`)
  }
}

/**
 * Whether the account can sign and send transactions (as opposed to a read-only account).
 *
 * @param {unknown} account - The account to inspect.
 * @returns {account is WdkSignerAccount} True if the account is writable.
 */
export function isWritableAccount (account) {
  const candidate = /** @type {any} */ (account)

  return !!candidate && typeof candidate.getAddress === 'function' && typeof candidate.sendTransaction === 'function' && typeof candidate.signTypedData === 'function'
}

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
export async function createZamaSdk (account, config = {}) {
  assertSupportedAccount(account)

  const accountRpc = /** @type {any} */ (account)?._config?.provider
  const explicitChain = config.chain === undefined ? undefined : resolveChain(config.chain)
  const rpc = config.rpc ?? accountRpc ?? explicitChain?.network

  if (rpc === undefined) {
    throw new ZamaWdkError('No RPC configured. Set the "rpc" or "chain" option, or connect the wallet account to a provider.')
  }

  const provider = buildEthersProvider(rpc, explicitChain?.id)
  const chainId = await getRpcChainId(provider)
  const chain = explicitChain ?? resolveChain(undefined, chainId)

  if (chainId !== chain.id) {
    throw new ZamaWdkError(`The RPC is connected to chain ${chainId} but the module is configured for chain ${chain.id}.`)
  }

  const signer = isWritableAccount(account) ? await WdkZamaSigner.create(account, chain.id) : undefined

  /** @type {FheChain} */
  const relayerChain = {
    ...chain,
    network: toRelayerNetwork(rpc),
    ...(config.relayerAuth ? { auth: config.relayerAuth } : {})
  }

  const relayer = await resolveRelayer(config.relayer)

  const zamaConfig = createConfig({
    chains: [relayerChain],
    relayers: { [chain.id]: relayer },
    signer,
    provider: new EthersProvider({ provider }),
    ...(config.storage ? { storage: config.storage } : {}),
    ...(config.permitTtlDays !== undefined ? { permitTTL: config.permitTtlDays } : {}),
    ...(config.onEvent ? { onEvent: config.onEvent } : {}),
    ...(config.logger ? { logger: config.logger } : {}),
    ...(config.telemetry !== undefined ? { telemetry: config.telemetry } : {}),
    ...(config.runtime ? { runtime: config.runtime } : {})
  })

  const sdk = new ZamaSDK(zamaConfig)

  return {
    sdk,
    chain,
    provider,
    signer,
    pairs: normalizePairs([...getDefaultPairs(chain.id), ...(config.pairs ?? [])]),
    gasEstimates: { ...DEFAULT_GAS_ESTIMATES, ...(config.gasEstimates ?? {}) },
    dispose: () => sdk.dispose()
  }
}

/**
 * Contexts shared between the callers that pass the same account and configuration objects.
 *
 * WDK rebuilds a protocol instance on every `getSwidgeProtocol(label)` call. Sharing the context
 * keeps one relayer worker pool and one permit cache per account instead of one per call.
 *
 * @type {WeakMap<object, WeakMap<object, Promise<ZamaContext>>>}
 */
const sharedContexts = new WeakMap()

/** Key used in place of an account for read-only contexts. */
const NO_ACCOUNT = Object.freeze({})

/**
 * Returns the Zama context for an account and configuration, creating it on first use and
 * sharing it afterwards. A failed creation is not cached, so the next call retries.
 *
 * @param {unknown} account - A WDK EVM account, or undefined for a read-only context.
 * @param {ZamaModuleConfig} [config] - The module configuration. Must be the same object to share.
 * @returns {Promise<ZamaContext>} The Zama context.
 */
export function getSharedZamaSdk (account, config = {}) {
  const accountKey = account && typeof account === 'object' ? account : NO_ACCOUNT

  let byConfig = sharedContexts.get(accountKey)

  if (!byConfig) {
    byConfig = new WeakMap()

    sharedContexts.set(accountKey, byConfig)
  }

  let context = byConfig.get(config)

  if (!context) {
    const pending = createZamaSdk(account, config)

    context = pending.catch(error => {
      if (byConfig.get(config) === context) {
        byConfig.delete(config)
      }

      throw error
    })

    byConfig.set(config, context)
  }

  return context
}

/**
 * Disposes and forgets the shared context of an account and configuration, if any.
 *
 * @param {unknown} account - The WDK EVM account.
 * @param {ZamaModuleConfig} [config] - The module configuration.
 * @returns {Promise<void>}
 */
export async function disposeSharedZamaSdk (account, config = {}) {
  const accountKey = account && typeof account === 'object' ? account : NO_ACCOUNT
  const byConfig = sharedContexts.get(accountKey)
  const context = byConfig?.get(config)

  if (!context) {
    return
  }

  byConfig.delete(config)

  try {
    (await context).dispose()
  } catch {
    // A context that failed to build has nothing to dispose.
  }
}

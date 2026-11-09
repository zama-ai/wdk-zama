// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

import { WalletAccountReadOnlyEvm } from '@tetherto/wdk-wallet-evm'
import { mainnet, sepolia } from '@zama-fhe/sdk/chains'

import { ZamaWdkError } from '../errors.js'

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
export const CHAIN_PRESETS = Object.freeze({
  mainnet,
  sepolia
})

/**
 * Human-readable metadata of the supported chains, keyed by chain id.
 *
 * @type {Record<number, { name: string, nativeToken: string }>}
 */
export const CHAIN_METADATA = Object.freeze({
  1: Object.freeze({ name: 'Ethereum', nativeToken: 'ETH' }),
  11155111: Object.freeze({ name: 'Sepolia', nativeToken: 'ETH' })
})

/**
 * Resolves the chain option of the module configuration to a Zama `FheChain`.
 *
 * @param {'mainnet' | 'sepolia' | FheChain | undefined} chain - The chain name, a full chain object, or undefined.
 * @param {number} [detectedChainId] - The chain id reported by the RPC, used when `chain` is undefined.
 * @returns {FheChain} The resolved chain.
 * @throws {ZamaWdkError} If the chain is unknown or unsupported.
 */
export function resolveChain (chain, detectedChainId) {
  if (chain === undefined) {
    const preset = Object.values(CHAIN_PRESETS).find(candidate => candidate.id === detectedChainId)

    if (!preset) {
      throw new ZamaWdkError(`No Zama chain preset for chain id ${detectedChainId}. Set the "chain" option explicitly.`)
    }

    return preset
  }

  if (typeof chain === 'string') {
    const preset = CHAIN_PRESETS[chain]

    if (!preset) {
      throw new ZamaWdkError(`Unknown chain "${chain}". Use "mainnet", "sepolia" or a full FheChain object.`)
    }

    return preset
  }

  if (typeof chain === 'object' && typeof chain.id === 'number') {
    return chain
  }

  throw new ZamaWdkError('Invalid "chain" option.')
}

/**
 * Picks the single RPC entry to use from a WDK provider configuration.
 *
 * A failover list uses its first entry in this release.
 *
 * @param {RpcConfig} rpc - The WDK provider configuration.
 * @returns {string | Provider | Eip1193Provider | undefined} The entry to use.
 */
export function pickRpc (rpc) {
  return Array.isArray(rpc) ? rpc[0] : rpc
}

/**
 * Builds an ethers provider from a WDK provider configuration, reusing WDK's own logic:
 * a url becomes a `JsonRpcProvider`, an EIP-1193 object a `BrowserProvider`, an ethers provider is
 * reused as-is, and a list becomes a failover provider.
 *
 * @param {RpcConfig} rpc - The WDK provider configuration.
 * @param {number} [chainId] - The expected chain id. The provider is pinned to it and never asks the RPC.
 * @returns {Provider} The ethers provider.
 * @throws {ZamaWdkError} If no RPC is configured.
 */
export function buildEthersProvider (rpc, chainId) {
  const provider = WalletAccountReadOnlyEvm._buildProvider({ provider: rpc, chainId })

  if (!provider) {
    throw new ZamaWdkError('No RPC configured. Set the "rpc" option or connect the wallet account to a provider.')
  }

  return provider
}

/**
 * Asks the RPC for its chain id. `getNetwork()` cannot: on a pinned provider it returns the pinned id.
 *
 * @param {Provider} provider - The ethers provider.
 * @returns {Promise<number>} The RPC's chain id.
 */
export async function getRpcChainId (provider) {
  const { send } = /** @type {any} */ (provider)

  if (typeof send === 'function') {
    return Number(await send.call(provider, 'eth_chainId', []))
  }

  // Only providers WDK builds are pinned; a caller-built one keeps its own network configuration.
  const { chainId } = await provider.getNetwork()

  return Number(chainId)
}

/**
 * Converts a WDK provider configuration into the `network` value the Zama relayer client accepts:
 * an RPC url or an EIP-1193 provider. An ethers provider is wrapped in a minimal EIP-1193 shim
 * that forwards `request` to its `send` method.
 *
 * @param {RpcConfig} rpc - The WDK provider configuration.
 * @returns {string | Eip1193Provider} The relayer network value.
 * @throws {ZamaWdkError} If the value cannot be converted.
 */
export function toRelayerNetwork (rpc) {
  const entry = pickRpc(rpc)

  if (typeof entry === 'string') {
    return entry
  }

  if (entry && typeof (/** @type {any} */ (entry)).request === 'function') {
    return /** @type {Eip1193Provider} */ (entry)
  }

  if (entry && typeof (/** @type {any} */ (entry)).send === 'function') {
    const provider = /** @type {{ send: (method: string, params: unknown[]) => Promise<unknown> }} */ (entry)

    return {
      request: ({ method, params }) => provider.send(method, Array.isArray(params) ? params : [])
    }
  }

  throw new ZamaWdkError('Unsupported RPC value. Use a url, an EIP-1193 provider or an ethers JSON-RPC provider.')
}

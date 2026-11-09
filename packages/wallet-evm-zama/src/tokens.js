// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

import { getAddress } from 'viem'

/**
 * A plain ERC-20 token and its confidential (ERC-7984) wrapper.
 *
 * @typedef {Object} TokenPair
 * @property {string} erc20 - The address of the plain ERC-20 token.
 * @property {string} confidential - The address of the confidential ERC-7984 wrapper token.
 * @property {string} [symbol] - The ERC-20 token's symbol. Read from the chain if omitted.
 * @property {string} [confidentialSymbol] - The confidential token's symbol. Read from the chain if omitted.
 * @property {number} [decimals] - The ERC-20 token's decimals. Read from the chain if omitted.
 * @property {number} [confidentialDecimals] - The confidential token's decimals. Read from the chain if omitted.
 */

/** Tether USD on Ethereum mainnet. */
export const USDT_MAINNET = '0xdAC17F958D2ee523a2206206994597C13D831ec7'

/** Confidential Tether USD (cUSDT) on Ethereum mainnet. */
export const CUSDT_MAINNET = '0xAe0207C757Aa2B4019Ad96edD0092ddc63EF0c50'

/** USDT mock on Sepolia. */
export const USDT_MOCK_SEPOLIA = '0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0'

/** cUSDTMock, the confidential wrapper of the USDT mock on Sepolia. */
export const CUSDT_MOCK_SEPOLIA = '0x4E7B06D78965594eB5EF5414c357ca21E1554491'

/**
 * The token pairs supported out of the box, by chain id.
 *
 * @type {Readonly<Record<number, readonly TokenPair[]>>}
 */
export const DEFAULT_PAIRS = Object.freeze({
  1: Object.freeze([
    Object.freeze({ erc20: USDT_MAINNET, confidential: CUSDT_MAINNET, symbol: 'USDT', confidentialSymbol: 'cUSDT', decimals: 6, confidentialDecimals: 6 })
  ]),
  11155111: Object.freeze([
    Object.freeze({ erc20: USDT_MOCK_SEPOLIA, confidential: CUSDT_MOCK_SEPOLIA, symbol: 'USDTMock', confidentialSymbol: 'cUSDTMock', decimals: 6, confidentialDecimals: 6 })
  ])
})

/**
 * Returns the default token pairs of a chain.
 *
 * @param {number} chainId - The chain id.
 * @returns {TokenPair[]} The pairs (empty if the chain has no defaults).
 */
export function getDefaultPairs (chainId) {
  return [...(DEFAULT_PAIRS[chainId] ?? [])]
}

/**
 * Normalizes a list of pairs: checksums the addresses and drops duplicates (later entries win).
 *
 * @param {TokenPair[]} pairs - The pairs to normalize.
 * @returns {TokenPair[]} The normalized pairs.
 */
export function normalizePairs (pairs) {
  const byConfidential = new Map()

  for (const pair of pairs) {
    const normalized = { ...pair, erc20: getAddress(pair.erc20), confidential: getAddress(pair.confidential) }

    byConfidential.set(normalized.confidential, normalized)
  }

  return [...byConfidential.values()]
}

/**
 * Whether two addresses are equal, ignoring case.
 *
 * @param {string | undefined} a - The first address.
 * @param {string | undefined} b - The second address.
 * @returns {boolean} True if both are defined and equal.
 */
export function isSameAddress (a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
}

/**
 * Finds the pair whose confidential token matches the given address.
 *
 * @param {TokenPair[]} pairs - The pairs to search.
 * @param {string} confidential - The confidential token address.
 * @returns {TokenPair | undefined} The pair, if any.
 */
export function findPairByConfidential (pairs, confidential) {
  return pairs.find(pair => isSameAddress(pair.confidential, confidential))
}

/**
 * Finds the pair whose ERC-20 token matches the given address.
 *
 * @param {TokenPair[]} pairs - The pairs to search.
 * @param {string} erc20 - The ERC-20 token address.
 * @returns {TokenPair | undefined} The pair, if any.
 */
export function findPairByErc20 (pairs, erc20) {
  return pairs.find(pair => isSameAddress(pair.erc20, erc20))
}

// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

import { ValueError } from '@tetherto/wdk-wallet'

/**
 * The decoded parts of a swidge operation id.
 *
 * @typedef {Object} SwidgeId
 * @property {number} chainId - The chain the operation ran on.
 * @property {'shield' | 'unshield'} operation - The operation.
 * @property {`0x${string}`} hash - The hash of the source transaction (the wrap for a shield, the unwrap for an unshield).
 */

const ID_PATTERN = /^(\d+):(shield|unshield):(0x[0-9a-fA-F]{64})$/

/**
 * Encodes a swidge operation id as `"<chainId>:<shield|unshield>:<sourceTxHash>"`.
 *
 * The id alone recovers the operation's state from the chain, so apps need no extra storage.
 *
 * @param {SwidgeId} parts - The id's parts.
 * @returns {string} The id.
 */
export function encodeSwidgeId ({ chainId, operation, hash }) {
  return `${chainId}:${operation}:${hash.toLowerCase()}`
}

/**
 * Decodes a swidge operation id.
 *
 * @param {string} id - The id returned by `swidge`.
 * @returns {SwidgeId} The id's parts.
 * @throws {ValueError} If the id is not a valid Zama swidge id.
 */
export function decodeSwidgeId (id) {
  const match = typeof id === 'string' ? ID_PATTERN.exec(id) : null

  if (!match) {
    throw new ValueError('Invalid swidge id: expected "<chainId>:<shield|unshield>:<txHash>".')
  }

  return {
    chainId: Number(match[1]),
    operation: /** @type {'shield' | 'unshield'} */ (match[2]),
    hash: /** @type {`0x${string}`} */ (match[3].toLowerCase())
  }
}

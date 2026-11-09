// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

/** @typedef {import('@zama-fhe/sdk').EIP712TypedData} EIP712TypedData */
/** @typedef {import('@tetherto/wdk-wallet-evm').TypedData} TypedData */

/**
 * Converts the EIP-712 payload emitted by the Zama SDK (viem shape, with `primaryType` and an
 * `EIP712Domain` entry in `types`) into the shape `WalletAccountEvm.signTypedData` expects.
 *
 * WDK accounts sign through ethers, which infers the primary type from the type graph and
 * rejects an explicit `EIP712Domain` type. The conversion is lossless for the permit and
 * delegation payloads the SDK emits, which all have a single root type.
 *
 * @param {EIP712TypedData} typedData - The typed data emitted by the Zama SDK.
 * @returns {TypedData} The typed data to pass to a WDK account.
 */
export function toWdkTypedData (typedData) {
  const { domain, types, message } = typedData

  const wdkTypes = {}

  for (const [name, fields] of Object.entries(types)) {
    if (name !== 'EIP712Domain') {
      wdkTypes[name] = fields.map(field => ({ name: field.name, type: field.type }))
    }
  }

  return {
    domain: /** @type {TypedData['domain']} */ ({ ...domain }),
    types: wdkTypes,
    message: /** @type {Record<string, unknown>} */ ({ ...message })
  }
}

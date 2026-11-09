// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

/** @typedef {import('@tetherto/wdk-wallet/protocols').SwapOptions} SwapOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwapResult} SwapResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeStatus} SwidgeStatus */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeProtocolConfig} SwidgeProtocolConfig */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeOptions} SwidgeOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeFee} SwidgeFee */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeTransaction} SwidgeTransaction */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeQuote} SwidgeQuote */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeResult} SwidgeResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeStatusOptions} SwidgeStatusOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeStatusResult} SwidgeStatusResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeSupportedChain} SwidgeSupportedChain */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeSupportedToken} SwidgeSupportedToken */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeSupportedTokensOptions} SwidgeSupportedTokensOptions */

/** @typedef {import('./src/zama-shield-protocol.js').ZamaShieldProtocolConfig} ZamaShieldProtocolConfig */
/** @typedef {import('./src/zama-shield-protocol.js').ShieldDirection} ShieldDirection */
/** @typedef {import('./src/swidge-id.js').SwidgeId} SwidgeId */
/** @typedef {import('@zama-fhe/wdk-wallet-evm-zama/adapter').ZamaModuleConfig} ZamaModuleConfig */

export { default } from './src/zama-shield-protocol.js'

export { encodeSwidgeId, decodeSwidgeId } from './src/swidge-id.js'

export { UnsupportedRouteError, FeePriceRequiredError } from './src/errors.js'

// Re-exported for convenience: thrown by this package's public methods.
export { ZamaWdkError, UnsupportedAccountError } from '@zama-fhe/wdk-wallet-evm-zama/adapter'

export {
  WdkError,
  ValueError,
  NoSuchElementError,
  ProviderRequiredError,
  MaximumFeeExceededError
} from '@tetherto/wdk-wallet'

export { AccountRequiredError, SwidgeError } from '@tetherto/wdk-wallet/protocols'

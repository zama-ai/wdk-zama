// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

/** @typedef {import('./create-zama-sdk.js').ZamaModuleConfig} ZamaModuleConfig */
/** @typedef {import('./create-zama-sdk.js').ZamaContext} ZamaContext */
/** @typedef {import('./create-zama-sdk.js').GasEstimates} GasEstimates */
/** @typedef {import('./wdk-signer.js').WdkSignerAccount} WdkSignerAccount */

export { default as WdkZamaSigner } from './wdk-signer.js'

export {
  createZamaSdk,
  getSharedZamaSdk,
  disposeSharedZamaSdk,
  resolveRelayer,
  isWritableAccount,
  DEFAULT_GAS_ESTIMATES
} from './create-zama-sdk.js'

export { toWdkTypedData } from './typed-data.js'

export {
  CHAIN_PRESETS,
  CHAIN_METADATA,
  resolveChain,
  pickRpc,
  buildEthersProvider,
  toRelayerNetwork
} from './chain.js'

export {
  ZamaWdkError,
  UnsupportedAccountError,
  toWdkError,
  runSdkOperation,
  assertSupportedAccount
} from '../errors.js'

export {
  DEFAULT_PAIRS,
  getDefaultPairs,
  normalizePairs,
  isSameAddress,
  findPairByConfidential,
  findPairByErc20
} from '../tokens.js'

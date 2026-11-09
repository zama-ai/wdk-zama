// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear

'use strict'

/** @typedef {import('./src/adapter/create-zama-sdk.js').ZamaModuleConfig} ZamaModuleConfig */
/** @typedef {import('./src/adapter/create-zama-sdk.js').ZamaContext} ZamaContext */
/** @typedef {import('./src/adapter/create-zama-sdk.js').GasEstimates} GasEstimates */
/** @typedef {import('./src/tokens.js').TokenPair} TokenPair */
/** @typedef {import('./src/wallet-account-evm-zama.js').EvmZamaWalletConfig} EvmZamaWalletConfig */
/** @typedef {import('./src/wallet-account-evm-zama.js').ConfidentialTransferOptions} ConfidentialTransferOptions */
/** @typedef {import('./src/wallet-account-evm-zama.js').ShieldOptions} ShieldOptions */
/** @typedef {import('./src/wallet-account-evm-zama.js').ShieldResult} ShieldResult */
/** @typedef {import('./src/wallet-account-evm-zama.js').UnshieldOptions} UnshieldOptions */
/** @typedef {import('./src/wallet-account-evm-zama.js').UnshieldCallbacks} UnshieldCallbacks */
/** @typedef {import('./src/wallet-account-evm-zama.js').UnshieldResult} UnshieldResult */
/** @typedef {import('./src/wallet-account-evm-zama.js').ResumeUnshieldOptions} ResumeUnshieldOptions */
/** @typedef {import('./src/wallet-account-evm-zama.js').ResumeUnshieldResult} ResumeUnshieldResult */

export { default } from './src/wallet-manager-evm-zama.js'

export { default as WalletAccountEvmZama } from './src/wallet-account-evm-zama.js'

export {
  ZamaWdkError,
  UnsupportedTokenError,
  UnsupportedAccountError,
  PermitRequiredError,
  UnshieldPendingError,
  toWdkError
} from './src/errors.js'

export {
  DEFAULT_PAIRS,
  USDT_MAINNET,
  CUSDT_MAINNET,
  USDT_MOCK_SEPOLIA,
  CUSDT_MOCK_SEPOLIA,
  getDefaultPairs,
  findPairByConfidential,
  findPairByErc20
} from './src/tokens.js'

// Re-exported for convenience: thrown by this package's public methods.
export {
  WdkError,
  ProviderRequiredError,
  MaximumFeeExceededError,
  ValueError
} from '@tetherto/wdk-wallet'

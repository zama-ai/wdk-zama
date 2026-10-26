// Copyright 2026 Zama
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

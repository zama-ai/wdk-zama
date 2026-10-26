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

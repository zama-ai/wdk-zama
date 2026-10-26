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

import { InvalidSignerError } from '@tetherto/wdk-wallet'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

import WalletAccountEvmZama from './wallet-account-evm-zama.js'

/** @typedef {import('@tetherto/wdk-wallet-evm/signers').ISignerEvm} ISignerEvm */
/** @typedef {import('./wallet-account-evm-zama.js').EvmZamaWalletConfig} EvmZamaWalletConfig */

/**
 * A wallet manager for EVM blockchains whose accounts support Zama confidential tokens.
 *
 * Accepts the same seeds and signers as {@link WalletManagerEvm}, including signers registered by
 * name through `addSigner`, and returns {@link WalletAccountEvmZama} accounts.
 */
export default class WalletManagerEvmZama extends WalletManagerEvm {
  /**
   * Creates a new Zama-enabled wallet manager for evm blockchains from a BIP-39 seed.
   *
   * @overload
   * @param {string | Uint8Array} seed - A BIP-39 mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
   * @param {EvmZamaWalletConfig} [config] - The configuration object, with the Zama module configuration under `zama`.
   */

  /**
   * Creates a new Zama-enabled wallet manager for evm blockchains from a default signer.
   *
   * @overload
   * @param {ISignerEvm} signer - The default signer. Must be derivable.
   * @param {EvmZamaWalletConfig} [config] - The configuration object, with the Zama module configuration under `zama`.
   */
  constructor (seedOrSigner, config = {}) {
    super(seedOrSigner, config)

    /**
     * The evm wallet configuration, including the Zama module configuration.
     *
     * @protected
     * @type {EvmZamaWalletConfig}
     */
    this._config = config
  }

  /**
   * Returns the Zama-enabled wallet account at a specific index.
   *
   * @overload
   * @param {number} [index] - The index of the account to get (default: 0).
   * @param {Object} [options] - Account options.
   * @param {string} [options.signerName] - The signer name. Omit to use the default signer.
   * @returns {Promise<WalletAccountEvmZama>} The account.
   */

  /**
   * Returns the Zama-enabled wallet account associated with a registered signer.
   *
   * @overload
   * @param {string} signerName - The signer name registered via `addSigner`.
   * @returns {Promise<WalletAccountEvmZama>} The account.
   */
  async getAccount (indexOrSignerName = 0, options = {}) {
    if (typeof indexOrSignerName === 'string') {
      const key = indexOrSignerName

      if (this._accounts[key]) {
        return /** @type {WalletAccountEvmZama} */ (this._accounts[key])
      }

      const signer = this.getSigner(indexOrSignerName)
      const account = new WalletAccountEvmZama(signer, this._accountConfig())

      this._accounts[key] = account

      return account
    }

    const { signerName } = options

    return await this.getAccountByPath(`0'/0/${indexOrSignerName}`, { signerName })
  }

  /**
   * Returns the Zama-enabled wallet account at a specific derivation path.
   *
   * @param {string} path - The derivation path (e.g. "0'/0/0").
   * @param {Object} [options] - Account options.
   * @param {string} [options.signerName] - The signer name. Omit to use the default signer.
   * @returns {Promise<WalletAccountEvmZama>} The account.
   * @throws {InvalidSignerError} If the signer doesn't support account derivation.
   */
  async getAccountByPath (path, options = {}) {
    const { signerName } = options
    const key = signerName ? `${signerName}:${path}` : path

    if (this._accounts[key]) {
      return /** @type {WalletAccountEvmZama} */ (this._accounts[key])
    }

    const signer = this.getSigner(signerName)

    if (!signer.isDerivable) {
      throw new InvalidSignerError('The signer does not support account derivation.')
    }

    const childSigner = await signer.derive(path)
    const account = new WalletAccountEvmZama(childSigner, { ...this._accountConfig(), shouldWipeSignerOnDisposal: true })

    this._accounts[key] = account

    return account
  }
}

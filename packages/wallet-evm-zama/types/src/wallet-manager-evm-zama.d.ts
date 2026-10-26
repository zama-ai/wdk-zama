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
    constructor(seed: string | Uint8Array, config?: EvmZamaWalletConfig);
    /**
     * Creates a new Zama-enabled wallet manager for evm blockchains from a default signer.
     *
     * @overload
     * @param {ISignerEvm} signer - The default signer. Must be derivable.
     * @param {EvmZamaWalletConfig} [config] - The configuration object, with the Zama module configuration under `zama`.
     */
    constructor(signer: ISignerEvm, config?: EvmZamaWalletConfig);
    /**
     * Returns the Zama-enabled wallet account at a specific index.
     *
     * @overload
     * @param {number} [index] - The index of the account to get (default: 0).
     * @param {Object} [options] - Account options.
     * @param {string} [options.signerName] - The signer name. Omit to use the default signer.
     * @returns {Promise<WalletAccountEvmZama>} The account.
     */
    getAccount(index?: number, options?: {
        signerName?: string;
    }): Promise<WalletAccountEvmZama>;
    /**
     * Returns the Zama-enabled wallet account associated with a registered signer.
     *
     * @overload
     * @param {string} signerName - The signer name registered via `addSigner`.
     * @returns {Promise<WalletAccountEvmZama>} The account.
     */
    getAccount(signerName: string): Promise<WalletAccountEvmZama>;
    /**
     * Returns the Zama-enabled wallet account at a specific derivation path.
     *
     * @param {string} path - The derivation path (e.g. "0'/0/0").
     * @param {Object} [options] - Account options.
     * @param {string} [options.signerName] - The signer name. Omit to use the default signer.
     * @returns {Promise<WalletAccountEvmZama>} The account.
     * @throws {InvalidSignerError} If the signer doesn't support account derivation.
     */
    getAccountByPath(path: string, options?: {
        signerName?: string;
    }): Promise<WalletAccountEvmZama>;
}
export type ISignerEvm = import("@tetherto/wdk-wallet-evm/signers").ISignerEvm;
export type EvmZamaWalletConfig = import("./wallet-account-evm-zama.js").EvmZamaWalletConfig;
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import WalletAccountEvmZama from './wallet-account-evm-zama.js';

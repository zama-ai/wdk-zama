/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmWalletConfig} EvmWalletConfig */
/** @typedef {import('@tetherto/wdk-wallet-evm').SignerOptions} SignerOptions */
/** @typedef {import('@tetherto/wdk-wallet-evm/signers').ISignerEvm} ISignerEvm */
/** @typedef {import('./adapter/create-zama-sdk.js').ZamaModuleConfig} ZamaModuleConfig */
/** @typedef {import('./adapter/create-zama-sdk.js').ZamaContext} ZamaContext */
/**
 * The configuration of a Zama-enabled EVM wallet account: the standard EVM wallet configuration
 * plus the Zama module configuration under `zama`.
 *
 * @typedef {EvmWalletConfig & { zama?: ZamaModuleConfig }} EvmZamaWalletConfig
 */
/**
 * @typedef {Object} ConfidentialTransferOptions
 * @property {string} token - The address of the confidential (ERC-7984) token.
 * @property {string} recipient - The recipient's address.
 * @property {bigint} amount - The amount to transfer, in the token's base units. Encrypted on the client before sending.
 */
/**
 * @typedef {Object} ShieldOptions
 * @property {string} token - The address of the confidential (ERC-7984) wrapper token.
 * @property {bigint} amount - The amount of the underlying ERC-20 to shield, in base units.
 */
/**
 * @typedef {Object} ShieldResult
 * @property {string} hash - The hash of the wrap (or ERC-1363 transfer-and-call) transaction.
 * @property {bigint} fee - The total quoted fee of the shield's transactions, in wei.
 * @property {string} [approvalHash] - The hash of the ERC-20 approval transaction, when the two-transaction path was used.
 */
/**
 * @typedef {Object} UnshieldOptions
 * @property {string} token - The address of the confidential (ERC-7984) wrapper token.
 * @property {bigint} amount - The amount of confidential tokens to unshield, in base units.
 */
/**
 * Progress callbacks of the two-phase unshield.
 *
 * @typedef {Object} UnshieldCallbacks
 * @property {(unwrapHash: string) => void} [onUnwrapSubmitted] - Fired after the unwrap transaction is submitted.
 * @property {() => void} [onFinalizing] - Fired when the finalize phase begins (the KMS is decrypting the amount).
 * @property {(finalizeHash: string) => void} [onFinalizeSubmitted] - Fired after the finalize transaction is submitted.
 */
/**
 * @typedef {Object} UnshieldResult
 * @property {string} unwrapHash - The hash of the unwrap (phase 1) transaction.
 * @property {string} finalizeHash - The hash of the finalize (phase 2) transaction.
 * @property {bigint} fee - The total quoted fee of both transactions, in wei.
 */
/**
 * @typedef {Object} ResumeUnshieldOptions
 * @property {string} token - The address of the confidential (ERC-7984) wrapper token.
 * @property {string} unwrapHash - The hash of the unwrap transaction to finalize.
 */
/**
 * @typedef {Object} ResumeUnshieldResult
 * @property {string | null} finalizeHash - The hash of the finalize transaction, or null if the unshield had already been finalized.
 * @property {bigint} fee - The quoted fee of the finalize transaction, in wei (0n if nothing was sent).
 */
/**
 * An EVM wallet account with Zama confidential token support.
 *
 * Extends the standard {@link WalletAccountEvm} with decrypted confidential balances, confidential
 * transfers, and shield / unshield between an ERC-20 and its confidential (ERC-7984) wrapper.
 *
 * Every `token` argument is the address of the **confidential** token. All amounts are `bigint`
 * base units.
 *
 * Privacy: shield and unshield amounts are public ERC-20 transfers. Confidential balances and
 * confidential-transfer amounts are encrypted. Sender and recipient addresses are always public.
 *
 * Inherited methods keep their public, plaintext behavior: `transfer()` on a confidential token is
 * **not** a confidential transfer, and `getTokenBalance()` on a confidential token throws
 * {@link UnsupportedTokenError} because ERC-7984 has no plaintext `balanceOf`.
 */
export default class WalletAccountEvmZama extends WalletAccountEvm {
    /**
     * Creates a new Zama-enabled evm wallet account from a raw private key.
     *
     * @param {string | Uint8Array} privateKey - The raw private key (hex string with or without 0x, or 32 bytes).
     * @param {EvmZamaWalletConfig} [config] - The configuration object.
     * @returns {WalletAccountEvmZama} The wallet account.
     */
    static fromPrivateKey(privateKey: string | Uint8Array, config?: EvmZamaWalletConfig): WalletAccountEvmZama;
    /**
     * Creates a new Zama-enabled evm wallet account from a BIP-39 seed, deriving the account's key at
     * the given BIP-44 path.
     *
     * @overload
     * @param {string | Uint8Array} seed - A BIP-39 mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
     * @param {string} path - The BIP-44 account path, relative to "m/44'/60'" (e.g. "0'/0/0").
     * @param {EvmZamaWalletConfig} [config] - The configuration object.
     */
    constructor(seed: string | Uint8Array, path: string, config?: EvmZamaWalletConfig);
    /**
     * Creates a new Zama-enabled evm wallet account from a BIP-39 seed at path m/44'/60'/0'/0/0.
     *
     * @overload
     * @param {string | Uint8Array} seed - A BIP-39 mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
     * @param {EvmZamaWalletConfig} [config] - The configuration object.
     */
    constructor(seed: string | Uint8Array, config?: EvmZamaWalletConfig);
    /**
     * Creates a new Zama-enabled evm wallet account using a signer.
     *
     * @overload
     * @param {ISignerEvm} signer - A signer implementing the EVM signer interface.
     * @param {EvmZamaWalletConfig & SignerOptions} [config] - The configuration object.
     */
    constructor(signer: ISignerEvm, config?: EvmZamaWalletConfig & SignerOptions);
    /**
     * The Zama module configuration.
     *
     * @protected
     * @type {ZamaModuleConfig}
     */
    protected _zamaConfig: ZamaModuleConfig;
    /**
     * Returns the Zama context (SDK, chain, pairs) of this account, creating it on first use.
     *
     * @protected
     * @returns {Promise<ZamaContext>} The Zama context.
     */
    protected _getZama(): Promise<ZamaContext>;
    /**
     * Returns the account's decrypted balance of a confidential token.
     *
     * This is a decrypting read: it takes a round trip to the Zama relayer and KMS (seconds), so do
     * not call it on every render. A decrypt permit must cover the token. Without one, the method
     * throws {@link PermitRequiredError} unless `autoGrant` is set, in which case it signs a permit
     * first (silent for seed and private-key accounts, a wallet prompt for interactive signers).
     *
     * @param {string} token - The address of the confidential (ERC-7984) token.
     * @param {{ autoGrant?: boolean }} [options] - Whether to sign a decrypt permit automatically when none exists.
     * @returns {Promise<bigint>} The balance, in the token's base units.
     * @throws {PermitRequiredError} If no permit covers the token and `autoGrant` is not set.
     * @throws {ZamaWdkError} If decryption fails.
     */
    getConfidentialBalance(token: string, options?: {
        autoGrant?: boolean;
    }): Promise<bigint>;
    /**
     * Whether a decrypt permit covers the given confidential tokens. Never prompts.
     *
     * @param {string[]} tokens - The addresses of the confidential tokens.
     * @returns {Promise<boolean>} True if a stored permit covers every token.
     */
    hasDecryptPermit(tokens: string[]): Promise<boolean>;
    /**
     * Signs and stores a decrypt permit for the given confidential tokens (one EIP-712 signature).
     * Idempotent: tokens already covered by a valid permit are skipped.
     *
     * Wallet UIs should call this behind an explicit user action, such as a "show balance" button.
     *
     * @param {string[]} tokens - The addresses of the confidential tokens.
     * @returns {Promise<void>}
     * @throws {ZamaWdkError} If the signature is rejected or the permit cannot be stored.
     */
    grantDecryptPermit(tokens: string[]): Promise<void>;
    /**
     * Revokes the stored decrypt permits of the given confidential tokens, or all of them.
     * Use it on sign-out and reset.
     *
     * @param {string[]} [tokens] - The addresses of the confidential tokens. Omit to revoke every permit.
     * @returns {Promise<void>}
     */
    revokeDecryptPermits(tokens?: string[]): Promise<void>;
    /**
     * Transfers confidential tokens to another address. The amount is encrypted on the client; only
     * the sender, the recipient and the token contract can ever decrypt it.
     *
     * The account's confidential balance is checked before sending (a decrypting read).
     *
     * @param {ConfidentialTransferOptions} options - The transfer's options.
     * @returns {Promise<TransactionResult>} The transaction's hash and quoted fee.
     * @throws {ValueError} If the recipient or amount is invalid.
     * @throws {ZamaWdkError} If the balance is insufficient or the transfer fails.
     * @throws {MaximumFeeExceededError} If the transaction's cost exceeds the `transactionMaxFee` option.
     */
    confidentialTransfer({ token, recipient, amount }: ConfidentialTransferOptions): Promise<TransactionResult>;
    /**
     * Quotes the fee of a confidential transfer.
     *
     * The input proof is generated only in the real call, so the quote is approximate: it is the
     * configured gas estimate for a confidential transfer times the current fee rate.
     *
     * @param {ConfidentialTransferOptions} options - The transfer's options.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The quoted fee, in wei.
     */
    quoteConfidentialTransfer(options: ConfidentialTransferOptions): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Shields ERC-20 tokens into their confidential wrapper. The amount is public (it is an ERC-20
     * transfer into the wrapper); the resulting confidential balance is encrypted.
     *
     * The SDK picks the one-transaction ERC-1363 path when the ERC-20 supports it, and the
     * approve + wrap path otherwise.
     *
     * @param {ShieldOptions} options - The shield's options.
     * @returns {Promise<ShieldResult>} The transaction hashes and total quoted fee.
     * @throws {ValueError} If the amount is invalid.
     * @throws {ZamaWdkError} If the ERC-20 balance is insufficient or the shield fails.
     * @throws {MaximumFeeExceededError} If a transaction's cost exceeds the `transactionMaxFee` option.
     */
    shield({ token, amount }: ShieldOptions): Promise<ShieldResult>;
    /**
     * Unshields confidential tokens back to the ERC-20. Runs both phases: the unwrap transaction,
     * then, once the KMS has decrypted the amount (seconds), the finalize transaction.
     *
     * If phase 2 fails after the unwrap was submitted, the method throws {@link UnshieldPendingError}
     * with the `unwrapHash`; call {@link resumeUnshield} to finish. The SDK also records the pending
     * unwrap in the configured storage, see {@link getPendingUnshield}.
     *
     * @param {UnshieldOptions} options - The unshield's options.
     * @param {UnshieldCallbacks} [callbacks] - Progress callbacks.
     * @returns {Promise<UnshieldResult>} The transaction hashes and total quoted fee.
     * @throws {ValueError} If the amount is invalid.
     * @throws {UnshieldPendingError} If the finalize phase fails after the unwrap was submitted.
     * @throws {ZamaWdkError} If the confidential balance is insufficient or the unwrap fails.
     * @throws {MaximumFeeExceededError} If a transaction's cost exceeds the `transactionMaxFee` option.
     */
    unshield({ token, amount }: UnshieldOptions, callbacks?: UnshieldCallbacks): Promise<UnshieldResult>;
    /**
     * Returns the unwrap transaction hash of an unshield that was started but not finalized, if the
     * configured storage holds one. Nothing resumes automatically: call {@link resumeUnshield}.
     *
     * @param {string} token - The address of the confidential (ERC-7984) wrapper token.
     * @returns {Promise<string | null>} The pending unwrap transaction hash, or null.
     */
    getPendingUnshield(token: string): Promise<string | null>;
    /**
     * Finalizes an unshield whose unwrap transaction was submitted earlier.
     *
     * @param {ResumeUnshieldOptions} options - The token and the unwrap transaction hash.
     * @returns {Promise<ResumeUnshieldResult>} The finalize transaction hash, or null if it had already been finalized.
     * @throws {ZamaWdkError} If the finalize fails.
     * @throws {MaximumFeeExceededError} If the transaction's cost exceeds the `transactionMaxFee` option.
     */
    resumeUnshield({ token, unwrapHash }: ResumeUnshieldOptions): Promise<ResumeUnshieldResult>;
    /**
     * Returns the confidential wrapper of an ERC-20 token, from the on-chain wrappers registry, or
     * from the configured pairs when the registry has no valid entry.
     *
     * @param {string} erc20 - The address of the plain ERC-20 token.
     * @returns {Promise<string | null>} The confidential token's address, or null if none is known.
     */
    getConfidentialTokenFor(erc20: string): Promise<string | null>;
    /**
     * Throws if the token is one of the known confidential tokens of the chain.
     *
     * Known tokens are the chain's defaults plus the configured `pairs`; the check never hits the
     * network, so unknown confidential tokens pass through to the plaintext read.
     *
     * @private
     * @param {string} tokenAddress - The token address.
     * @throws {UnsupportedTokenError} If the token is a known confidential token.
     */
    private _assertPlainToken;
    /**
     * Estimates a fee from a gas amount and the current fee rate.
     *
     * @private
     * @param {bigint} gas - The gas units.
     * @returns {Promise<bigint>} The fee, in wei.
     */
    private _estimateFee;
}
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type EvmWalletConfig = import("@tetherto/wdk-wallet-evm").EvmWalletConfig;
export type SignerOptions = import("@tetherto/wdk-wallet-evm").SignerOptions;
export type ISignerEvm = import("@tetherto/wdk-wallet-evm/signers").ISignerEvm;
export type ZamaModuleConfig = import("./adapter/create-zama-sdk.js").ZamaModuleConfig;
export type ZamaContext = import("./adapter/create-zama-sdk.js").ZamaContext;
/**
 * The configuration of a Zama-enabled EVM wallet account: the standard EVM wallet configuration
 * plus the Zama module configuration under `zama`.
 */
export type EvmZamaWalletConfig = EvmWalletConfig & {
    zama?: ZamaModuleConfig;
};
export type ConfidentialTransferOptions = {
    /**
     * - The address of the confidential (ERC-7984) token.
     */
    token: string;
    /**
     * - The recipient's address.
     */
    recipient: string;
    /**
     * - The amount to transfer, in the token's base units. Encrypted on the client before sending.
     */
    amount: bigint;
};
export type ShieldOptions = {
    /**
     * - The address of the confidential (ERC-7984) wrapper token.
     */
    token: string;
    /**
     * - The amount of the underlying ERC-20 to shield, in base units.
     */
    amount: bigint;
};
export type ShieldResult = {
    /**
     * - The hash of the wrap (or ERC-1363 transfer-and-call) transaction.
     */
    hash: string;
    /**
     * - The total quoted fee of the shield's transactions, in wei.
     */
    fee: bigint;
    /**
     * - The hash of the ERC-20 approval transaction, when the two-transaction path was used.
     */
    approvalHash?: string;
};
export type UnshieldOptions = {
    /**
     * - The address of the confidential (ERC-7984) wrapper token.
     */
    token: string;
    /**
     * - The amount of confidential tokens to unshield, in base units.
     */
    amount: bigint;
};
/**
 * Progress callbacks of the two-phase unshield.
 */
export type UnshieldCallbacks = {
    /**
     * - Fired after the unwrap transaction is submitted.
     */
    onUnwrapSubmitted?: (unwrapHash: string) => void;
    /**
     * - Fired when the finalize phase begins (the KMS is decrypting the amount).
     */
    onFinalizing?: () => void;
    /**
     * - Fired after the finalize transaction is submitted.
     */
    onFinalizeSubmitted?: (finalizeHash: string) => void;
};
export type UnshieldResult = {
    /**
     * - The hash of the unwrap (phase 1) transaction.
     */
    unwrapHash: string;
    /**
     * - The hash of the finalize (phase 2) transaction.
     */
    finalizeHash: string;
    /**
     * - The total quoted fee of both transactions, in wei.
     */
    fee: bigint;
};
export type ResumeUnshieldOptions = {
    /**
     * - The address of the confidential (ERC-7984) wrapper token.
     */
    token: string;
    /**
     * - The hash of the unwrap transaction to finalize.
     */
    unwrapHash: string;
};
export type ResumeUnshieldResult = {
    /**
     * - The hash of the finalize transaction, or null if the unshield had already been finalized.
     */
    finalizeHash: string | null;
    /**
     * - The quoted fee of the finalize transaction, in wei (0n if nothing was sent).
     */
    fee: bigint;
};
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';

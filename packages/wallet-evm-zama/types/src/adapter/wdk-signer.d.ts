/**
 * A Zama SDK `GenericSigner` backed by a WDK EVM wallet account.
 *
 * Signing goes through `account.signTypedData` and every contract write through
 * `account.sendTransaction`, so WDK's `transactionMaxFee` check, registered policies and
 * middleware all apply. The adapter never touches seeds or private keys.
 *
 * @implements {GenericSigner}
 */
export default class WdkZamaSigner implements GenericSigner {
    /**
     * Creates a signer for a WDK account on the given chain.
     *
     * @param {WdkSignerAccount} account - The WDK wallet account.
     * @param {number} chainId - The chain id the account operates on.
     * @returns {Promise<WdkZamaSigner>} The signer.
     */
    static create(account: WdkSignerAccount, chainId: number): Promise<WdkZamaSigner>;
    /**
     * Creates a signer from a WDK account whose address is already known. Prefer {@link WdkZamaSigner.create}.
     *
     * @param {WdkSignerAccount} account - The WDK wallet account.
     * @param {WalletAccount} walletAccount - The account's address and chain id.
     */
    constructor(account: WdkSignerAccount, walletAccount: WalletAccount);
    /** @private */
    private _account;
    /**
     * Observable wallet account state. WDK accounts never change address, so the store emits its
     * snapshot once, synchronously, to every subscriber and never again.
     *
     * @type {WalletAccountStore}
     */
    walletAccount: WalletAccountStore;
    /**
     * The quoted fee of each transaction sent through this signer, by hash.
     *
     * @private
     * @type {Map<string, bigint>}
     */
    private _fees;
    /**
     * Returns the connected wallet account.
     *
     * @param {string} operation - The name of the SDK operation asking for it.
     * @returns {WalletAccount} The wallet account.
     * @throws {WalletNotConnectedError} If the WDK account has been disposed.
     */
    requireWalletAccount(operation: string): WalletAccount;
    /**
     * Signs EIP-712 typed data (decrypt permits and delegations) with the WDK account.
     *
     * @param {EIP712TypedData} typedData - The typed data emitted by the Zama SDK.
     * @returns {Promise<`0x${string}`>} The signature.
     */
    signTypedData(typedData: EIP712TypedData): Promise<`0x${string}`>;
    /**
     * Encodes a contract call and sends it through the WDK account.
     *
     * @param {WriteContractConfig} config - The contract call.
     * @returns {Promise<`0x${string}`>} The transaction hash.
     */
    writeContract(config: WriteContractConfig): Promise<`0x${string}`>;
    /**
     * Returns and forgets the fee WDK quoted for a transaction sent through this signer.
     *
     * @param {string} hash - The transaction hash.
     * @returns {bigint} The quoted fee in wei, or 0n if the hash is unknown.
     */
    takeFee(hash: string): bigint;
    /**
     * Does nothing: the WDK account belongs to the caller and is disposed by them.
     */
    dispose(): void;
    /**
     * @private
     * @param {string} hash - The transaction hash.
     * @param {bigint} fee - The quoted fee.
     */
    private _rememberFee;
}
export type GenericSigner = import("@zama-fhe/sdk").GenericSigner;
export type WalletAccount = import("@zama-fhe/sdk").WalletAccount;
export type WalletAccountStore = import("@zama-fhe/sdk").WalletAccountStore;
export type EIP712TypedData = import("@zama-fhe/sdk").EIP712TypedData;
export type WriteContractConfig = import("@zama-fhe/sdk").WriteContractConfig;
export type WalletAccountEvm = import("@tetherto/wdk-wallet-evm").WalletAccountEvm;
/**
 * The subset of a WDK EVM account the signer relies on. Only public methods are used, so seed,
 * private-key, named and hardware signers all work, and WDK policies and middleware keep applying.
 */
export type WdkSignerAccount = {
    /**
     * - Returns the account's address.
     */
    getAddress: () => Promise<string>;
    /**
     * - Signs EIP-712 typed data.
     */
    signTypedData: (typedData: import("@tetherto/wdk-wallet-evm").TypedData) => Promise<string>;
    /**
     * - Sends a transaction.
     */
    sendTransaction: (tx: import("@tetherto/wdk-wallet-evm").EvmTransaction) => Promise<import("@tetherto/wdk-wallet").TransactionResult>;
    /**
     * - Whether the account has been disposed.
     */
    disposed?: boolean;
};

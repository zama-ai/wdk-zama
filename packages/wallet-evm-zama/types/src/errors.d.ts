/**
 * Maps an error thrown by the Zama SDK to the error a WDK caller expects.
 *
 * - A `WdkError` anywhere in the `cause` chain (e.g. `MaximumFeeExceededError` thrown by the
 *   account's `sendTransaction` and wrapped by the SDK) is returned as-is, so WDK fee caps and
 *   policies keep their native error types.
 * - A `ZamaError` becomes a `ZamaWdkError` with a safe message and the original error as `cause`.
 * - Anything else is returned unchanged.
 *
 * @param {unknown} error - The caught error.
 * @returns {unknown} The error to throw.
 */
export function toWdkError(error: unknown): unknown;
/**
 * Runs an async SDK operation and rethrows its failure through {@link toWdkError}.
 *
 * @template T
 * @param {() => Promise<T>} operation - The operation to run.
 * @returns {Promise<T>} The operation's result.
 */
export function runSdkOperation<T>(operation: () => Promise<T>): Promise<T>;
/**
 * Throws if the account is an ERC-4337 smart account, which this module does not support.
 *
 * @param {unknown} account - The wallet account to inspect.
 * @throws {UnsupportedAccountError} If the account is an ERC-4337 smart account.
 */
export function assertSupportedAccount(account: unknown): void;
/**
 * Base class for every error thrown by the Zama WDK modules. Catch this to handle all
 * Zama-specific failures without catching unrelated errors. Extends WDK's `WdkError`, so
 * `catch (e) { if (e instanceof WdkError) ... }` also catches these.
 *
 * `isUserActionable` distinguishes errors a wallet UI should surface to the end user
 * (insufficient balance, rejected signature) from developer errors (misconfiguration).
 *
 * Messages never contain amounts, plaintexts or encrypted handles. The original SDK error, which
 * may contain them, is available as `cause`.
 */
export class ZamaWdkError extends WdkError {
    /**
     * @param {string} message - The error's message.
     * @param {boolean} [isUserActionable] - Whether an end user can act on it.
     * @param {ErrorOptions} [options] - The error's options, forwarded to `WdkError`.
     */
    constructor(message: string, isUserActionable?: boolean, options?: ErrorOptions);
    /**
     * Whether an end user can act on this error.
     *
     * @type {boolean}
     */
    isUserActionable: boolean;
    /**
     * The machine-readable code of the underlying Zama SDK error, if any.
     *
     * @type {string | undefined}
     */
    code: string | undefined;
}
/**
 * Thrown when a confidential (ERC-7984) token is passed to a method that only works with plain
 * ERC-20 tokens, such as `getTokenBalance`. Use `getConfidentialBalance` instead.
 */
export class UnsupportedTokenError extends ZamaWdkError {
    /**
     * @param {string} token - The offending token address.
     * @param {string} [hint] - What to call instead.
     */
    constructor(token: string, hint?: string);
    /**
     * The offending token address.
     *
     * @type {string}
     */
    token: string;
}
/**
 * Thrown when the wallet account cannot drive the Zama SDK. ERC-4337 smart accounts are
 * rejected: their signer address differs from the account address, so decrypt permits and
 * ACL checks would fail, and `sendTransaction` returns a user-operation hash instead of a
 * transaction hash.
 */
export class UnsupportedAccountError extends ZamaWdkError {
    /**
     * @param {string} [reason] - Why the account is unsupported.
     */
    constructor(reason?: string);
}
/**
 * Thrown by `getConfidentialBalance` when no decrypt permit covers the token and automatic
 * granting was not requested. Call `grantDecryptPermit([token])` behind an explicit user
 * action, or pass `{ autoGrant: true }`.
 */
export class PermitRequiredError extends ZamaWdkError {
    /**
     * @param {string[]} tokens - The token addresses that need a permit.
     */
    constructor(tokens: string[]);
    /**
     * The token addresses that need a permit.
     *
     * @type {string[]}
     */
    tokens: string[];
}
/**
 * Thrown by `unshield` when the unwrap transaction was submitted but the finalize phase failed.
 * The funds are not lost: call `resumeUnshield({ token, unwrapHash })` to finish the operation.
 */
export class UnshieldPendingError extends ZamaWdkError {
    /**
     * @param {string} unwrapHash - The hash of the submitted unwrap transaction.
     * @param {ErrorOptions} [options] - The error's options.
     */
    constructor(unwrapHash: string, options?: ErrorOptions);
    /**
     * The hash of the submitted unwrap transaction.
     *
     * @type {string}
     */
    unwrapHash: string;
}
import { WdkError } from '@tetherto/wdk-wallet';

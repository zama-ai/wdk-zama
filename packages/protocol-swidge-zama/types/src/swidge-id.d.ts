/**
 * Encodes a swidge operation id as `"<chainId>:<shield|unshield>:<sourceTxHash>"`.
 *
 * The id alone recovers the operation's state from the chain, so apps need no extra storage.
 *
 * @param {SwidgeId} parts - The id's parts.
 * @returns {string} The id.
 */
export function encodeSwidgeId({ chainId, operation, hash }: SwidgeId): string;
/**
 * Decodes a swidge operation id.
 *
 * @param {string} id - The id returned by `swidge`.
 * @returns {SwidgeId} The id's parts.
 * @throws {ValueError} If the id is not a valid Zama swidge id.
 */
export function decodeSwidgeId(id: string): SwidgeId;
/**
 * The decoded parts of a swidge operation id.
 */
export type SwidgeId = {
    /**
     * - The chain the operation ran on.
     */
    chainId: number;
    /**
     * - The operation.
     */
    operation: "shield" | "unshield";
    /**
     * - The hash of the source transaction (the wrap for a shield, the unwrap for an unshield).
     */
    hash: `0x${string}`;
};

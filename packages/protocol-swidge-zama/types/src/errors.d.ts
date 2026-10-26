/** The reason carried by {@link UnsupportedRouteError}. */
export const ROUTE_NOT_SUPPORTED: "ROUTE_NOT_SUPPORTED";
/** The reason carried by {@link FeePriceRequiredError}. */
export const FEE_PRICE_REQUIRED: "FEE_PRICE_REQUIRED";
/**
 * Thrown when the requested route is not a shield (ERC-20 to its confidential wrapper) or an
 * unshield (confidential wrapper to its ERC-20) on the configured chain.
 */
export class UnsupportedRouteError extends SwidgeError {
    /**
     * @param {string} message - The error's message.
     */
    constructor(message: string);
}
/**
 * Thrown when `maxNetworkFeeBps` is set but the protocol has no `nativeTokenPrice` to value the
 * network fee in the source token. Set `nativeTokenPrice` in the protocol configuration, or drop
 * the cap.
 */
export class FeePriceRequiredError extends SwidgeError {
    constructor();
}
import { SwidgeError } from '@tetherto/wdk-wallet/protocols';

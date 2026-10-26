# API reference

```javascript
import ZamaShieldProtocol, {
  encodeSwidgeId, decodeSwidgeId,
  UnsupportedRouteError, FeePriceRequiredError,
  ZamaWdkError, UnsupportedAccountError,
  WdkError, ValueError, NoSuchElementError, MaximumFeeExceededError, AccountRequiredError, SwidgeError
} from '@zama-fhe/wdk-protocol-swidge-zama'
```

## `ZamaShieldProtocol extends SwidgeProtocol`

### `new ZamaShieldProtocol(account?, config?)`

- `account`: a WDK EVM account, a read-only account, or `undefined`. Execution needs a writable account; quotes and discovery do not.
- `config`: `ZamaShieldProtocolConfig`.

### `quoteSwidge(options)`

`options`: `{ fromToken, toToken, toChain?, recipient?, minAmountOut? }` plus `fromTokenAmount` (exact-in) or `toTokenAmount` (exact-out).

Returns `Promise<SwidgeQuote>`:

- `fromTokenAmount`, `toTokenAmount`: related by the wrapper's `rate()` (1 for USD₮ and cUSDT). Exact-out rounds the input up and reports the output the wrapper will actually deliver.
- `toTokenAmountMin`: equals `toTokenAmount` (no slippage).
- `fees`: one `network` fee, in wei, `token` is the zero address, `included: false`. No `protocol` fee.
- `estimatedDuration`: 30 s for a shield, 90 s for an unshield.
- `priceImpact`: 0.

Throws `UnsupportedRouteError` for an unknown pair or a different `toChain`; `ValueError` for invalid tokens or amounts, a `minAmountOut` above the output, or a `recipient` other than the account.

### `swidge(options, config?)`

Executes the route. `config` overrides `maxNetworkFeeBps` / `maxProtocolFeeBps` for this call.

Returns `Promise<SwidgeResult>`:

- `id`: `"<chainId>:<shield|unshield>:<sourceTxHash>"`.
- `hash`: the source transaction (wrap or unwrap).
- `transactions`: shield → `[approval?, source]`; unshield → `[source, destination]`, or `[source]` only if the finalize failed.
- `fees`: the fees WDK quoted for the transactions actually sent.
- `fromTokenAmount`, `toTokenAmount`, `toTokenAmountMin`.

Throws `AccountRequiredError` without a writable account, `UnsupportedRouteError`, `ValueError`, `FeePriceRequiredError`, `MaximumFeeExceededError` (fee cap, or WDK's `transactionMaxFee`), `ZamaWdkError` for Zama SDK failures.

### `getSwidgeStatus(id, options?)`

Returns `Promise<{ status, transactions }>`:

| Operation | Condition | `status` |
|---|---|---|
| any | transaction in the mempool | `pending` |
| any | transaction reverted | `failed` |
| shield | wrap mined | `completed` |
| unshield | unwrap mined, request not finalized | `action-required` |
| unshield | request finalized | `completed` (with the finalize transaction as `destination` when it can be found) |

Throws `ValueError` for an invalid id or another chain's id, `NoSuchElementError` when the chain has no such transaction.

### `resumeSwidge(id)`

Provider-specific. Finalizes an `action-required` unshield and returns the completed `SwidgeResult`, with amounts read from the `UnwrapFinalized` event. An already-finalized request resolves as completed with a zero fee.

Throws `AccountRequiredError`, `ValueError` (invalid id, other chain, not an unshield, reverted unwrap), `NoSuchElementError` (unmined), `ZamaWdkError`.

### `dispose()`

Releases the Zama SDK shared by every protocol instance built for this account and configuration (relayer worker pool, permit cache). Call it on shutdown or sign-out. A later call on any instance rebuilds the SDK on demand.

### `getSupportedChains()`

Returns the configured chain: `[{ id, name, type: 'evm', nativeToken: 'ETH' }]`.

### `getSupportedTokens(options?)`

Returns both sides of every configured pair as `{ token, chain, address, symbol, decimals }`. `fromToken` narrows to the other side of its pair; a `fromChain` or `toChain` other than the configured chain returns `[]`.

### Inherited: `swap`, `quoteSwap`, `bridge`, `quoteBridge`

From `SwidgeProtocol`. `swap` returns the swidge `id` as `hash`. `bridge` always fails with `UnsupportedRouteError` wrapped in `BridgeError`, since only same-chain routes exist.

## Ids

`encodeSwidgeId({ chainId, operation, hash })` and `decodeSwidgeId(id)`; the latter throws `ValueError` on malformed input.

## Errors

| Class | Extends | `reason` |
|---|---|---|
| `UnsupportedRouteError` | `SwidgeError` | `ROUTE_NOT_SUPPORTED` |
| `FeePriceRequiredError` | `SwidgeError` | `FEE_PRICE_REQUIRED` |

Zama SDK failures surface as the wallet module's `ZamaWdkError`; WDK errors raised by the account pass through unchanged.

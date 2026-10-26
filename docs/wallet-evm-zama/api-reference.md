# API reference

```javascript
import WalletManagerEvmZama, {
  WalletAccountEvmZama,
  ZamaWdkError, UnsupportedTokenError, UnsupportedAccountError, PermitRequiredError, UnshieldPendingError,
  WdkError, ProviderRequiredError, MaximumFeeExceededError, ValueError,
  DEFAULT_PAIRS, USDT_MAINNET, CUSDT_MAINNET, USDT_MOCK_SEPOLIA, CUSDT_MOCK_SEPOLIA
} from '@zama-fhe/wdk-wallet-evm-zama'

import { createZamaSdk, getSharedZamaSdk, WdkZamaSigner, toWdkTypedData } from '@zama-fhe/wdk-wallet-evm-zama/adapter'
```

All amounts are `bigint` base units. Every `token` argument is the address of the **confidential** (ERC-7984) token. Addresses are accepted in any case and returned checksummed.

## `WalletManagerEvmZama`

Extends `WalletManagerEvm` from `@tetherto/wdk-wallet-evm`.

### `new WalletManagerEvmZama(seedOrSigner, config?)`

- `seedOrSigner`: a BIP-39 seed phrase, raw seed bytes, or a derivable `ISignerEvm`.
- `config`: `EvmWalletConfig & { zama?: ZamaModuleConfig }`.

### `getAccount(index?, { signerName? })`, `getAccount(signerName)`, `getAccountByPath(path, { signerName? })`

Same as `WalletManagerEvm`, returning `WalletAccountEvmZama`.

## `WalletAccountEvmZama`

Extends `WalletAccountEvm`. Constructors match `WalletAccountEvm`'s, with the `zama` key in the configuration.

### `static fromPrivateKey(privateKey, config?)`

Returns a `WalletAccountEvmZama`.

### `getConfidentialBalance(token, options?)`

- `options.autoGrant` (`boolean`, default `false`): sign a decrypt permit automatically when none covers the token.
- Returns `Promise<bigint>`.
- Throws `PermitRequiredError` without a permit when `autoGrant` is not set; `ZamaWdkError` if decryption fails.

A decrypting read takes a round trip to the relayer and the KMS (seconds).

### `hasDecryptPermit(tokens)`

Returns `Promise<boolean>`. Never prompts.

### `grantDecryptPermit(tokens)`

Signs one EIP-712 permit covering `tokens` and stores it. Idempotent for tokens already covered. Throws `ZamaWdkError` (user-actionable) if the signature is rejected.

### `revokeDecryptPermits(tokens?)`

Removes the stored permits of `tokens`, or all of them.

### `confidentialTransfer({ token, recipient, amount })`

Encrypts `amount` on the client and sends it to `recipient`. Checks the confidential balance first.

- Returns `Promise<{ hash: string, fee: bigint }>`. `fee` is the fee WDK quoted for the transaction.
- Throws `ValueError` for an invalid recipient or amount, `ZamaWdkError` for an insufficient balance or a failed transfer, `MaximumFeeExceededError` when the cost exceeds `transactionMaxFee`.

### `quoteConfidentialTransfer({ token })`

Returns `Promise<{ fee: bigint }>`: the `confidentialTransfer` gas estimate times the current fee rate. Approximate.

### `shield({ token, amount })`

Moves `amount` of the underlying ERC-20 into the wrapper. The amount is public.

- Returns `Promise<{ hash: string, fee: bigint, approvalHash?: string }>`. `approvalHash` is present on the approve + wrap path; `fee` sums both transactions.
- Throws `ValueError`, `ZamaWdkError` (insufficient ERC-20 balance), `MaximumFeeExceededError`.

### `unshield({ token, amount }, callbacks?)`

Runs both phases: the unwrap transaction, then the finalize transaction once the KMS has decrypted the amount.

- `callbacks.onUnwrapSubmitted(unwrapHash)`, `callbacks.onFinalizing()`, `callbacks.onFinalizeSubmitted(finalizeHash)`.
- Returns `Promise<{ unwrapHash: string, finalizeHash: string, fee: bigint }>`.
- Throws `UnshieldPendingError` (with `unwrapHash`) if the finalize fails after the unwrap was submitted; `ZamaWdkError` for an insufficient confidential balance; `MaximumFeeExceededError`.

### `getPendingUnshield(token)`

Returns `Promise<string | null>`: the unwrap transaction hash recorded in storage, if the unshield was not finalized.

### `resumeUnshield({ token, unwrapHash })`

Finalizes an earlier unwrap. Returns `Promise<{ finalizeHash: string | null, fee: bigint }>`; `finalizeHash` is `null` when the unshield had already been finalized.

### `getConfidentialTokenFor(erc20)`

Returns `Promise<string | null>`: the confidential wrapper of `erc20` from the on-chain wrappers registry, or from the configured pairs.

### `getTokenBalance(token)`, `getTokenBalances(tokens)`

Throw `UnsupportedTokenError` for a known confidential token. Otherwise unchanged.

### `dispose()`

Disposes the Zama SDK (relayer worker pool) and the account.

## Errors

| Class | Extends | `isUserActionable` | Extra fields |
|---|---|---|---|
| `ZamaWdkError` | `WdkError` | per instance | `code`: the Zama SDK error code, if any |
| `UnsupportedTokenError` | `ZamaWdkError` | no | `token` |
| `UnsupportedAccountError` | `ZamaWdkError` | no | |
| `PermitRequiredError` | `ZamaWdkError` | yes | `tokens` |
| `UnshieldPendingError` | `ZamaWdkError` | yes | `unwrapHash` |

Messages never contain amounts, plaintexts or handles. The Zama SDK error is available as `cause`. WDK errors raised inside the account (`MaximumFeeExceededError`, `PolicyViolationError`, `ProviderRequiredError`) pass through unchanged.

## Adapter

### `createZamaSdk(account, config?)`

Builds a `ZamaContext` for a WDK EVM account (writable or read-only) or for no account:

```typescript
{ sdk: ZamaSDK, chain: FheChain, provider: ethers.Provider, signer?: WdkZamaSigner, pairs: TokenPair[], gasEstimates: GasEstimates, dispose(): void }
```

Throws `ZamaWdkError` when no RPC is available or the RPC's chain does not match `chain`, and `UnsupportedAccountError` for ERC-4337 accounts.

### `getSharedZamaSdk(account, config?)`, `disposeSharedZamaSdk(account, config?)`

Cache one context per `(account, config)` object pair. Pass the same configuration object to share.

### `WdkZamaSigner`

Implements the Zama `GenericSigner`:

- `static create(account, chainId)`
- `walletAccount`: emits its snapshot synchronously on subscribe.
- `signTypedData(typedData)`: converts with `toWdkTypedData` and calls `account.signTypedData`.
- `writeContract(config)`: encodes the call and sends it with `account.sendTransaction`; returns the hash.
- `takeFee(hash)`: returns and forgets the fee WDK quoted for a transaction.

### `toWdkTypedData(typedData)`

Drops `primaryType` and the `EIP712Domain` type so ethers-backed WDK signers accept the payload. Signatures match viem's for the SDK's permit payloads.

## Token constants

`DEFAULT_PAIRS[chainId]`, `USDT_MAINNET`, `CUSDT_MAINNET`, `USDT_MOCK_SEPOLIA`, `CUSDT_MOCK_SEPOLIA`, `getDefaultPairs(chainId)`, `findPairByErc20(pairs, erc20)`, `findPairByConfidential(pairs, confidential)`.

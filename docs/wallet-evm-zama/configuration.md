# Configuration

The account configuration is the standard `EvmWalletConfig` plus a `zama` object.

```javascript
{
  provider: 'https://...',          // EvmWalletConfig
  transactionMaxFee: 10n ** 16n,    // EvmWalletConfig
  zama: {                           // ZamaModuleConfig
    chain: 'mainnet',
    relayerAuth: { __type: 'ApiKeyHeader', value: '...' },
    storage
  }
}
```

## `ZamaModuleConfig`

| Option | Type | Default | Description |
|---|---|---|---|
| `chain` | `'mainnet' \| 'sepolia' \| FheChain` | detected from the RPC | The chain to operate on. Pass a full `FheChain` from `@zama-fhe/sdk/chains` for other chains. |
| `rpc` | `string \| Eip1193Provider \| Provider \| Array` | the account's `provider` | RPC used for reads and by the relayer client. Accepts the same values as `EvmWalletConfig.provider`. A failover list uses its first entry. |
| `relayerAuth` | `{ __type: 'ApiKeyHeader', value }` or `{ __type: 'ApiKeyCookie', value }` | none | Authentication for the Zama relayer. |
| `relayer` | `'node' \| 'web' \| 'cleartext' \| RelayerConfig \| () => RelayerConfig` | `'node'` in Node.js, `'web'` in browsers | The relayer transport. `'cleartext'` is for local development against a Hardhat chain only. |
| `storage` | `GenericStorage` | in-memory | See below. |
| `permitTtlDays` | `number` | 30 | Decrypt permit lifetime, in days. |
| `pairs` | `TokenPair[]` | chain defaults | Extra `{ erc20, confidential, symbol?, confidentialSymbol?, decimals?, confidentialDecimals? }` pairs. |
| `gasEstimates` | `Partial<GasEstimates>` | see below | Gas units used by quotes. |
| `onEvent` | `ZamaSDKEventListener` | none | Zama SDK lifecycle events. |
| `logger` | `GenericLogger` | none | Zama SDK diagnostics. |
| `telemetry` | `boolean` | `true` | Usage headers on relayer requests. |
| `runtime` | `FhevmRuntimeConfig` | SDK default | Global `@fhevm/sdk` runtime options (WASM load mode, thread count), applied once per process. |

## Storage

The Zama SDK persists three things in `storage`:

- the decrypt permit (an EIP-712 signature valid for `permitTtlDays`);
- the transport key pair, including the ML-KEM private key that decrypts balances;
- the pending-unshield pointer used by `getPendingUnshield`.

The default in-memory storage forgets all of them when the process exits. **Production apps must pass a persistent, secure storage.** It must implement `get`, `set` and `delete` and preserve value types (objects are stored as-is). In browsers, `IndexedDBStorage` from `@zama-fhe/sdk` is a reasonable default. Mobile wallets should back it with their secure storage (for example `wdk-secure-storage`). Call `revokeDecryptPermits()` on sign-out.

## Relayer API key

The Zama-hosted mainnet relayer requires an `ApiKeyHeader` key. A key shipped inside a wallet binary is public. Either use a per-app key with rate limits, or route relayer calls through your backend and authenticate that hop with `ApiKeyCookie`. The Sepolia relayer does not require a key at the time of writing.

## Gas estimates

Quotes multiply fixed gas units by the current fee rate, because the real transactions carry input proofs that cannot be simulated beforehand. Defaults:

| Operation | Gas units |
|---|---|
| `approve` | 60,000 |
| `wrap` | 300,000 |
| `transferAndCall` | 350,000 |
| `confidentialTransfer` | 400,000 |
| `unwrap` | 400,000 |
| `finalizeUnwrap` | 250,000 |

Override any of them with `gasEstimates`. Treat quotes as approximate.

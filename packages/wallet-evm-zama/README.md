# @zama-fhe/wdk-wallet-evm-zama

WDK community module adding [Zama](https://docs.zama.org/protocol) confidential tokens to EVM wallet accounts: decrypted confidential balances, confidential transfers, and shield / unshield between an ERC-20 and its confidential (ERC-7984) wrapper. Ships with USDT ↔ cUSDT on Ethereum mainnet and their mocks on Sepolia.

It also exports the **adapter** (`@zama-fhe/wdk-wallet-evm-zama/adapter`) that turns any WDK EVM account into a Zama SDK signer. Only public account methods are used, so seed, private-key, named and hardware signers all work, and WDK fee caps, policies and middleware keep applying.

**Privacy statement.** Shield and unshield amounts are public: they are ERC-20 transfers into and out of the wrapper. Confidential balances and confidential-transfer amounts are encrypted. Sender and recipient addresses are always public.

## Installation

```bash
npm install @zama-fhe/wdk-wallet-evm-zama
```

Requires Node.js 22.13 or newer. In browsers, the Zama relayer runs in a Web Worker with WASM and `SharedArrayBuffer`: serve your app with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.

## Usage

```javascript
import WalletManagerEvmZama, { CUSDT_MAINNET } from '@zama-fhe/wdk-wallet-evm-zama'

const manager = new WalletManagerEvmZama(seedPhrase, {
  provider: 'https://ethereum-rpc.publicnode.com',
  transactionMaxFee: 10n ** 16n,
  zama: {
    chain: 'mainnet',
    relayerAuth: { __type: 'ApiKeyHeader', value: process.env.ZAMA_RELAYER_API_KEY },
    storage // a persistent, secure GenericStorage (see Configuration)
  }
})

const account = await manager.getAccount(0)

// Decrypting reads need a permit: one EIP-712 signature, cached in storage. Ask behind a
// "show balance" action, never on render.
if (!(await account.hasDecryptPermit([CUSDT_MAINNET]))) {
  await account.grantDecryptPermit([CUSDT_MAINNET])
}

const balance = await account.getConfidentialBalance(CUSDT_MAINNET) // bigint, 6 decimals

await account.shield({ token: CUSDT_MAINNET, amount: 100_000_000n })                        // 100 USDT -> cUSDT
await account.confidentialTransfer({ token: CUSDT_MAINNET, recipient, amount: 25_000_000n }) // amount encrypted
await account.unshield({ token: CUSDT_MAINNET, amount: 75_000_000n })                        // cUSDT -> USDT, two txs

manager.dispose()
```

With WDK Core:

```javascript
import WDK from '@tetherto/wdk'
import WalletManagerEvmZama from '@zama-fhe/wdk-wallet-evm-zama'

const wdk = new WDK(seedPhrase).registerWallet('ethereum', WalletManagerEvmZama, { provider, zama })
const account = await wdk.getAccount('ethereum', 0)
```

Private-key accounts: `WalletAccountEvmZama.fromPrivateKey(privateKey, { provider, zama })`.

See [`examples/shield-transfer-unshield.js`](examples/shield-transfer-unshield.js) for a runnable Sepolia walkthrough.

## Configuration

`zama` is a `ZamaModuleConfig`:

| Option | Type | Default | Description |
|---|---|---|---|
| `chain` | `'mainnet' \| 'sepolia' \| FheChain` | detected from the RPC | The chain to operate on. |
| `rpc` | same as `EvmWalletConfig.provider` | the account's provider | RPC for reads and for the relayer client. A failover list uses its first entry. |
| `relayerAuth` | `{ __type: 'ApiKeyHeader', value }` | none | Required by the Zama-hosted mainnet relayer. A key shipped in a client binary is public: use a per-app key with rate limits, or proxy through your backend with `ApiKeyCookie`. |
| `relayer` | `'node' \| 'web' \| 'cleartext' \| RelayerConfig` | `'node'` in Node.js, `'web'` in browsers | Relayer transport. |
| `storage` | `GenericStorage` | in-memory | Holds the decrypt permit, the transport private key and the pending-unshield pointer. **Production apps must pass a persistent, secure storage** (for example `IndexedDBStorage` from `@zama-fhe/sdk` in browsers, or your wallet's secure storage). |
| `permitTtlDays` | `number` | 30 | Decrypt permit lifetime. |
| `pairs` | `TokenPair[]` | chain defaults | Extra ERC-20 / confidential pairs. |
| `gasEstimates` | `Partial<GasEstimates>` | see adapter | Gas units used by quotes. |
| `onEvent`, `logger`, `telemetry` | | | Forwarded to the Zama SDK. |
| `runtime` | `FhevmRuntimeConfig` | SDK default | Global `@fhevm/sdk` runtime options (WASM load mode, thread count), applied once per process. |

## API

All amounts are `bigint` base units. Every `token` argument is the address of the **confidential** token.

### `WalletManagerEvmZama extends WalletManagerEvm`

Same constructor and methods as `WalletManagerEvm`; returns `WalletAccountEvmZama` accounts, including for named signers.

### `WalletAccountEvmZama extends WalletAccountEvm`

| Method | Returns | Notes |
|---|---|---|
| `getConfidentialBalance(token, { autoGrant? })` | `Promise<bigint>` | Decrypting read (seconds). Throws `PermitRequiredError` without a permit unless `autoGrant`. |
| `hasDecryptPermit(tokens)` | `Promise<boolean>` | Never prompts. |
| `grantDecryptPermit(tokens)` | `Promise<void>` | One EIP-712 signature. |
| `revokeDecryptPermits(tokens?)` | `Promise<void>` | For sign-out and reset. |
| `confidentialTransfer({ token, recipient, amount })` | `Promise<{ hash, fee }>` | Amount encrypted on the client. Balance checked first. |
| `quoteConfidentialTransfer(options)` | `Promise<{ fee }>` | Approximate: gas estimate × fee rate. |
| `shield({ token, amount })` | `Promise<{ hash, fee, approvalHash? }>` | Picks the ERC-1363 one-tx path or approve + wrap. |
| `unshield({ token, amount }, callbacks?)` | `Promise<{ unwrapHash, finalizeHash, fee }>` | Both phases. Throws `UnshieldPendingError` with `unwrapHash` if phase 2 fails. |
| `getPendingUnshield(token)` | `Promise<string \| null>` | From storage. |
| `resumeUnshield({ token, unwrapHash })` | `Promise<{ finalizeHash, fee }>` | `finalizeHash` is `null` if already finalized. |
| `getConfidentialTokenFor(erc20)` | `Promise<string \| null>` | On-chain registry, then the static pair table. |
| `getTokenBalance(cUSDT)` | throws `UnsupportedTokenError` | ERC-7984 has no plaintext `balanceOf`. |
| `dispose()` | `void` | Disposes the Zama SDK, then the account. |

Inherited methods keep their public behavior: `transfer()` on cUSDT is **not** a confidential transfer.

### Errors

`ZamaWdkError extends WdkError` (`isUserActionable`, `code`), `UnsupportedTokenError`, `UnsupportedAccountError` (ERC-4337), `PermitRequiredError`, `UnshieldPendingError`. Messages never contain amounts or handles; the original SDK error is the `cause`. WDK errors thrown by the account (`MaximumFeeExceededError`, `PolicyViolationError`) pass through unchanged.

### Adapter (`@zama-fhe/wdk-wallet-evm-zama/adapter`)

`createZamaSdk(account, config)` builds a `ZamaContext` (`sdk`, `chain`, `provider`, `signer`, `pairs`, `gasEstimates`, `dispose`) for any WDK EVM account. `getSharedZamaSdk` caches one context per account and config object. `WdkZamaSigner` implements the Zama `GenericSigner` over `account.signTypedData` and `account.sendTransaction`.

## License

BSD-3-Clause-Clear. See [LICENSE](LICENSE).

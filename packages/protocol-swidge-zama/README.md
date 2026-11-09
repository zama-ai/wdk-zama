# @zama-fhe/wdk-protocol-swidge-zama

WDK swidge module that shields USDT into confidential cUSDT, and unshields it back, on Ethereum through the [Zama](https://docs.zama.org/protocol) protocol. It presents both directions as a same-chain swap, so any WDK wallet with a swap screen gets shielding with no new UI.

It works on a **plain `WalletAccountEvm`**: no Zama-specific account class is needed.

**Privacy statement.** Shield and unshield amounts are public: they are ERC-20 transfers into and out of the wrapper. Only the resulting confidential balance is encrypted. Addresses are always public.

## Installation

```bash
npm install @zama-fhe/wdk-protocol-swidge-zama
```

## Usage

```javascript
import ZamaShieldProtocol from '@zama-fhe/wdk-protocol-swidge-zama'
import { USDT_MAINNET, CUSDT_MAINNET } from '@zama-fhe/wdk-wallet-evm-zama'

account.registerProtocol('confidential', ZamaShieldProtocol, {
  chain: 'mainnet',
  relayerAuth: { __type: 'ApiKeyHeader', value: process.env.ZAMA_RELAYER_API_KEY },
  storage // a persistent, secure GenericStorage
})

const shield = account.getSwidgeProtocol('confidential')

// USDT -> cUSDT
const { id } = await shield.swidge({ fromToken: USDT_MAINNET, toToken: CUSDT_MAINNET, fromTokenAmount: 100_000_000n })

// cUSDT -> USDT: two transactions, the second waits for the Zama KMS decryption (seconds).
const result = await shield.swidge({ fromToken: CUSDT_MAINNET, toToken: USDT_MAINNET, fromTokenAmount: 100_000_000n })

const { status } = await shield.getSwidgeStatus(result.id)
if (status === 'action-required') await shield.resumeSwidge(result.id)
```

Without WDK Core: `new ZamaShieldProtocol(account, config)`. Without an account, quotes and discovery still work.

See [`examples/shield-via-swidge.js`](examples/shield-via-swidge.js) for a runnable Sepolia walkthrough.

## Configuration

`ZamaShieldProtocolConfig` is the [`ZamaModuleConfig`](../wallet-evm-zama/README.md#configuration) of the wallet module plus the WDK swidge fee caps:

| Option | Description |
|---|---|
| `maxNetworkFeeBps` | Cap on the estimated network fee, in basis points of the input. Needs `nativeTokenPrice`. |
| `maxProtocolFeeBps` | Always passes: Zama charges no protocol fee on shield and unshield. |
| `nativeTokenPrice` | Price of one native token (ETH) in units of the source token, used to value the network fee against `maxNetworkFeeBps`. |

Under WDK policies the governed account hides its private configuration, so set `rpc` explicitly in the protocol configuration; otherwise reads fall back to the chain preset's public RPC.

## Routing

A route is valid only when `fromToken` and `toToken` are the two sides of a configured pair on the configured chain:

| Direction | Operation |
|---|---|
| ERC-20 → confidential wrapper | shield |
| confidential wrapper → ERC-20 | unshield |

Anything else, or a `toChain` different from the configured chain, throws `UnsupportedRouteError`. The `recipient` must be the account's own address.

## Behavior

| Method | Shield | Unshield |
|---|---|---|
| `quoteSwidge` | `toTokenAmount = fromTokenAmount / rate` (1 for USDT); no slippage; one `network` fee in wei (`token` is the zero address) from the gas estimates of approve + wrap; ~30 s. | Same amounts; fee covers unwrap + finalize; ~90 s including the KMS decryption. |
| `swidge` | Returns `{ id, hash, transactions: [approval?, source], ... }` once the wrap is submitted. | Waits for both phases; `transactions: [source, destination]`. If the finalize fails, returns the unwrap only. |
| `getSwidgeStatus(id)` | `pending` → `completed` / `failed`. | `pending`; `failed` if reverted; `action-required` until finalized; `completed` with the finalize transaction when found. |
| `resumeSwidge(id)` | | Provider-specific. Finalizes an `action-required` unshield; an already-finalized one resolves as completed. |
| `dispose()` | Releases the Zama SDK shared by the instances built for this account and configuration. Call on shutdown or sign-out. | |
| `getSupportedChains` | The configured chain. | |
| `getSupportedTokens` | Both sides of every pair, with symbol and decimals. | |

**Operation id:** `"<chainId>:<shield|unshield>:<sourceTxHash>"`. The id alone recovers the state from the chain, so apps need no extra storage.

## License

BSD-3-Clause-Clear. See [LICENSE](LICENSE).

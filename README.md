# Zama confidential tokens for Tether WDK

[![Built with WDK](docs/assets/built-with-wdk.png)](https://docs.wdk.tether.io/)

Two community modules for the [Tether Wallet Development Kit](https://docs.wdk.tether.io/) that let any WDK-based wallet hold and move **confidential USD₮ (cUSDT)** on Ethereum through the [Zama protocol](https://docs.zama.org/protocol).

| Package | WDK type | Purpose |
|---|---|---|
| [`@zama-fhe/wdk-wallet-evm-zama`](packages/wallet-evm-zama) | wallet (extends `WalletAccountEvm`) | Decrypted confidential balances, confidential transfers, shield / unshield helpers, decrypt permits. Also exports the adapter that turns any WDK EVM account into a Zama SDK signer. |
| [`@zama-fhe/wdk-protocol-swidge-zama`](packages/protocol-swidge-zama) | swidge protocol | USDT → cUSDT (shield) and cUSDT → USDT (unshield) as a same-chain "swap". Works on a plain `WalletAccountEvm`; any wallet with a swap screen gets shielding with no new UI. |

**Privacy statement.** Shield and unshield amounts are public: they are ERC-20 transfers into and out of the wrapper. Confidential balances and confidential-transfer amounts are encrypted. Sender and recipient addresses are always public.

## Installation

```bash
npm install @zama-fhe/wdk-wallet-evm-zama        # confidential balances, transfers, shield / unshield
npm install @zama-fhe/wdk-protocol-swidge-zama   # shield / unshield through the WDK swidge interface
```

Requires Node.js 22.13 or newer. In browsers, serve your app with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. The Zama relayer needs `SharedArrayBuffer`.

## Usage

### `@zama-fhe/wdk-wallet-evm-zama`

```javascript
import WDK from '@tetherto/wdk'
import WalletManagerEvmZama, { CUSDT_MAINNET } from '@zama-fhe/wdk-wallet-evm-zama'

const wdk = new WDK(seedPhrase).registerWallet('ethereum', WalletManagerEvmZama, {
  provider: 'https://ethereum-rpc.publicnode.com',
  zama: { chain: 'mainnet', relayerAuth, storage } // storage: a persistent, secure GenericStorage
})
const account = await wdk.getAccount('ethereum', 0)

// One EIP-712 signature allows decrypting reads. The permit is cached in storage.
if (!(await account.hasDecryptPermit([CUSDT_MAINNET]))) await account.grantDecryptPermit([CUSDT_MAINNET])

await account.shield({ token: CUSDT_MAINNET, amount: 100_000_000n })                        // 100 USDT -> cUSDT
const balance = await account.getConfidentialBalance(CUSDT_MAINNET)                         // decrypted bigint
await account.confidentialTransfer({ token: CUSDT_MAINNET, recipient, amount: 25_000_000n }) // amount encrypted
await account.unshield({ token: CUSDT_MAINNET, amount: 75_000_000n })                        // cUSDT -> USDT
```

- Usage guide: [`docs/wallet-evm-zama/usage.md`](docs/wallet-evm-zama/usage.md) (also the [package README](packages/wallet-evm-zama/README.md))
- Runnable example: [`packages/wallet-evm-zama/examples/shield-transfer-unshield.js`](packages/wallet-evm-zama/examples/shield-transfer-unshield.js)
- Guides: [balance](docs/wallet-evm-zama/guide-confidential-balance.md), [transfer](docs/wallet-evm-zama/guide-confidential-transfer.md), [shield and unshield](docs/wallet-evm-zama/guide-shield-unshield.md), [recover an interrupted unshield](docs/wallet-evm-zama/guide-recover-unshield.md)

### `@zama-fhe/wdk-protocol-swidge-zama`

```javascript
import ZamaShieldProtocol from '@zama-fhe/wdk-protocol-swidge-zama'
import { USDT_MAINNET, CUSDT_MAINNET } from '@zama-fhe/wdk-wallet-evm-zama'

// Works on a plain WalletAccountEvm.
account.registerProtocol('confidential', ZamaShieldProtocol, { chain: 'mainnet', relayerAuth, storage })
const shield = account.getSwidgeProtocol('confidential')

await shield.swidge({ fromToken: USDT_MAINNET, toToken: CUSDT_MAINNET, fromTokenAmount: 100_000_000n }) // shield
const { id } = await shield.swidge({ fromToken: CUSDT_MAINNET, toToken: USDT_MAINNET, fromTokenAmount: 100_000_000n }) // unshield
if ((await shield.getSwidgeStatus(id)).status === 'action-required') await shield.resumeSwidge(id)
```

- Usage guide: [`docs/protocol-swidge-zama/usage.md`](docs/protocol-swidge-zama/usage.md) (also the [package README](packages/protocol-swidge-zama/README.md))
- Runnable example: [`packages/protocol-swidge-zama/examples/shield-via-swidge.js`](packages/protocol-swidge-zama/examples/shield-via-swidge.js)

The full documentation index is in [`docs/`](docs/README.md). To run the examples from this repository, see [Development](#development).

## Status

`0.1.0-alpha`: Ethereum mainnet and Sepolia, USDT ↔ cUSDT (mocks on Sepolia), Node.js and browser runtimes, seed, private-key and named-signer accounts.

Out of scope for now: ERC-4337 smart accounts (rejected with `UnsupportedAccountError`), Bare / React Native runtimes, cross-chain routes, delegated decryption.

## Layout

```
packages/
  wallet-evm-zama/            @zama-fhe/wdk-wallet-evm-zama (+ ./adapter)
  protocol-swidge-zama/       @zama-fhe/wdk-protocol-swidge-zama
apps/
  wallet-demo/                browser wallet demo (WDK Core + both modules, Sepolia)
docs/                         pages in WDK docs format
```

Dependency direction: `protocol-swidge-zama` → `wallet-evm-zama/adapter` → `@zama-fhe/sdk`, `@tetherto/wdk-wallet`, `@tetherto/wdk-wallet-evm`. Dependency versions are pinned exactly.

## Development

```bash
npm install
npm run lint          # standard, both packages
npm test              # jest unit tests, both packages (no network)
npm run build:types   # regenerate types/ from JSDoc
```

Sepolia integration tests and the examples need an account with Sepolia ETH; the USDT mock is minted on demand. Copy `.env.example` to `.env` and fill in a seed or private key, then:

```bash
npm run example:wallet     # shield, decrypted balance, confidential transfer, unshield
npm run example:swidge     # the same through the swidge interface
npm run test:integration   # the end-to-end flows, including an interrupted unshield
```

To try the modules in a browser wallet, run `npm run demo` and see [`apps/wallet-demo`](apps/wallet-demo).

## License

BSD-3-Clause-Clear. See [LICENSE](LICENSE).

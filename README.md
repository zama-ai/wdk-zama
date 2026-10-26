# Zama confidential tokens for Tether WDK

Two community modules for the [Tether Wallet Development Kit](https://docs.wdk.tether.io/) that let any WDK-based wallet hold and move **confidential USD₮ (cUSDT)** on Ethereum through the [Zama protocol](https://docs.zama.org/protocol).

| Package | WDK type | Purpose |
|---|---|---|
| [`@zama-fhe/wdk-wallet-evm-zama`](packages/wallet-evm-zama) | wallet (extends `WalletAccountEvm`) | Decrypted confidential balances, confidential transfers, shield / unshield helpers, decrypt permits. Also exports the adapter that turns any WDK EVM account into a Zama SDK signer. |
| [`@zama-fhe/wdk-protocol-swidge-zama`](packages/protocol-swidge-zama) | swidge protocol | USDT → cUSDT (shield) and cUSDT → USDT (unshield) as a same-chain "swap". Works on a plain `WalletAccountEvm`; any wallet with a swap screen gets shielding with no new UI. |

**Privacy statement.** Shield and unshield amounts are public: they are ERC-20 transfers into and out of the wrapper. Confidential balances and confidential-transfer amounts are encrypted. Sender and recipient addresses are always public.

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

Apache-2.0

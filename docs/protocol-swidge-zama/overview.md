# Overview

`@zama-fhe/wdk-protocol-swidge-zama` is a community swidge module for the Tether Wallet Development Kit. It shields USD₮ into confidential cUSDT, and unshields it back, on Ethereum through the [Zama](https://docs.zama.org/protocol) protocol. Both directions are exposed as a same-chain swap, so a wallet with a swap screen gets shielding with no new UI.

The module works on a **plain `WalletAccountEvm`**. It does not need the Zama wallet module's account class; it shares only its adapter.

## Privacy statement

Shield and unshield amounts are **public**: they are ERC-20 transfers into and out of the wrapper. The cUSDT balance that results is **encrypted**. Addresses are **always public**. To move cUSDT confidentially between accounts, use the wallet module's `confidentialTransfer`.

## Routes

| From | To | Operation |
|---|---|---|
| USD₮ | cUSDT | shield |
| cUSDT | USD₮ | unshield |

Other pairs can be configured. Cross-chain routes are not supported.

## Unshield is two transactions

An unshield submits an unwrap request, waits for the Zama KMS to decrypt the amount (seconds), then submits a finalize transaction. If the second step fails, `getSwidgeStatus(id)` reports `action-required`, and the provider-specific `resumeSwidge(id)` completes it. The operation id alone carries everything needed, so apps need no extra storage.

## Supported

Ethereum mainnet and Sepolia, Node.js 22.13+ and browsers, any WDK EVM account that can sign typed data and send transactions.

## Not supported in this release

ERC-4337 smart accounts, Bare and React Native runtimes, shielding to a third-party recipient, cross-chain routes.

This is a community module maintained by Zama, not by Tether.

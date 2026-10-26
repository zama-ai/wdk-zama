# Overview

`@zama-fhe/wdk-wallet-evm-zama` is a community wallet module for the Tether Wallet Development Kit. It extends the standard EVM wallet account with [Zama](https://docs.zama.org/protocol) confidential tokens:

- decrypted confidential balances, gated by decrypt permits;
- confidential transfers, with the amount encrypted on the client;
- shield and unshield between an ERC-20 and its confidential (ERC-7984) wrapper.

Out of the box it knows USD₮ and cUSDT on Ethereum mainnet, and their mocks on Sepolia.

## Privacy statement

Shield and unshield amounts are **public**: they are ERC-20 transfers into and out of the wrapper. Confidential balances and confidential-transfer amounts are **encrypted**: only the holder, the counterparty and the token contract can decrypt them. Sender and recipient addresses are **always public**.

The module does not make an account private or anonymous.

## How it works

The module turns the WDK account into a Zama SDK signer through its public `signTypedData` and `sendTransaction` methods. Seeds and private keys are never read. Because every transaction goes through `sendTransaction`, WDK's `transactionMaxFee`, registered policies and middleware all apply to confidential operations too.

Encryption, input proofs and decryption go through the Zama relayer. Decrypting a balance is a round trip to the relayer and the Zama KMS and takes seconds; do not decrypt on render.

## Supported

- Ethereum mainnet (`chain: 'mainnet'`) and Sepolia (`chain: 'sepolia'`).
- Node.js 22.13+ and browsers. Browsers need cross-origin isolation headers for the relayer's Web Worker.
- Accounts from a seed phrase, a private key or a signer registered by name, including hardware signers that implement `signTypedData`.

## Not supported in this release

- ERC-4337 smart accounts (`@tetherto/wdk-wallet-evm-erc-4337`). They are rejected with `UnsupportedAccountError`: the signer address differs from the account address, so permits and ACL checks would fail.
- Bare and React Native runtimes.
- Delegated decryption, operators, cross-chain routes.

This is a community module maintained by Zama, not by Tether.

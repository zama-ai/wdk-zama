# Read a confidential balance

cUSDT balances are encrypted on-chain. Reading one means decrypting it through the Zama relayer and KMS, which needs a **decrypt permit**: an EIP-712 signature by the account that authorizes decryption of its own values for a limited time (30 days by default).

## Ask for the permit behind a user action

Never request the permit on render. Gate it behind an explicit "show balance" action:

```javascript
import { CUSDT_MAINNET } from '@zama-fhe/wdk-wallet-evm-zama'

async function onShowBalanceClicked () {
  if (!(await account.hasDecryptPermit([CUSDT_MAINNET]))) {
    await account.grantDecryptPermit([CUSDT_MAINNET]) // one signature
  }

  const balance = await account.getConfidentialBalance(CUSDT_MAINNET)
  render(balance) // bigint, 6 decimals
}
```

`getConfidentialBalance` throws `PermitRequiredError` when no permit covers the token. For headless accounts (seed or private key) you can let the module sign silently:

```javascript
const balance = await account.getConfidentialBalance(CUSDT_MAINNET, { autoGrant: true })
```

## Latency

A decrypting read takes seconds. Show a loading state, cache the result in your UI, and refresh after the account's own transactions rather than on an interval.

## Storage

The permit and the transport private key live in the `storage` you configured. With the default in-memory storage, users sign again after every restart. Pass a persistent, secure storage in production, and call `revokeDecryptPermits()` on sign-out.

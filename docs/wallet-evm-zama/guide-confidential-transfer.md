# Send confidential USD₮

A confidential transfer moves cUSDT between two addresses with the amount encrypted. The addresses are public; the amount is visible only to the sender, the recipient and the token contract.

```javascript
import { CUSDT_MAINNET } from '@zama-fhe/wdk-wallet-evm-zama'

const { fee } = await account.quoteConfidentialTransfer({ token: CUSDT_MAINNET, recipient, amount: 25_000_000n })

const { hash } = await account.confidentialTransfer({
  token: CUSDT_MAINNET,
  recipient,
  amount: 25_000_000n // 25 cUSDT
})

await account.waitForTransaction(hash)
```

What happens:

1. The module reads and decrypts the sender's confidential balance to check it covers the amount (a permit is needed; `confidentialTransfer` grants one if missing).
2. The amount is encrypted on the client and an input proof is generated through the relayer.
3. The transaction is sent through the account's `sendTransaction`, so `transactionMaxFee`, policies and middleware apply.

## Errors

- `ZamaWdkError` with `isUserActionable: true` for an insufficient balance or a rejected signature. The message carries no amounts.
- `MaximumFeeExceededError` when the transaction cost exceeds `transactionMaxFee`.
- `ValueError` for an invalid recipient or amount.

## Do not use `transfer()`

The inherited `transfer({ token: CUSDT, ... })` calls the plaintext ERC-20 `transfer` selector, which does not exist on ERC-7984. Use `confidentialTransfer`.

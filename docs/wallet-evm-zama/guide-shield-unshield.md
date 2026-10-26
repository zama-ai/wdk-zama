# Shield and unshield USD₮

**Shield** converts USD₮ into cUSDT by depositing it into the wrapper. **Unshield** burns cUSDT and withdraws USD₮. Both amounts are public ERC-20 movements; only the cUSDT balance in between is encrypted.

## Shield

```javascript
import { CUSDT_MAINNET } from '@zama-fhe/wdk-wallet-evm-zama'

const { hash, approvalHash, fee } = await account.shield({ token: CUSDT_MAINNET, amount: 100_000_000n })
await account.waitForTransaction(hash)
```

The Zama SDK picks the path: a single ERC-1363 `transferAndCall` when the ERC-20 supports it, or `approve` followed by `wrap` (then `approvalHash` is set). USD₮ on mainnet requires resetting a non-zero allowance to zero first; the SDK handles that.

## Unshield

```javascript
const { unwrapHash, finalizeHash } = await account.unshield({ token: CUSDT_MAINNET, amount: 75_000_000n }, {
  onUnwrapSubmitted: hash => showStep('Unwrap submitted', hash),
  onFinalizing: () => showStep('Waiting for the KMS decryption'),
  onFinalizeSubmitted: hash => showStep('Finalize submitted', hash)
})
```

Two transactions:

1. **Unwrap**: burns the encrypted amount and emits an unwrap request.
2. **Finalize**: once the Zama KMS has publicly decrypted the request amount (seconds), submits the decryption proof and releases the USD₮.

The promise resolves after the finalize transaction is submitted. Expose the callbacks in your UI so the user sees progress.

## Fees

Both methods return the fee WDK quoted for the transactions they sent, in wei. For a quote before sending, use the swidge module's `quoteSwidge`, or multiply the gas estimates from the configuration by the current fee rate.

## If the unshield is interrupted

See [Recover an interrupted unshield](guide-recover-unshield.md).

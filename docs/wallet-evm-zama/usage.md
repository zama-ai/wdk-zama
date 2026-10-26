# Usage

## Install

```bash
npm install @zama-fhe/wdk-wallet-evm-zama
```

## Create an account

From a seed phrase:

```javascript
import WalletManagerEvmZama from '@zama-fhe/wdk-wallet-evm-zama'

const manager = new WalletManagerEvmZama(seedPhrase, {
  provider: 'https://ethereum-rpc.publicnode.com',
  transactionMaxFee: 10n ** 16n,
  zama: {
    chain: 'mainnet',
    relayerAuth: { __type: 'ApiKeyHeader', value: ZAMA_RELAYER_API_KEY },
    storage
  }
})

const account = await manager.getAccount(0)
```

From a private key:

```javascript
import { WalletAccountEvmZama } from '@zama-fhe/wdk-wallet-evm-zama'

const account = WalletAccountEvmZama.fromPrivateKey(privateKey, { provider, zama })
```

From a signer registered by name:

```javascript
manager.addSigner('treasury', signer)
const account = await manager.getAccount('treasury')
```

With WDK Core:

```javascript
import WDK from '@tetherto/wdk'

const wdk = new WDK(seedPhrase).registerWallet('ethereum', WalletManagerEvmZama, { provider, zama })
const account = await wdk.getAccount('ethereum', 0)
```

## Use the account

```javascript
import { CUSDT_MAINNET } from '@zama-fhe/wdk-wallet-evm-zama'

await account.grantDecryptPermit([CUSDT_MAINNET])                 // once, behind a user action
await account.getConfidentialBalance(CUSDT_MAINNET)               // bigint

await account.shield({ token: CUSDT_MAINNET, amount: 100_000_000n })
await account.confidentialTransfer({ token: CUSDT_MAINNET, recipient, amount: 25_000_000n })
await account.unshield({ token: CUSDT_MAINNET, amount: 75_000_000n })

manager.dispose()
```

Every `token` argument is the address of the confidential token. Amounts are `bigint` base units (USD₮ and cUSDT have 6 decimals).

Inherited methods keep their public behavior. `transfer()` on cUSDT is a plaintext ERC-20-style call, not a confidential transfer. `getTokenBalance(cUSDT)` throws `UnsupportedTokenError`.

# Usage

## Install

```bash
npm install @zama-fhe/wdk-protocol-swidge-zama
```

## Register the protocol

With WDK Core, globally:

```javascript
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import ZamaShieldProtocol from '@zama-fhe/wdk-protocol-swidge-zama'

const wdk = new WDK(seedPhrase)
  .registerWallet('ethereum', WalletManagerEvm, { provider })
  .registerProtocol('ethereum', 'confidential', ZamaShieldProtocol, {
    chain: 'mainnet',
    rpc: provider,
    relayerAuth: { __type: 'ApiKeyHeader', value: ZAMA_RELAYER_API_KEY },
    storage
  })

const account = await wdk.getAccount('ethereum', 0)
const shield = account.getSwidgeProtocol('confidential')
```

Or per account: `account.registerProtocol('confidential', ZamaShieldProtocol, config)`.

Without WDK Core: `const shield = new ZamaShieldProtocol(account, config)`.

## Shield and unshield

```javascript
import { USDT_MAINNET, CUSDT_MAINNET } from '@zama-fhe/wdk-wallet-evm-zama'

const quote = await shield.quoteSwidge({ fromToken: USDT_MAINNET, toToken: CUSDT_MAINNET, fromTokenAmount: 100_000_000n })

const shielded = await shield.swidge({ fromToken: USDT_MAINNET, toToken: CUSDT_MAINNET, fromTokenAmount: 100_000_000n })
await account.waitForTransaction(shielded.hash)

const unshielded = await shield.swidge({ fromToken: CUSDT_MAINNET, toToken: USDT_MAINNET, fromTokenAmount: 100_000_000n })

const { status } = await shield.getSwidgeStatus(unshielded.id)
if (status === 'action-required') {
  await shield.resumeSwidge(unshielded.id)
}
```

The generic swap methods work too: `shield.swap({ tokenIn, tokenOut, tokenInAmount })` and `shield.quoteSwap(...)`.

## Discovery

```javascript
await shield.getSupportedChains()                          // [{ id: 1, name: 'Ethereum', type: 'evm', nativeToken: 'ETH' }]
await shield.getSupportedTokens()                          // USDT and cUSDT
await shield.getSupportedTokens({ fromToken: USDT_MAINNET }) // cUSDT
```

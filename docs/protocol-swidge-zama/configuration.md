# Configuration

`ZamaShieldProtocolConfig` extends the wallet module's [`ZamaModuleConfig`](../wallet-evm-zama/configuration.md) with the WDK swidge fee caps:

| Option | Type | Description |
|---|---|---|
| `maxNetworkFeeBps` | `number \| bigint` | Maximum estimated network fee, in basis points of the input amount. Requires `nativeTokenPrice`. |
| `maxProtocolFeeBps` | `number \| bigint` | Accepted for compatibility. Zama charges no protocol fee on shield and unshield, so it always passes. |
| `nativeTokenPrice` | `number` | Price of one native token (ETH) in units of the source token, for example `3000` for USD₮. Used to value the network fee against `maxNetworkFeeBps`. |

Both caps can also be passed per call: `shield.swidge(options, { maxNetworkFeeBps })`.

If `maxNetworkFeeBps` is set without `nativeTokenPrice`, `swidge` throws `FeePriceRequiredError` rather than skipping the check.

## RPC under WDK policies

When WDK policies govern the account, the account object handed to the protocol is a proxy that hides private members, including the account's RPC configuration. Set `rpc` explicitly in the protocol configuration in that case; otherwise reads fall back to the chain preset's public RPC.

## Extra pairs

```javascript
{
  chain: 'mainnet',
  pairs: [{ erc20: '0x...', confidential: '0x...', symbol: 'TOK', confidentialSymbol: 'cTOK', decimals: 18, confidentialDecimals: 6 }]
}
```

Symbols and decimals are read from the chain when omitted. Pairs other than USD₮ / cUSDT work by configuration but are not tested or documented.

## Storage and relayer key

See the wallet module's [configuration](../wallet-evm-zama/configuration.md): the same `storage` and `relayerAuth` guidance applies.

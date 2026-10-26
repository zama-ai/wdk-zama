// Registration through WDK Core, with and without policies.

import { describe, expect, jest, test } from '@jest/globals'
import WDK, { PolicyViolationError } from '@tetherto/wdk'
import WalletManagerEvmZama, { WalletAccountEvmZama, CUSDT_MOCK_SEPOLIA } from '@zama-fhe/wdk-wallet-evm-zama'
import { WdkZamaSigner, disposeSharedZamaSdk } from '@zama-fhe/wdk-wallet-evm-zama/adapter'
import { confidentialTransferContract } from '@zama-fhe/sdk'

import ZamaShieldProtocol from '../index.js'

const SEED = 'test test test test test test test test test test test junk'
const CHAIN_ID = 11155111

function fakeEip1193 () {
  return {
    request: jest.fn(async ({ method }) => {
      if (method === 'eth_chainId') return '0x' + CHAIN_ID.toString(16)
      if (method === 'eth_accounts') return []
      throw new Error(`unexpected method ${method}`)
    })
  }
}

describe('WDK Core', () => {
  test('builds the protocol against the Zama account and shares one Zama context', async () => {
    const rpc = fakeEip1193()
    const config = { chain: 'sepolia', rpc, relayer: 'node' }
    const wdk = new WDK(SEED).registerWallet('ethereum', WalletManagerEvmZama, { provider: rpc, zama: config })

    wdk.registerProtocol('ethereum', 'confidential', ZamaShieldProtocol, config)

    const account = await wdk.getAccount('ethereum', 0)

    expect(account).toBeInstanceOf(WalletAccountEvmZama)

    const protocol = account.getSwidgeProtocol('confidential')

    expect(protocol).toBeInstanceOf(ZamaShieldProtocol)

    const context = await protocol._getZama()

    expect(context.chain.id).toBe(CHAIN_ID)
    expect(context.signer.walletAccount.getSnapshot().address).toBe(await account.getAddress())
    expect(await account.getSwidgeProtocol('confidential')._getZama()).toBe(context)

    await disposeSharedZamaSdk(account, config)
    wdk.dispose()
  })

  test('policies registered on WDK Core govern transactions sent through the adapter', async () => {
    const rpc = fakeEip1193()
    const config = { chain: 'sepolia', rpc, relayer: 'node' }
    const wdk = new WDK(SEED).registerWallet('ethereum', WalletManagerEvmZama, { provider: rpc, zama: config })

    wdk.registerPolicy([{
      id: 'deny-sends',
      name: 'Deny every transaction',
      scope: 'project',
      rules: [{ name: 'deny-all', operation: 'sendTransaction', action: 'DENY', conditions: [() => true] }]
    }])

    const account = await wdk.getAccount('ethereum', 0)

    // The governed account is a proxy that hides private members: the module must not rely on them.
    expect(account._config).toBeUndefined()
    expect(account).toBeInstanceOf(WalletAccountEvmZama)

    const signer = await WdkZamaSigner.create(account, CHAIN_ID)
    const call = confidentialTransferContract(CUSDT_MOCK_SEPOLIA, await account.getAddress(), '0x' + '11'.repeat(32), '0x')

    await expect(signer.writeContract(call)).rejects.toBeInstanceOf(PolicyViolationError)

    // A per-account protocol builds against the governed account and resolves its RPC from the config.
    account.registerProtocol('confidential', ZamaShieldProtocol, config)

    const protocol = account.getSwidgeProtocol('confidential')

    await expect(protocol.getSupportedChains()).resolves.toEqual([{ id: CHAIN_ID, name: 'Sepolia', type: 'evm', nativeToken: 'ETH' }])

    await disposeSharedZamaSdk(account, config)
    wdk.dispose()
  })
})

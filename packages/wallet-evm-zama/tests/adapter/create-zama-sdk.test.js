import { describe, expect, jest, test } from '@jest/globals'
import { ZamaSDK, cleartext } from '@zama-fhe/sdk'
import { sepolia, mainnet } from '@zama-fhe/sdk/chains'
import { JsonRpcProvider } from 'ethers'

import { resolveChain, toRelayerNetwork, pickRpc, buildEthersProvider } from '../../src/adapter/chain.js'
import { createZamaSdk, getSharedZamaSdk, disposeSharedZamaSdk, resolveRelayer, isWritableAccount, DEFAULT_GAS_ESTIMATES } from '../../src/adapter/create-zama-sdk.js'
import { ZamaWdkError, UnsupportedAccountError } from '../../src/errors.js'
import { CUSDT_MOCK_SEPOLIA, USDT_MOCK_SEPOLIA } from '../../src/tokens.js'

const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

/** A minimal EIP-1193 provider that only knows its chain id. */
function fakeEip1193 (chainId) {
  return {
    request: jest.fn(async ({ method }) => {
      if (method === 'eth_chainId') return '0x' + chainId.toString(16)
      if (method === 'eth_accounts') return []
      throw new Error(`unexpected method ${method}`)
    })
  }
}

function fakeAccount (config = {}) {
  return {
    _config: config,
    getAddress: async () => ADDRESS,
    signTypedData: async () => '0x',
    sendTransaction: async () => ({ hash: '0x' + '00'.repeat(32), fee: 0n })
  }
}

describe('resolveChain', () => {
  test('resolves presets by name', () => {
    expect(resolveChain('sepolia')).toBe(sepolia)
    expect(resolveChain('mainnet')).toBe(mainnet)
  })

  test('resolves presets by detected chain id when omitted', () => {
    expect(resolveChain(undefined, 11155111)).toBe(sepolia)
    expect(() => resolveChain(undefined, 31337)).toThrow(ZamaWdkError)
  })

  test('accepts a full chain object and rejects unknown names', () => {
    const custom = { ...sepolia, id: 31337 }

    expect(resolveChain(custom)).toBe(custom)
    expect(() => resolveChain('base')).toThrow(ZamaWdkError)
  })
})

describe('toRelayerNetwork', () => {
  test('passes urls and EIP-1193 providers through', () => {
    const eip1193 = fakeEip1193(1)

    expect(toRelayerNetwork('https://rpc.example')).toBe('https://rpc.example')
    expect(toRelayerNetwork(eip1193)).toBe(eip1193)
    expect(toRelayerNetwork(['https://a.example', 'https://b.example'])).toBe('https://a.example')
  })

  test('wraps an ethers provider in an EIP-1193 shim over send()', async () => {
    const provider = { send: jest.fn(async (method, params) => ({ method, params })) }

    const network = toRelayerNetwork(provider)

    await expect(network.request({ method: 'eth_blockNumber' })).resolves.toEqual({ method: 'eth_blockNumber', params: [] })
    await expect(network.request({ method: 'eth_call', params: [{ to: '0x1' }] })).resolves.toEqual({ method: 'eth_call', params: [{ to: '0x1' }] })
  })

  test('rejects unsupported values', () => {
    expect(() => toRelayerNetwork({})).toThrow(ZamaWdkError)
    expect(() => toRelayerNetwork(undefined)).toThrow(ZamaWdkError)
  })
})

describe('buildEthersProvider / pickRpc', () => {
  test('builds a JsonRpcProvider from a url and reuses an ethers provider', () => {
    const built = buildEthersProvider('https://rpc.example', 11155111)
    const own = new JsonRpcProvider('https://rpc.example', 11155111, { staticNetwork: true })

    expect(built).toBeInstanceOf(JsonRpcProvider)
    expect(buildEthersProvider(own)).toBe(own)
    expect(pickRpc(['a', 'b'])).toBe('a')
    expect(() => buildEthersProvider(undefined)).toThrow(ZamaWdkError)

    built.destroy()
    own.destroy()
  })
})

describe('resolveRelayer', () => {
  test('accepts relayer objects, factories and the cleartext name', async () => {
    const relayer = cleartext()

    expect(await resolveRelayer(relayer)).toBe(relayer)
    expect(await resolveRelayer(() => relayer)).toBe(relayer)
    expect((await resolveRelayer('cleartext')).type).toBe('cleartext')
    expect((await resolveRelayer('node')).type).toBe('node')
    expect((await resolveRelayer(undefined)).type).toBe('node')
  })

  test('rejects unknown names', async () => {
    await expect(resolveRelayer('carrier-pigeon')).rejects.toThrow(ZamaWdkError)
  })
})

describe('isWritableAccount', () => {
  test('requires getAddress, signTypedData and sendTransaction', () => {
    expect(isWritableAccount(fakeAccount())).toBe(true)
    expect(isWritableAccount({ getAddress: async () => ADDRESS })).toBe(false)
    expect(isWritableAccount(undefined)).toBe(false)
  })
})

describe('createZamaSdk', () => {
  test('builds a context from the account provider, with a signer and the default pairs', async () => {
    const account = fakeAccount({ provider: fakeEip1193(11155111) })

    const context = await createZamaSdk(account, { chain: 'sepolia', relayer: 'node' })

    expect(context.sdk).toBeInstanceOf(ZamaSDK)
    expect(context.chain).toBe(sepolia)
    expect(context.signer.walletAccount.getSnapshot()).toEqual({ address: ADDRESS, chainId: 11155111 })
    expect(context.sdk.signer).toBe(context.signer)
    expect(context.pairs).toEqual([expect.objectContaining({ erc20: USDT_MOCK_SEPOLIA, confidential: CUSDT_MOCK_SEPOLIA })])
    expect(context.gasEstimates).toEqual(DEFAULT_GAS_ESTIMATES)

    context.dispose()
  })

  test('detects the chain from the rpc when omitted and merges extra pairs and gas estimates', async () => {
    const pairs = [{ erc20: '0x' + '11'.repeat(20), confidential: '0x' + '22'.repeat(20), symbol: 'A', confidentialSymbol: 'cA', decimals: 18 }]

    const context = await createZamaSdk(undefined, { rpc: fakeEip1193(1), relayer: 'node', pairs, gasEstimates: { wrap: 1n } })

    expect(context.chain).toBe(mainnet)
    expect(context.signer).toBeUndefined()
    expect(context.sdk.signer).toBeUndefined()
    expect(context.pairs).toHaveLength(2)
    expect(context.pairs[1].erc20).toBe('0x1111111111111111111111111111111111111111')
    expect(context.gasEstimates.wrap).toBe(1n)
    expect(context.gasEstimates.unwrap).toBe(DEFAULT_GAS_ESTIMATES.unwrap)

    context.dispose()
  })

  test('throws when the rpc chain does not match the configured chain', async () => {
    await expect(createZamaSdk(undefined, { chain: 'mainnet', rpc: fakeEip1193(11155111), relayer: 'node' })).rejects.toThrow(ZamaWdkError)
  })

  test('throws without any rpc', async () => {
    await expect(createZamaSdk(fakeAccount(), { relayer: 'node' })).rejects.toThrow(ZamaWdkError)
  })

  test('rejects ERC-4337 smart accounts before touching the network', async () => {
    const smartAccount = { ...fakeAccount(), getUserOperationReceipt: () => {} }

    await expect(createZamaSdk(smartAccount, { chain: 'sepolia', rpc: fakeEip1193(11155111) })).rejects.toBeInstanceOf(UnsupportedAccountError)
  })

  test('does not read the private account provider when an rpc is given', async () => {
    const account = fakeAccount({ provider: fakeEip1193(1) })
    const rpc = fakeEip1193(11155111)

    const context = await createZamaSdk(account, { chain: 'sepolia', rpc, relayer: 'node' })

    expect(context.chain).toBe(sepolia)
    expect(account._config.provider.request).not.toHaveBeenCalled()

    context.dispose()
  })
})

describe('getSharedZamaSdk', () => {
  test('shares one context per account and config object', async () => {
    const account = fakeAccount({ provider: fakeEip1193(11155111) })
    const config = { chain: 'sepolia', relayer: 'node' }

    const first = await getSharedZamaSdk(account, config)
    const second = await getSharedZamaSdk(account, config)
    const other = await getSharedZamaSdk(account, { ...config })

    expect(second).toBe(first)
    expect(other).not.toBe(first)

    await disposeSharedZamaSdk(account, config)

    const rebuilt = await getSharedZamaSdk(account, config)

    expect(rebuilt).not.toBe(first)

    await disposeSharedZamaSdk(account, config)
    await disposeSharedZamaSdk(account, { ...config })
    other.dispose()
  })

  test('retries after a failed creation', async () => {
    const account = fakeAccount({ provider: fakeEip1193(11155111) })
    const config = { chain: 'mainnet', relayer: 'node' }

    await expect(getSharedZamaSdk(account, config)).rejects.toThrow(ZamaWdkError)

    config.chain = 'sepolia'

    const context = await getSharedZamaSdk(account, config)

    expect(context.chain).toBe(sepolia)

    await disposeSharedZamaSdk(account, config)
  })
})

describe('runtime passthrough', () => {
  test('accepts FHE runtime options such as a single-threaded WASM runtime', async () => {
    const context = await createZamaSdk(undefined, { chain: 'sepolia', rpc: fakeEip1193(11155111), relayer: 'node', runtime: { numberOfThreads: 0 } })

    expect(context.sdk).toBeInstanceOf(ZamaSDK)

    context.dispose()
  })
})

import { describe, expect, test } from '@jest/globals'
import { InvalidSignerError } from '@tetherto/wdk-wallet'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { PrivateKeySignerEvm } from '@tetherto/wdk-wallet-evm/signers'

import WalletManagerEvmZama from '../src/wallet-manager-evm-zama.js'
import WalletAccountEvmZama from '../src/wallet-account-evm-zama.js'

const SEED = 'test test test test test test test test test test test junk'
const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const ZAMA = { chain: 'sepolia' }

describe('WalletManagerEvmZama', () => {
  test('is a WalletManagerEvm', () => {
    const manager = new WalletManagerEvmZama(SEED, { zama: ZAMA })

    expect(manager).toBeInstanceOf(WalletManagerEvm)

    manager.dispose()
  })

  test('derives Zama accounts by index and path, cached per key', async () => {
    const manager = new WalletManagerEvmZama(SEED, { zama: ZAMA })

    const first = await manager.getAccount()
    const again = await manager.getAccount(0)
    const second = await manager.getAccount(1)
    const byPath = await manager.getAccountByPath("0'/0/1")

    expect(first).toBeInstanceOf(WalletAccountEvmZama)
    expect(again).toBe(first)
    expect(byPath).toBe(second)
    expect(await first.getAddress()).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(first._zamaConfig).toBe(ZAMA)

    manager.dispose()
  })

  test('returns Zama accounts for named signers', async () => {
    const manager = new WalletManagerEvmZama(SEED, { zama: ZAMA })

    manager.addSigner('ops', new PrivateKeySignerEvm(PRIVATE_KEY))

    const named = await manager.getAccount('ops')

    expect(named).toBeInstanceOf(WalletAccountEvmZama)
    expect(await named.getAddress()).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
    expect(await manager.getAccount('ops')).toBe(named)
    expect(named._zamaConfig).toBe(ZAMA)

    await expect(manager.getAccount(0, { signerName: 'ops' })).rejects.toBeInstanceOf(InvalidSignerError)

    manager.dispose()
  })
})

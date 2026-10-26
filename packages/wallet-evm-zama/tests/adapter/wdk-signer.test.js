import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import { MaximumFeeExceededError } from '@tetherto/wdk-wallet'
import { WalletNotConnectedError, SigningFailedError, confidentialTransferContract } from '@zama-fhe/sdk'
import { decodeFunctionData, getAddress } from 'viem'

import WdkZamaSigner from '../../src/adapter/wdk-signer.js'
import { UnsupportedAccountError, toWdkError } from '../../src/errors.js'

const ADDRESS = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'
const TOKEN = '0x4E7B06D78965594eB5EF5414c357ca21E1554491'
const HASH = '0x' + 'ab'.repeat(32)

describe('WdkZamaSigner', () => {
  let account, signer

  beforeEach(async () => {
    account = {
      getAddress: jest.fn(async () => ADDRESS),
      signTypedData: jest.fn(async () => '0xsig'),
      sendTransaction: jest.fn(async () => ({ hash: HASH, fee: 21_000n }))
    }

    signer = await WdkZamaSigner.create(account, 11155111)
  })

  describe('walletAccount', () => {
    test('is ready and exposes the checksummed address and chain id', () => {
      expect(signer.walletAccount.isReady()).toBe(true)
      expect(signer.walletAccount.getSnapshot()).toEqual({ address: getAddress(ADDRESS), chainId: 11155111 })
    })

    test('emits the snapshot synchronously on subscribe', () => {
      let received

      const unsubscribe = signer.walletAccount.subscribe(change => { received = change })

      expect(received).toEqual({ previous: undefined, next: { address: getAddress(ADDRESS), chainId: 11155111 } })
      expect(typeof unsubscribe).toBe('function')
    })
  })

  describe('requireWalletAccount', () => {
    test('returns the snapshot', () => {
      expect(signer.requireWalletAccount('balanceOf')).toEqual({ address: getAddress(ADDRESS), chainId: 11155111 })
    })

    test('throws WalletNotConnectedError once the account is disposed', () => {
      account.disposed = true

      expect(() => signer.requireWalletAccount('balanceOf')).toThrow(WalletNotConnectedError)
    })
  })

  describe('writeContract', () => {
    test('encodes the calldata and sends it through the account', async () => {
      const encryptedAmount = '0x' + '11'.repeat(32)
      const config = confidentialTransferContract(TOKEN, getAddress(ADDRESS), encryptedAmount, '0x1234')

      const hash = await signer.writeContract(config)

      expect(hash).toBe(HASH)
      expect(account.sendTransaction).toHaveBeenCalledTimes(1)

      const [tx] = account.sendTransaction.mock.calls[0]

      expect(tx.to).toBe(TOKEN)
      expect(tx.value).toBe(0n)
      expect(tx).not.toHaveProperty('gasLimit')

      const decoded = decodeFunctionData({ abi: config.abi, data: tx.data })

      expect(decoded.functionName).toBe('confidentialTransfer')
      expect(decoded.args).toEqual([getAddress(ADDRESS), encryptedAmount, '0x1234'])
    })

    test('forwards value and gas overrides', async () => {
      const config = confidentialTransferContract(TOKEN, getAddress(ADDRESS), '0x' + '11'.repeat(32), '0x')

      await signer.writeContract({ ...config, value: 5n, gas: 123_456n })

      const [tx] = account.sendTransaction.mock.calls[0]

      expect(tx.value).toBe(5n)
      expect(tx.gasLimit).toBe(123_456n)
    })

    test('records the quoted fee for later retrieval', async () => {
      const config = confidentialTransferContract(TOKEN, getAddress(ADDRESS), '0x' + '11'.repeat(32), '0x')

      await signer.writeContract(config)

      expect(signer.takeFee(HASH)).toBe(21_000n)
      expect(signer.takeFee(HASH)).toBe(0n)
    })

    test('lets a WDK fee-cap error through unchanged', async () => {
      account.sendTransaction.mockRejectedValue(new MaximumFeeExceededError('Exceeded maximum fee cost for transaction operation.'))

      const config = confidentialTransferContract(TOKEN, getAddress(ADDRESS), '0x' + '11'.repeat(32), '0x')

      await expect(signer.writeContract(config)).rejects.toBeInstanceOf(MaximumFeeExceededError)
    })
  })

  describe('signTypedData', () => {
    test('converts the payload and signs with the account', async () => {
      const typedData = {
        domain: { name: 'Decryption', version: '1', chainId: 11155111, verifyingContract: TOKEN },
        primaryType: 'Thing',
        types: { EIP712Domain: [{ name: 'name', type: 'string' }], Thing: [{ name: 'x', type: 'uint256' }] },
        message: { x: '1' }
      }

      await expect(signer.signTypedData(typedData)).resolves.toBe('0xsig')

      const [wdkTypedData] = account.signTypedData.mock.calls[0]

      expect(wdkTypedData).not.toHaveProperty('primaryType')
      expect(wdkTypedData.types).toEqual({ Thing: [{ name: 'x', type: 'uint256' }] })
    })
  })

  test('rejects ERC-4337 smart accounts', async () => {
    const smartAccount = { ...account, getUserOperationReceipt: jest.fn() }

    await expect(WdkZamaSigner.create(smartAccount, 1)).rejects.toBeInstanceOf(UnsupportedAccountError)
  })

  test('dispose does not dispose the account', () => {
    account.dispose = jest.fn()

    signer.dispose()

    expect(account.dispose).not.toHaveBeenCalled()
  })
})

describe('toWdkError (fee-cap passthrough)', () => {
  test('unwraps a WDK error wrapped by the SDK', () => {
    const wdkError = new MaximumFeeExceededError('Exceeded maximum fee cost for transaction operation.')
    const sdkError = new SigningFailedError('writeContract failed', { cause: wdkError })

    expect(toWdkError(sdkError)).toBe(wdkError)
  })
})

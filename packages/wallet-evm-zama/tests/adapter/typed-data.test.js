import { describe, expect, test } from '@jest/globals'
import { privateKeyToAccount } from 'viem/accounts'
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'

import { toWdkTypedData } from '../../src/adapter/typed-data.js'
import WdkZamaSigner from '../../src/adapter/wdk-signer.js'

const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

const DOMAIN = {
  name: 'Decryption',
  version: '1',
  chainId: 11155111,
  verifyingContract: '0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478'
}

// The unified (V2) user-decrypt permit emitted by @fhevm/sdk >= 0.13.
const PERMIT_V2 = {
  domain: DOMAIN,
  primaryType: 'UserDecryptRequestVerification',
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' }
    ],
    UserDecryptRequestVerification: [
      { name: 'userAddress', type: 'address' },
      { name: 'publicKey', type: 'bytes' },
      { name: 'allowedContracts', type: 'address[]' },
      { name: 'startTimestamp', type: 'uint256' },
      { name: 'durationSeconds', type: 'uint256' },
      { name: 'extraData', type: 'bytes' }
    ]
  },
  message: {
    userAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    publicKey: '0x2000' + 'ab'.repeat(32),
    allowedContracts: ['0x4E7B06D78965594eB5EF5414c357ca21E1554491', '0xAe0207C757Aa2B4019Ad96edD0092ddc63EF0c50'],
    startTimestamp: '1760000000',
    durationSeconds: '2592000',
    extraData: '0x01'
  }
}

// The delegated user-decrypt permit (V1).
const DELEGATION_V1 = {
  domain: DOMAIN,
  primaryType: 'DelegatedUserDecryptRequestVerification',
  types: {
    EIP712Domain: PERMIT_V2.types.EIP712Domain,
    DelegatedUserDecryptRequestVerification: [
      { name: 'publicKey', type: 'bytes' },
      { name: 'contractAddresses', type: 'address[]' },
      { name: 'delegatorAddress', type: 'address' },
      { name: 'startTimestamp', type: 'uint256' },
      { name: 'durationDays', type: 'uint256' },
      { name: 'extraData', type: 'bytes' }
    ]
  },
  message: {
    publicKey: '0x2000' + 'cd'.repeat(32),
    contractAddresses: ['0x4E7B06D78965594eB5EF5414c357ca21E1554491'],
    delegatorAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    startTimestamp: '1760000000',
    durationDays: '30',
    extraData: '0x00'
  }
}

describe('toWdkTypedData', () => {
  test('drops primaryType and the EIP712Domain type', () => {
    const converted = toWdkTypedData(PERMIT_V2)

    expect(converted).not.toHaveProperty('primaryType')
    expect(Object.keys(converted.types)).toEqual(['UserDecryptRequestVerification'])
    expect(converted.domain).toEqual(DOMAIN)
    expect(converted.message).toEqual(PERMIT_V2.message)
  })

  test('does not mutate the input', () => {
    const frozen = Object.freeze({ ...PERMIT_V2, types: Object.freeze({ ...PERMIT_V2.types }) })

    expect(() => toWdkTypedData(frozen)).not.toThrow()
    expect(frozen.types).toHaveProperty('EIP712Domain')
  })

  test.each([
    ['user-decrypt permit V2', PERMIT_V2],
    ['delegated user-decrypt permit V1', DELEGATION_V1]
  ])('a WDK account signs the %s exactly like viem', async (_, typedData) => {
    const expected = await privateKeyToAccount(PRIVATE_KEY).signTypedData(typedData)

    const account = WalletAccountEvm.fromPrivateKey(PRIVATE_KEY)
    const signer = await WdkZamaSigner.create(account, DOMAIN.chainId)

    await expect(signer.signTypedData(typedData)).resolves.toBe(expected)
    await expect(account.signTypedData(toWdkTypedData(typedData))).resolves.toBe(expected)
  })
})

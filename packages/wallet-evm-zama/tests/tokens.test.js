import { describe, expect, test } from '@jest/globals'

import { CUSDT_MAINNET, CUSDT_MOCK_SEPOLIA, DEFAULT_PAIRS, USDT_MAINNET, USDT_MOCK_SEPOLIA, findPairByConfidential, findPairByErc20, getDefaultPairs, isSameAddress, normalizePairs } from '../src/tokens.js'

describe('tokens', () => {
  test('ships the USDT / cUSDT pairs for mainnet and Sepolia', () => {
    expect(getDefaultPairs(1)).toEqual([expect.objectContaining({ erc20: USDT_MAINNET, confidential: CUSDT_MAINNET, decimals: 6 })])
    expect(getDefaultPairs(11155111)).toEqual([expect.objectContaining({ erc20: USDT_MOCK_SEPOLIA, confidential: CUSDT_MOCK_SEPOLIA, decimals: 6 })])
    expect(getDefaultPairs(31337)).toEqual([])
    expect(Object.isFrozen(DEFAULT_PAIRS)).toBe(true)
  })

  test('finds pairs case-insensitively', () => {
    const pairs = getDefaultPairs(1)

    expect(findPairByErc20(pairs, USDT_MAINNET.toLowerCase())).toBe(pairs[0])
    expect(findPairByConfidential(pairs, CUSDT_MAINNET.toUpperCase().replace('0X', '0x'))).toBe(pairs[0])
    expect(findPairByErc20(pairs, CUSDT_MAINNET)).toBeUndefined()
    expect(isSameAddress(USDT_MAINNET, USDT_MAINNET.toLowerCase())).toBe(true)
    expect(isSameAddress(USDT_MAINNET, undefined)).toBe(false)
  })

  test('normalizes addresses and deduplicates by confidential token, later entries winning', () => {
    const normalized = normalizePairs([
      { erc20: USDT_MAINNET.toLowerCase(), confidential: CUSDT_MAINNET.toLowerCase(), symbol: 'old' },
      { erc20: USDT_MAINNET, confidential: CUSDT_MAINNET, symbol: 'new' }
    ])

    expect(normalized).toEqual([{ erc20: USDT_MAINNET, confidential: CUSDT_MAINNET, symbol: 'new' }])
  })
})

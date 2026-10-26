import { describe, expect, test } from '@jest/globals'
import { ValueError } from '@tetherto/wdk-wallet'

import { decodeSwidgeId, encodeSwidgeId } from '../src/swidge-id.js'

const HASH = '0x' + 'Ab'.repeat(32)

describe('swidge ids', () => {
  test('round-trip, lower-casing the hash', () => {
    const id = encodeSwidgeId({ chainId: 1, operation: 'unshield', hash: HASH })

    expect(id).toBe(`1:unshield:${HASH.toLowerCase()}`)
    expect(decodeSwidgeId(id)).toEqual({ chainId: 1, operation: 'unshield', hash: HASH.toLowerCase() })
    expect(decodeSwidgeId(`11155111:shield:${HASH}`)).toEqual({ chainId: 11155111, operation: 'shield', hash: HASH.toLowerCase() })
  })

  test.each([
    'nope',
    `1:swap:${HASH}`,
    `1:shield:${HASH.slice(0, 10)}`,
    `x:shield:${HASH}`,
    undefined,
    42
  ])('rejects %p', (id) => {
    expect(() => decodeSwidgeId(id)).toThrow(ValueError)
  })
})

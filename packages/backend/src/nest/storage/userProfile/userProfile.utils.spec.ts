import { describe, expect, test } from '@jest/globals'

import { isPng, base64DataURLToByteArray } from './userProfile.utils'

describe('isPng', () => {
  test('returns true for a valid PNG', () => {
    // Bytes in decimal copied out of a PNG file
    // e.g. od -t u1 ~/Pictures/test.png | less
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
    expect(isPng(png)).toBeTruthy()
  })

  test('returns false for a invalid PNG', () => {
    // Changed the first byte from 137 to 136
    const png = new Uint8Array([136, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
    expect(isPng(png)).toBeFalsy()
  })

  test('returns false for a incomplete PNG', () => {
    // Removed last byte from the PNG header
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26])
    expect(isPng(png)).toBeFalsy()
  })
})

describe('base64DataURLToByteArray', () => {
  test("throws error if data URL prefix doesn't exist", () => {
    const contents = '1234567'
    expect(() => base64DataURLToByteArray(contents)).toThrow(Error)
  })

  test('throws error if data URL prefix is malformatted', () => {
    let contents = ',1234567'
    expect(() => base64DataURLToByteArray(contents)).toThrow(Error)

    contents = ',1234567'
    expect(() => base64DataURLToByteArray(contents)).toThrow(Error)

    contents = 'data:,1234567'
    expect(() => base64DataURLToByteArray(contents)).toThrow(Error)

    contents = ';base64,1234567'
    expect(() => base64DataURLToByteArray(contents)).toThrow(Error)

    contents = 'dat:;base64,1234567'
    expect(() => base64DataURLToByteArray(contents)).toThrow(Error)
  })

  test('returns Uint8Array if data URL prefix is correct', () => {
    // base64 encoding of binary 'm'
    // btoa('m') == 'bQ=='
    const contents = 'data:mime;base64,bQ=='
    expect(base64DataURLToByteArray(contents)).toEqual(new Uint8Array(['m'.charCodeAt(0)]))
  })
})

import { describe, expect, test } from 'bun:test'
import { isNewer } from '../update-check'
describe('isNewer', () => {
  test('patch bump', () => {
    expect(isNewer('0.0.2', '0.0.1')).toBe(true)
  })
  test('minor bump', () => {
    expect(isNewer('0.1.0', '0.0.99')).toBe(true)
  })
  test('major bump', () => {
    expect(isNewer('1.0.0', '0.99.99')).toBe(true)
  })
  test('equal', () => {
    expect(isNewer('1.2.3', '1.2.3')).toBe(false)
  })
  test('older', () => {
    expect(isNewer('0.0.0', '0.0.1')).toBe(false)
  })
  test('zero cache vs shipped', () => {
    expect(isNewer('0.0.0', '0.0.1')).toBe(false)
  })
  test('malformed falls back to 0', () => {
    expect(isNewer('abc.def.ghi', '0.0.1')).toBe(false)
    expect(isNewer('0.0.1', 'abc.def.ghi')).toBe(true)
  })
  test('missing patch', () => {
    expect(isNewer('1.2', '1.1')).toBe(true)
  })
})

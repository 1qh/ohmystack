import { describe, expect, test } from 'bun:test'
import { constantTimeEqual } from '../security'
describe('constantTimeEqual', () => {
  test('equal strings return true', () => {
    expect(constantTimeEqual('hello', 'hello')).toBe(true)
  })
  test('different strings return false', () => {
    expect(constantTimeEqual('hello', 'world')).toBe(false)
  })
  test('different lengths return false', () => {
    expect(constantTimeEqual('hi', 'hello')).toBe(false)
  })
  test('empty equal strings return true', () => {
    expect(constantTimeEqual('', '')).toBe(true)
  })
  test('non-string inputs return false', () => {
    expect(constantTimeEqual('hi', null as unknown as string)).toBe(false)
    expect(constantTimeEqual(123 as unknown as string, 'hi')).toBe(false)
  })
  test('handles unicode', () => {
    expect(constantTimeEqual('héllo', 'héllo')).toBe(true)
    expect(constantTimeEqual('héllo', 'hello')).toBe(false)
  })
})

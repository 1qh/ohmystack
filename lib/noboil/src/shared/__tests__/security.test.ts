import { describe, expect, test } from 'bun:test'
import { constantTimeEqual, generateSecret, hashSecret } from '../security'
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
describe('hashSecret', () => {
  test('SHA-256 deterministic', async () => {
    const a = await hashSecret('hello')
    const b = await hashSecret('hello')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/u)
  })
  test('different inputs → different hashes', async () => {
    const a = await hashSecret('hello')
    const b = await hashSecret('world')
    expect(a).not.toBe(b)
  })
})
describe('generateSecret', () => {
  test('returns UUID v4 format', () => {
    const s = generateSecret()
    expect(s).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u)
  })
  test('subsequent calls return different values', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i += 1) seen.add(generateSecret())
    expect(seen.size).toBe(100)
  })
})

import { describe, expect, test } from 'bun:test'
import { parseAllowed, validateProfileEmail } from '../auth-helpers'
describe('parseAllowed', () => {
  test('CSV split + canonicalize + dedupe via Set', () => {
    const r = parseAllowed('User+tag@gmail.com, ALICE@example.com, alice@example.com')
    expect(r.has('user@gmail.com')).toBe(true)
    expect(r.has('alice@example.com')).toBe(true)
    expect(r.size).toBe(2)
  })
  test('empty CSV → empty set', () => {
    expect(parseAllowed(undefined).size).toBe(0)
    expect(parseAllowed('').size).toBe(0)
  })
})
describe('validateProfileEmail', () => {
  const allowed = new Set(['alice@example.com', 'bob@gmail.com'])
  test('accepts allowed canonical email', () => {
    const r = validateProfileEmail({ email: 'Alice@example.com' }, allowed, null)
    expect(r.canonicalEmail).toBe('alice@example.com')
  })
  test('canonicalizes gmail with +tag and dots', () => {
    const r = validateProfileEmail({ email: 'b.o.b+tag@gmail.com' }, allowed, null)
    expect(r.canonicalEmail).toBe('bob@gmail.com')
  })
  test('rejects email_verified=false', () => {
    expect(() => validateProfileEmail({ email: 'alice@example.com', email_verified: false }, allowed, null)).toThrow(
      'not verified'
    )
  })
  test('rejects non-allowed email', () => {
    expect(() => validateProfileEmail({ email: 'eve@bad.com' }, allowed, null)).toThrow('not allowed')
  })
  test('rejects empty allowlist', () => {
    expect(() => validateProfileEmail({ email: 'alice@example.com' }, new Set(), null)).toThrow('not configured')
  })
  test('rejects mismatch with existing user', () => {
    expect(() => validateProfileEmail({ email: 'alice@example.com' }, allowed, 'bob@gmail.com')).toThrow('mismatch')
  })
  test('accepts when existing matches', () => {
    const r = validateProfileEmail({ email: 'alice@example.com' }, allowed, 'alice@example.com')
    expect(r.canonicalEmail).toBe('alice@example.com')
  })
  test('rejects missing email', () => {
    expect(() => validateProfileEmail({}, allowed, null)).toThrow('not allowed')
  })
})

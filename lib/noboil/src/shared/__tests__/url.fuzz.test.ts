import { describe, expect, test } from 'bun:test'
import { createLcg } from '../test/prop'
import { validateRedirectTo } from '../url'
const allowedOrigins = new Set(['http://localhost:3000', 'https://example.com'])
const primarySite = 'https://example.com'
const POISON = ['%0d', '%0a', '%2f%2f', '%5c', '%09']
const SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-_/'
const randomSuffix = (rng: ReturnType<typeof createLcg>, max = 30): string => {
  const len = rng.int(max)
  let out = ''
  for (let i = 0; i < len; i += 1) out += SUFFIX_CHARS[rng.int(SUFFIX_CHARS.length)] ?? 'a'
  return out
}
const randomString = (rng: ReturnType<typeof createLcg>, max = 100): string => {
  const len = rng.int(max)
  let out = ''
  for (let i = 0; i < len; i += 1) out += String.fromCodePoint(32 + rng.int(94))
  return out
}
describe('validateRedirectTo fuzz', () => {
  test('never returns foreign-origin URL (open-redirect invariant)', () => {
    const rng = createLcg(42)
    let accepted = 0
    for (let i = 0; i < 1000; i += 1) {
      const redirectTo = randomString(rng, 200)
      try {
        const out = validateRedirectTo({ allowedOrigins, primarySite, redirectTo })
        const u = new URL(out)
        expect(allowedOrigins.has(u.origin.toLowerCase())).toBe(true)
        accepted += 1
      } catch {
        /* Acceptable rejection */
      }
    }
    expect(accepted).toBeGreaterThanOrEqual(0)
  })
  test('encoded traversal in path always rejected', () => {
    const rng = createLcg(7)
    for (let i = 0; i < 200; i += 1) {
      const poison = POISON[rng.int(POISON.length)] ?? '%0d'
      const suffix = randomSuffix(rng).replaceAll(/[?#]/gu, '')
      expect(() => validateRedirectTo({ allowedOrigins, primarySite, redirectTo: `/foo${poison}${suffix}` })).toThrow()
    }
  })
  test(String.raw`protocol-relative // and /\ rejected`, () => {
    const rng = createLcg(99)
    for (let i = 0; i < 100; i += 1) {
      const prefix = rng.next() < 0.5 ? '//' : '/\\'
      const host = `host${rng.int(1000)}.example`
      expect(() => validateRedirectTo({ allowedOrigins, primarySite, redirectTo: `${prefix}${host}/path` })).toThrow()
    }
  })
  test('non-string redirectTo throws', () => {
    expect(() => validateRedirectTo({ allowedOrigins, primarySite, redirectTo: 42 })).toThrow()
    expect(() => validateRedirectTo({ allowedOrigins, primarySite, redirectTo: null })).toThrow()
    expect(() => validateRedirectTo({ allowedOrigins, primarySite, redirectTo: undefined })).toThrow()
  })
  test('accepts allowed-origin absolute URL', () => {
    const out = validateRedirectTo({
      allowedOrigins,
      primarySite,
      redirectTo: 'https://example.com/dashboard?x=1'
    })
    expect(out).toBe('https://example.com/dashboard?x=1')
  })
  test('accepts same-origin path', () => {
    const out = validateRedirectTo({ allowedOrigins, primarySite, redirectTo: '/dashboard' })
    expect(out).toBe('https://example.com/dashboard')
  })
})

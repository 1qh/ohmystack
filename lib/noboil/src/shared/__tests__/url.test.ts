import { describe, expect, test } from 'bun:test'
import { normalizeOrigin, parseSiteUrls } from '../url'
describe('normalizeOrigin', () => {
  test('extracts origin lowercased', () => {
    expect(normalizeOrigin('HTTPS://Example.COM/path?q=1')).toBe('https://example.com')
  })
  test('invalid url returns empty', () => {
    expect(normalizeOrigin('not-a-url')).toBe('')
    expect(normalizeOrigin('')).toBe('')
  })
})
describe('parseSiteUrls', () => {
  test('CSV → urls + primary + origins', () => {
    const r = parseSiteUrls('https://a.com, https://b.com')
    expect(r.siteUrls).toEqual(['https://a.com', 'https://b.com'])
    expect(r.primary).toBe('https://a.com')
    expect(r.allowedOrigins.has('https://a.com')).toBe(true)
    expect(r.allowedOrigins.has('https://b.com')).toBe(true)
  })
  test('empty input', () => {
    const r = parseSiteUrls(undefined)
    expect(r.siteUrls).toEqual([])
    expect(r.primary).toBe('')
    expect(r.allowedOrigins.size).toBe(0)
  })
  test('skips invalid origins in allowed set', () => {
    const r = parseSiteUrls('https://valid.com, garbage')
    expect(r.siteUrls).toEqual(['https://valid.com', 'garbage'])
    expect(r.allowedOrigins.size).toBe(1)
  })
})

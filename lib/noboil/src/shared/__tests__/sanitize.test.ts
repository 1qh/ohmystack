import { describe, expect, test } from 'bun:test'
import { canonicalizeEmail, sanitizeExternal, sanitizeForDisplay } from '../sanitize'
describe('canonicalizeEmail', () => {
  test('lowercases and trims', () => {
    expect(canonicalizeEmail('  HELLO@example.com  ')).toBe('hello@example.com')
  })
  test('strips +tag from any provider', () => {
    expect(canonicalizeEmail('user+spam@example.com')).toBe('user@example.com')
  })
  test('removes dots only for gmail/googlemail', () => {
    expect(canonicalizeEmail('a.b.c@gmail.com')).toBe('abc@gmail.com')
    expect(canonicalizeEmail('a.b.c@googlemail.com')).toBe('abc@googlemail.com')
    expect(canonicalizeEmail('a.b.c@example.com')).toBe('a.b.c@example.com')
  })
  test('combined +tag and dots on gmail', () => {
    expect(canonicalizeEmail('first.last+filter@gmail.com')).toBe('firstlast@gmail.com')
  })
  test('no @ returns lowered', () => {
    expect(canonicalizeEmail('NotAnEmail')).toBe('notanemail')
  })
})
describe('sanitizeForDisplay', () => {
  test('escapes HTML brackets', () => {
    expect(sanitizeForDisplay('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
  test('truncates to max length', () => {
    expect(sanitizeForDisplay('a'.repeat(5000), 100)).toHaveLength(100)
  })
  test('non-string returns empty', () => {
    expect(sanitizeForDisplay(null)).toBe('')
    expect(sanitizeForDisplay(undefined)).toBe('')
    expect(sanitizeForDisplay(123)).toBe('')
  })
})
describe('sanitizeExternal', () => {
  test('strips HTML tags', () => {
    expect(sanitizeExternal('<b>hello</b>')).toBe('hello')
  })
  test('flattens markdown links to text', () => {
    expect(sanitizeExternal('see [docs](https://example.com)')).toBe('see docs')
  })
  test('removes code blocks', () => {
    expect(sanitizeExternal('text ```bad code``` more')).toContain('text')
    expect(sanitizeExternal('text ```bad code``` more')).not.toContain('bad code')
  })
  test('replaces shell-injection chars', () => {
    expect(sanitizeExternal('a | b ; c')).toBe('a , b , c')
  })
  test('truncates to default max 500', () => {
    expect(sanitizeExternal('a'.repeat(2000))).toHaveLength(500)
  })
})

import { describe, expect, test } from 'bun:test'
import { redactSecrets } from '../redact'
describe('redactSecrets', () => {
  test('redacts Anthropic API key', () => {
    const r = redactSecrets('use sk-ant-api03-abc123def456ghi789jkl012mno345')
    expect(r).toBe('use [REDACTED]')
  })
  test('redacts JWT', () => {
    const r = redactSecrets('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.something.signaturepart')
    expect(r).toBe('Bearer [REDACTED]')
  })
  test('redacts proxy token', () => {
    const r = redactSecrets('token=proxy:abc123:550e8400-e29b-41d4-a716-446655440000 trail')
    expect(r).toBe('token=[REDACTED] trail')
  })
  test('redacts E2B key', () => {
    const r = redactSecrets('key e2b_abcdefgh end')
    expect(r).toBe('key [REDACTED] end')
  })
  test('redacts AWS access key', () => {
    const r = redactSecrets('aws AKIAIOSFODNN7EXAMPLE end')
    expect(r).toBe('aws [REDACTED] end')
  })
  test('redacts Google API key', () => {
    const r = redactSecrets('key AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567 end')
    expect(r).toBe('key [REDACTED] end')
  })
  test('redacts GitHub token', () => {
    const r = redactSecrets('ghp_abcdefghijklmnopqrstuvwxyz0123456789 token')
    expect(r).toBe('[REDACTED] token')
  })
  test('redacts multiple secrets in one string', () => {
    const r = redactSecrets('a sk-ant-12345678 and AKIAIOSFODNN7EXAMPLE both')
    expect(r).toBe('a [REDACTED] and [REDACTED] both')
  })
  test('leaves clean text untouched', () => {
    expect(redactSecrets('hello world')).toBe('hello world')
    expect(redactSecrets('plain user data')).toBe('plain user data')
  })
})

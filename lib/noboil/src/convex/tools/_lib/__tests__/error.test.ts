import { describe, expect, it } from 'bun:test'
import { makeError, toDispatchError, ToolError } from '../error'
describe(makeError, () => {
  it('input category for INVALID_ARG (not retryable)', () => {
    const e = makeError({ code: 'INVALID_ARG', message: 'bad' })
    expect(e.category).toBe('input')
    expect(e.retryable).toBeFalsy()
  })
  it('transient category for RATE_LIMITED (retryable)', () => {
    const e = makeError({ code: 'RATE_LIMITED', message: 'slow down' })
    expect(e.category).toBe('transient')
    expect(e.retryable).toBeTruthy()
  })
  it('upstream category for UPSTREAM_ERROR (retryable)', () => {
    const e = makeError({ code: 'UPSTREAM_ERROR', message: 'tmdb 500' })
    expect(e.category).toBe('upstream')
    expect(e.retryable).toBeTruthy()
  })
  it('unknown code -> permanent', () => {
    const e = makeError({ code: 'CUSTOM_OOPS', message: 'no idea' })
    expect(e.category).toBe('permanent')
    expect(e.retryable).toBeFalsy()
  })
  it('details flow through', () => {
    const e = makeError({ code: 'INVALID_ARG', details: { field: 'x' }, message: 'bad' })
    expect(e.details).toStrictEqual({ field: 'x' })
  })
  type ErrorCategory = 'auth' | 'input' | 'permanent' | 'transient' | 'upstream'
  const mapping: [string, ErrorCategory, boolean][] = [
    ['AMBIGUOUS_COUNTRY', 'input', false],
    ['NOT_FOUND', 'input', false],
    ['UNAUTHORIZED', 'auth', false],
    ['FORBIDDEN', 'auth', false],
    ['INTERNAL_ERROR', 'permanent', false],
    ['PROVIDER_DISABLED', 'permanent', false],
    ['PROVIDER_DEGRADED', 'transient', true],
    ['FETCH_FAILED', 'upstream', true],
    ['EXTRACT_EXPIRED', 'permanent', false],
    ['EXTRACT_NOT_FOUND', 'permanent', false]
  ]
  for (const [code, category, retryable] of mapping)
    it(`${code} → ${category} retryable=${retryable}`, () => {
      const e = makeError({ code, message: 'x' })
      expect(e.category).toBe(category)
      expect(e.retryable).toBe(retryable)
    })
})
describe(toDispatchError, () => {
  it('toolError preserves code + details', () => {
    const e = toDispatchError(new ToolError('gone', { code: 'NOT_FOUND', details: { what: 'y' } }))
    expect(e.code).toBe('NOT_FOUND')
    expect(e.details).toStrictEqual({ what: 'y' })
  })
  it('plain Error -> INTERNAL_ERROR', () => {
    const e = toDispatchError(new Error('boom'))
    expect(e.code).toBe('INTERNAL_ERROR')
    expect(e.message).toBe('boom')
  })
  it('non-Error throwable -> INTERNAL_ERROR with stringified', () => {
    const e = toDispatchError('plain string')
    expect(e.code).toBe('INTERNAL_ERROR')
    expect(e.message).toBe('plain string')
  })
})
describe(ToolError, () => {
  it('cause flows to Error.cause', () => {
    const inner = new Error('inner')
    const e = new ToolError('wrap', { cause: inner, code: 'UPSTREAM_ERROR' })
    expect(e.cause).toBe(inner)
  })
})

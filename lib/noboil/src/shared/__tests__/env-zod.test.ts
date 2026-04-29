/** biome-ignore-all lint/style/noProcessEnv: test env mutation */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: test-only env keys */
/* oxlint-disable typescript-eslint(no-dynamic-delete) */
import { afterEach, describe, expect, test } from 'bun:test'
import { object, string } from 'zod/v4'
import { createEnv, createOptionalEnv } from '../env-zod'
describe('createEnv', () => {
  afterEach(() => {
    delete process.env.X_TEST_REQUIRED
    delete process.env.X_TEST_NUMBER
  })
  test('returns parsed value from process.env', () => {
    process.env.X_TEST_REQUIRED = 'hello'
    const env = createEnv(object({ X_TEST_REQUIRED: string().min(1) }))
    expect(env.X_TEST_REQUIRED).toBe('hello')
  })
  test('throws on schema parse failure', () => {
    delete process.env.X_TEST_REQUIRED
    const env = createEnv(object({ X_TEST_REQUIRED: string().min(1) }))
    expect(() => env.X_TEST_REQUIRED).toThrow()
  })
})
describe('createOptionalEnv', () => {
  afterEach(() => {
    delete process.env.X_OPT_KEY
  })
  test('returns env value when set', () => {
    process.env.X_OPT_KEY = 'present'
    const env = createOptionalEnv(object({ X_OPT_KEY: string().optional() }))
    expect(env.X_OPT_KEY).toBe('present')
  })
  test('returns undefined when env unset and no default', () => {
    delete process.env.X_OPT_KEY
    const env = createOptionalEnv(object({ X_OPT_KEY: string().optional() }))
    expect(env.X_OPT_KEY).toBeUndefined()
  })
  test('returns default when env unset', () => {
    delete process.env.X_OPT_KEY
    const env = createOptionalEnv(object({ X_OPT_KEY: string().optional() }), { X_OPT_KEY: 'fallback' })
    expect(env.X_OPT_KEY).toBe('fallback')
  })
  test('throws on unknown key', () => {
    const env = createOptionalEnv(object({ X_OPT_KEY: string().optional() }))
    expect(() => (env as Record<string, unknown>).UNKNOWN_KEY).toThrow(/unknown optional key/u)
  })
})

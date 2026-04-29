import { describe, expect, test } from 'bun:test'
import { consume, refill } from '../token-bucket'
const cfg = { limit: 10, windowMs: 1000 }
describe('refill', () => {
  test('null state initializes to limit', () => {
    const r = refill(null, cfg, 1000)
    expect(r.tokens).toBe(10)
    expect(r.refilledAt).toBe(1000)
  })
  test('refills at limit/windowMs rate', () => {
    const r = refill({ refilledAt: 0, tokens: 0 }, cfg, 500)
    expect(r.tokens).toBe(5)
  })
  test('caps at limit', () => {
    const r = refill({ refilledAt: 0, tokens: 8 }, cfg, 10_000)
    expect(r.tokens).toBe(10)
  })
  test('zero elapsed returns same tokens', () => {
    const r = refill({ refilledAt: 1000, tokens: 3 }, cfg, 1000)
    expect(r.tokens).toBe(3)
  })
})
describe('consume', () => {
  test('allows when tokens >= 1', () => {
    const r = consume({ refilledAt: 0, tokens: 5 }, cfg, 0)
    expect(r.allowed).toBe(true)
    expect(r.next.tokens).toBe(4)
  })
  test('denies when refilled < 1', () => {
    const r = consume({ refilledAt: 0, tokens: 0 }, cfg, 0)
    expect(r.allowed).toBe(false)
    expect(r.next.tokens).toBe(0)
  })
  test('refills before deciding', () => {
    const r = consume({ refilledAt: 0, tokens: 0 }, cfg, 200)
    expect(r.allowed).toBe(true)
    expect(r.next.tokens).toBeCloseTo(1, 5)
  })
  test('null state allows + decrements', () => {
    const r = consume(null, cfg, 1000)
    expect(r.allowed).toBe(true)
    expect(r.next.tokens).toBe(9)
  })
  test('repeated consume drains bucket', () => {
    let state: ReturnType<typeof consume>['next'] = { refilledAt: 0, tokens: 3 }
    let allowed = 0
    for (let i = 0; i < 10; i += 1) {
      const r = consume(state, cfg, 0)
      if (r.allowed) allowed += 1
      state = r.next
    }
    expect(allowed).toBe(3)
  })
})

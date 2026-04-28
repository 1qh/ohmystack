import { describe, expect, test } from 'bun:test'
import type { Lcg } from '../test/index'
import { advanceNow, createLcg, hermeticTry, restoreNow, setHermeticAdapter, setNow, withFakeNow } from '../test/index'
describe('hermetic adapter', () => {
  test('returns undefined when no adapter set', () => {
    setHermeticAdapter(null)
    expect(hermeticTry('any.op', { x: 1 })).toBeUndefined()
  })
  test('routes op + payload through adapter', () => {
    let seenOp = ''
    let seenPayload: unknown
    setHermeticAdapter((op, payload) => {
      seenOp = op
      seenPayload = payload
      return { ok: true }
    })
    const r = hermeticTry('foo.bar', { id: 42 }) as undefined | { ok: boolean }
    expect(seenOp).toBe('foo.bar')
    expect(seenPayload).toEqual({ id: 42 })
    expect(r).toEqual({ ok: true })
    setHermeticAdapter(null)
  })
  test('adapter returning undefined yields undefined', () => {
    setHermeticAdapter(() => undefined)
    expect(hermeticTry('x', null)).toBeUndefined()
    setHermeticAdapter(null)
  })
})
describe('LCG deterministic RNG', () => {
  test('same seed produces same sequence', () => {
    const a = createLcg(42)
    const b = createLcg(42)
    for (let i = 0; i < 100; i += 1) expect(a.next()).toBe(b.next())
  })
  test('different seeds produce different sequences', () => {
    const a = createLcg(1)
    const b = createLcg(2)
    let differs = 0
    for (let i = 0; i < 50; i += 1) if (a.next() !== b.next()) differs += 1
    expect(differs).toBeGreaterThan(40)
  })
  test('next() always in [0, 1)', () => {
    const r = createLcg(123)
    for (let i = 0; i < 1000; i += 1) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
  test('int(n) always in [0, n)', () => {
    const r = createLcg(7)
    for (let i = 0; i < 500; i += 1) {
      const v = r.int(10)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(10)
      expect(Number.isInteger(v)).toBe(true)
    }
  })
  test('pick selects from array uniformly enough', () => {
    const r: Lcg = createLcg(99)
    const items = ['a', 'b', 'c'] as const
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 3000; i += 1) {
      const v = r.pick(items)
      counts[v] = (counts[v] ?? 0) + 1
    }
    for (const k of items) expect(counts[k]).toBeGreaterThan(800)
  })
  test('pick on empty array throws', () => {
    const r = createLcg(0)
    expect(() => r.pick([])).toThrow('pick from empty array')
  })
  test('seed=0 still produces non-degenerate sequence', () => {
    const r = createLcg(0)
    const seen = new Set<number>()
    for (let i = 0; i < 10; i += 1) seen.add(r.next())
    expect(seen.size).toBe(10)
  })
})
describe('fake clock', () => {
  test('setNow + restoreNow', () => {
    const real = Date.now()
    setNow(1_000_000)
    expect(Date.now()).toBe(1_000_000)
    restoreNow()
    const after = Date.now()
    expect(Math.abs(after - real)).toBeLessThan(5000)
  })
  test('advanceNow adds to current fake time', () => {
    setNow(1000)
    advanceNow(500)
    expect(Date.now()).toBe(1500)
    advanceNow(250)
    expect(Date.now()).toBe(1750)
    restoreNow()
  })
  test('withFakeNow scopes the fake time', async () => {
    const real = Date.now()
    const r = await withFakeNow(42, () => {
      expect(Date.now()).toBe(42)
      return 'ok'
    })
    expect(r).toBe('ok')
    expect(Math.abs(Date.now() - real)).toBeLessThan(5000)
  })
  test('withFakeNow restores even on throw', async () => {
    const real = Date.now()
    await expect(
      withFakeNow(99, () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(Math.abs(Date.now() - real)).toBeLessThan(5000)
  })
})

import { describe, expect, test } from 'bun:test'
import { makeBudget, periodKeyFor } from '../server/budget'
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
describe('periodKeyFor', () => {
  test('day-aligned uses ISO date', () => {
    const t = Date.parse('2026-04-29T12:34:56Z')
    expect(periodKeyFor(t, DAY_MS)).toBe('2026-04-29')
  })
  test('day boundary rolls over at UTC midnight', () => {
    const before = Date.parse('2026-04-29T23:59:59Z')
    const after = Date.parse('2026-04-30T00:00:00Z')
    expect(periodKeyFor(before, DAY_MS)).toBe('2026-04-29')
    expect(periodKeyFor(after, DAY_MS)).toBe('2026-04-30')
  })
  test('hourly period returns numeric index', () => {
    const t = Date.parse('2026-04-29T12:00:00Z')
    const k = periodKeyFor(t, HOUR_MS)
    expect(k).toBe(String(Math.floor(t / HOUR_MS)))
  })
  test('same period yields same key for any time within', () => {
    const a = Date.parse('2026-04-29T00:00:00Z')
    const b = Date.parse('2026-04-29T23:59:59Z')
    expect(periodKeyFor(a, DAY_MS)).toBe(periodKeyFor(b, DAY_MS))
  })
})
describe('makeBudget shape', () => {
  interface Spec {
    args: unknown
    handler: unknown
    returns?: unknown
  }
  const mockMb = (spec: Spec): Spec => spec
  const mockQb = (spec: Spec): Spec => spec
  const mockBuilders = { m: mockMb, q: mockQb } as unknown as Parameters<typeof makeBudget>[0]['builders']
  test('returns reserve / settle / check / add / pruneStale / auditInvariants', () => {
    const result = makeBudget({
      builders: mockBuilders,
      cap: 2500,
      table: 'budget'
    })
    expect(Object.keys(result).toSorted()).toEqual(['add', 'auditInvariants', 'check', 'pruneStale', 'reserve', 'settle'])
  })
  test('respects custom periodMs', () => {
    const result = makeBudget({
      builders: mockBuilders,
      cap: 100,
      periodMs: HOUR_MS,
      table: 'hourly'
    })
    expect(result).toBeDefined()
  })
})

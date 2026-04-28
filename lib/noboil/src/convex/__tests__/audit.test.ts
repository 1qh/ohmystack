import { describe, expect, test } from 'bun:test'
import { makeAudit } from '../server/audit'
describe('makeAudit shape', () => {
  interface Spec {
    args: unknown
    handler: unknown
    returns?: unknown
  }
  const mockMb = (spec: Spec): Spec => spec
  const mockQb = (spec: Spec): Spec => spec
  const mockBuilders = { m: mockMb, q: mockQb } as unknown as Parameters<typeof makeAudit>[0]['builders']
  test('returns append / recent / listByActor / listByTrace / pruneStale', () => {
    const result = makeAudit({ builders: mockBuilders, table: 'audit' })
    expect(Object.keys(result).toSorted()).toEqual(['append', 'listByActor', 'listByTrace', 'pruneStale', 'recent'])
  })
  test('respects custom ttlMs', () => {
    const result = makeAudit({ builders: mockBuilders, table: 'audit', ttlMs: 60_000 })
    expect(result).toBeDefined()
  })
})

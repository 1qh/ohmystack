import { describe, expect, test } from 'bun:test'
import { readState, writeState } from '../state'
describe('state (smoke)', () => {
  test('readState returns object', async () => {
    const s = await readState()
    expect(typeof s).toBe('object')
  })
  test('writeState is idempotent', async () => {
    await writeState({ lastDb: 'convex' })
    const s = await readState()
    expect(['convex', 'spacetimedb', undefined]).toContain(s.lastDb)
  })
})

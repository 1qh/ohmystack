import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadHermeticFixtures } from '../test/fixtures'
import { hermeticTry, setHermeticAdapter } from '../test/hermetic'
afterEach(() => {
  setHermeticAdapter(null)
})
describe('loadHermeticFixtures', () => {
  test('serves op-level fixtures from JSON file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixtures-'))
    const path = join(dir, 'fixtures.json')
    writeFileSync(path, JSON.stringify({ 'svc.greet': { hello: 'world' } }))
    loadHermeticFixtures(path)
    expect(hermeticTry('svc.greet', null)).toEqual({ hello: 'world' })
    rmSync(dir, { force: true, recursive: true })
  })
  test('returns undefined for unmatched op', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixtures-'))
    const path = join(dir, 'fixtures.json')
    writeFileSync(path, JSON.stringify({ 'svc.a': 1 }))
    loadHermeticFixtures(path)
    expect(hermeticTry('svc.b', null)).toBeUndefined()
    rmSync(dir, { force: true, recursive: true })
  })
  test('matches payload-specific rules before fallback', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixtures-'))
    const path = join(dir, 'fixtures.json')
    writeFileSync(
      path,
      JSON.stringify({
        'svc.search': [{ match: 'target-key', response: { hits: [{ row: 1 }] } }, { response: { hits: [] } }]
      })
    )
    loadHermeticFixtures(path)
    const targetHit = hermeticTry('svc.search', { collection: 'target-key' }) as undefined | { hits: unknown[] }
    expect(targetHit?.hits).toHaveLength(1)
    const fallback = hermeticTry('svc.search', { collection: 'other' }) as undefined | { hits: unknown[] }
    expect(fallback?.hits).toHaveLength(0)
    rmSync(dir, { force: true, recursive: true })
  })
  test('rule with no match always matches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixtures-'))
    const path = join(dir, 'fixtures.json')
    writeFileSync(path, JSON.stringify({ 'svc.x': [{ response: 'always' }] }))
    loadHermeticFixtures(path)
    expect(hermeticTry('svc.x', { anything: 1 })).toBe('always')
    rmSync(dir, { force: true, recursive: true })
  })
})

/* oxlint-disable eslint-plugin-vitest(no-conditional-in-test) */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const BIN = join(import.meta.dir, '..', 'index.ts')
describe('noboil doctor --fix', () => {
  const dir = join(tmpdir(), `noboil-doctor-fix-${Date.now()}`)
  beforeEach(() => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { noboil: 'latest' }, name: 'test-project' }))
    writeFileSync(
      join(dir, '.noboilrc.json'),
      JSON.stringify({
        db: 'spacetimedb',
        includeDemos: false,
        scaffoldedAt: new Date().toISOString(),
        scaffoldedFrom: 'abc1234',
        version: 1
      })
    )
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }))
  })
  afterEach(() => {
    rmSync(dir, { force: true, recursive: true })
  })
  test('--fix patches tsconfig customConditions once', () => {
    spawnSync('bun', [BIN, 'doctor', '--fix'], { cwd: dir, encoding: 'utf8', timeout: 15_000 })
    const first = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8')) as {
      compilerOptions?: { customConditions?: string[] }
    }
    const firstConds = first.compilerOptions?.customConditions ?? []
    expect(firstConds.filter(c => c === 'noboil-spacetimedb').length).toBe(1)
    spawnSync('bun', [BIN, 'doctor', '--fix'], { cwd: dir, encoding: 'utf8', timeout: 15_000 })
    const second = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8')) as {
      compilerOptions?: { customConditions?: string[] }
    }
    const secondConds = second.compilerOptions?.customConditions ?? []
    expect(secondConds.filter(c => c === 'noboil-spacetimedb').length).toBe(1)
  })
})

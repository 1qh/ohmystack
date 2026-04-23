import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
const REPO = join(import.meta.dir, '..', '..')
const BIN = join(REPO, 'src', 'index.ts')
const CONVEX_BIN = join(REPO, 'src', 'convex', 'cli.ts')
const STDB_BIN = join(REPO, 'src', 'spacetimedb', 'cli.ts')
const run = (bin: string, args: string[]) => spawnSync('bun', [bin, ...args], { encoding: 'utf8', timeout: 10_000 })
describe('noboil bin smoke', () => {
  test('--help exits 0 and lists commands', () => {
    const r = run(BIN, ['--help'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('noboil')
    expect(r.stdout).toContain('init')
    expect(r.stdout).toContain('status')
    expect(r.stdout).toContain('add')
  })
  test('--version prints a semver', () => {
    const r = run(BIN, ['--version'])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/\d+\.\d+\.\d+/u)
  })
  test('init --help exits 0', () => {
    const r = run(BIN, ['init', '--help'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('--no-git')
  })
  test('doctor --help exits 0', () => {
    const r = run(BIN, ['doctor', '--help'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('--fix')
  })
  test('sync --help exits 0', () => {
    const r = run(BIN, ['sync', '--help'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('--dry-run')
  })
  test('eject --help exits 0', () => {
    const r = run(BIN, ['eject', '--help'])
    expect(r.status).toBe(0)
  })
  test('status --help exits 0', () => {
    const r = run(BIN, ['status', '--help'])
    expect(r.status).toBe(0)
  })
  test('upgrade --help exits 0', () => {
    const r = run(BIN, ['upgrade', '--help'])
    expect(r.status).toBe(0)
  })
  test('unknown command exits 1', () => {
    const r = run(BIN, ['nonsense'])
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('Unknown command')
  })
  test('completions bash prints script', () => {
    const r = run(BIN, ['completions', 'bash'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('_noboil()')
  })
})
describe('noboil-convex bin smoke', () => {
  test('--help exits 0', () => {
    const r = run(CONVEX_BIN, ['--help'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('noboil/convex')
  })
  test('--version prints semver', () => {
    const r = run(CONVEX_BIN, ['--version'])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/\d+\.\d+\.\d+/u)
  })
  test('add --help exits 0', () => {
    const r = run(CONVEX_BIN, ['add', '--help'])
    expect(r.status).toBe(0)
  })
})
describe('noboil-stdb bin smoke', () => {
  test('--help exits 0', () => {
    const r = run(STDB_BIN, ['--help'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('noboil-stdb')
  })
  test('--version prints semver', () => {
    const r = run(STDB_BIN, ['--version'])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/\d+\.\d+\.\d+/u)
  })
  test('add --help exits 0', () => {
    const r = run(STDB_BIN, ['add', '--help'])
    expect(r.status).toBe(0)
  })
})

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findProjectRoot, parseEnvFile } from '../env-file'
describe('parseEnvFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-test-'))
  const path = join(dir, '.env')
  test('parses key=value pairs', () => {
    writeFileSync(path, 'FOO=bar\nBAZ=qux\n')
    const r = parseEnvFile(path)
    expect(r.FOO).toBe('bar')
    expect(r.BAZ).toBe('qux')
  })
  test('strips quoted values', () => {
    writeFileSync(path, `WITH_QUOTES="hello world"\nWITH_TICKS='single'\n`)
    const r = parseEnvFile(path)
    expect(r.WITH_QUOTES).toBe('hello world')
    expect(r.WITH_TICKS).toBe('single')
  })
  test('skips comments and empty', () => {
    writeFileSync(path, '# comment\n\nA=1\n   \nB=2\n')
    const r = parseEnvFile(path)
    expect(r.A).toBe('1')
    expect(r.B).toBe('2')
    expect(Object.keys(r)).toHaveLength(2)
  })
  test('missing file returns empty record', () => {
    expect(parseEnvFile(join(dir, 'absent'))).toEqual({})
  })
  afterAll(() => {
    rmSync(dir, { force: true, recursive: true })
  })
})
describe('findProjectRoot', () => {
  test('finds nearest dir with marker', () => {
    const root = findProjectRoot(process.cwd(), ['package.json'])
    expect(root).toBeTruthy()
    expect(typeof root).toBe('string')
  })
  test('returns start when no marker found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-marker-'))
    const r = findProjectRoot(dir, ['nonexistent.marker'])
    expect(r).toBe(dir)
    rmSync(dir, { force: true, recursive: true })
  })
})

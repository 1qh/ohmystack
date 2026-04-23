import { file, write } from 'bun'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, loadConfig } from '../../config'
describe('defineConfig', () => {
  test('passes config through unchanged', () => {
    const c = defineConfig({ hooks: { afterAdd: () => undefined } })
    expect(typeof c.hooks?.afterAdd).toBe('function')
  })
})
describe('loadConfig', () => {
  const dir = join(tmpdir(), `noboil-config-test-${Date.now()}`)
  beforeEach(() => {
    mkdirSync(dir, { recursive: true })
  })
  afterEach(() => {
    rmSync(dir, { force: true, recursive: true })
  })
  test('returns null when no config file exists', async () => {
    const result = await loadConfig(dir)
    expect(result).toBe(null)
  })
  test('loads config.ts and exposes hooks', async () => {
    await write(
      join(dir, 'noboil.config.ts'),
      'export default { hooks: { afterAdd: (c) => { globalThis.__lastCtx = c } } }\n'
    )
    const result = await loadConfig(dir)
    expect(result).not.toBe(null)
    expect(typeof result?.hooks?.afterAdd).toBe('function')
  })
  test('checks file existence (smoke)', async () => {
    const probe = file(join(dir, 'noboil.config.ts'))
    expect(await probe.exists()).toBe(false)
  })
})

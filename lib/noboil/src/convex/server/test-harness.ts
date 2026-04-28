/** biome-ignore-all lint/style/noProcessEnv: test env reset */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: test env reset */
/* eslint-disable @typescript-eslint/no-dynamic-delete */
/* oxlint-disable typescript-eslint(no-dynamic-delete) */
import type { TestConvex } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'
import { Glob } from 'bun'
import { afterEach } from 'bun:test'
import { convexTest } from 'convex-test'
import { join } from 'node:path'
import { setHermeticAdapter } from '../../shared/test/hermetic'
interface TestHarness<S extends SchemaDefinition<GenericSchema, boolean>> {
  makeTest: () => TestConvex<S>
}
const createTestHarness = <S extends SchemaDefinition<GenericSchema, boolean>>({
  convexDir,
  envClear,
  schema
}: {
  convexDir: string
  envClear?: readonly string[]
  schema: S
}): TestHarness<S> => {
  for (const k of envClear ?? []) delete process.env[k]
  const loadModules = (): Record<string, () => Promise<Record<string, unknown>>> => {
    const out: Record<string, () => Promise<Record<string, unknown>>> = {}
    const glob = new Glob('**/*.{ts,js}')
    for (const rel of glob.scanSync({ cwd: convexDir })) {
      const abs = join(convexDir, rel)
      out[`../convex/${rel}`] = async () => (await import(abs)) as Record<string, unknown>
    }
    return out
  }
  const pending = new Set<TestConvex<S>>()
  afterEach(async () => {
    const ts = [...pending]
    pending.clear()
    await Promise.all(ts.map(async t => t.finishAllScheduledFunctions(() => undefined).catch(() => undefined)))
    setHermeticAdapter(null)
  })
  const makeTest = (): TestConvex<S> => {
    const t = convexTest(schema, loadModules()) as unknown as TestConvex<S>
    pending.add(t)
    return t
  }
  return { makeTest }
}
export type { TestHarness }
export { createTestHarness }

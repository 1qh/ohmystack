#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: consumer codegen reads CONVEX_DIR */
/* oxlint-disable eslint-plugin-unicorn(no-process-exit) */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { emitRegistry, emitToolCallers, emitToolTypes } from '../src/convex/tools/codegen/emit'
import { collect } from '../src/convex/tools/codegen/scan'
import { extractSchemas } from '../src/convex/tools/codegen/schema'
/** biome-ignore lint/style/noProcessEnv: CLI script env read */
const TOOLS_ROOT = resolve(process.cwd(), process.env.TOOLS_ROOT ?? 'convex/tools')
const GEN_DIR = resolve(TOOLS_ROOT, 'generated')
const OUT = resolve(GEN_DIR, 'registry.ts')
const TOOL_TYPES_OUT = resolve(GEN_DIR, 'toolTypes.ts')
const TOOL_CALLERS_OUT = resolve(GEN_DIR, 'toolCallers.ts')
const HASHES_OUT = resolve(GEN_DIR, 'schemaHashes.json')
const hashSchema = (s: unknown): string => createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 12)
const diffHashes = async (
  path: string,
  next: Record<string, string>
): Promise<{ added: string[]; changed: string[]; removed: string[] }> => {
  let prev: Record<string, string> = {}
  try {
    prev = JSON.parse(await readFile(path, 'utf8')) as Record<string, string>
  } catch {
    //
  }
  const added: string[] = []
  const changed: string[] = []
  const removed: string[] = []
  for (const [k, v] of Object.entries(next))
    if (!(k in prev)) added.push(k)
    else if (prev[k] !== v) changed.push(k)
  for (const k of Object.keys(prev)) if (!(k in next)) removed.push(k)
  return { added, changed, removed }
}
const main = async (): Promise<void> => {
  const data = await collect(TOOLS_ROOT)
  if (data.tools.length === 0) {
    console.error(`no tool files found under ${TOOLS_ROOT}/<provider>/`)
    process.exit(1)
  }
  console.log(`extracting handler return types for ${data.tools.length} tools via ts…`)
  const schemas = extractSchemas(data.tools.map(t => t.absPath))
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, emitRegistry({ ...data, schemas }))
  await writeFile(TOOL_TYPES_OUT, emitToolTypes(data.tools, schemas))
  await writeFile(TOOL_CALLERS_OUT, emitToolCallers(data.tools, schemas))
  const hashes: Record<string, string> = {}
  for (const t of data.tools) {
    const ex = schemas.get(t.absPath)
    if (ex) hashes[t.cliPath.join('.')] = hashSchema({ args: ex.args, schema: ex.schema })
  }
  const drift = await diffHashes(HASHES_OUT, hashes)
  await writeFile(HASHES_OUT, `${JSON.stringify(hashes, null, 2)}\n`)
  if (drift.added.length + drift.changed.length + drift.removed.length > 0) {
    console.log('\nschema drift:')
    for (const k of drift.added) console.log(`  + ${k}`)
    for (const k of drift.changed) console.log(`  ~ ${k}`)
    for (const k of drift.removed) console.log(`  - ${k}`)
  }
  console.log(`registry: ${data.providers.length} providers, ${data.tools.length} tools`)
  for (const t of data.tools) console.log(`  ${t.tier === 'admin' ? '[admin] ' : ''}${t.cliPath.join(' ')}`)
}
await main()

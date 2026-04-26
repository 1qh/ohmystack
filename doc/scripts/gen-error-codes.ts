#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/nursery/noContinue: simple parser */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const PATTERNS = [
  /err\('(?<code>[A-Z][A-Z_0-9]+)'\)/gu,
  /throw\s+new\s+\w*Error\(\s*'(?<code>[A-Z][A-Z_0-9]+)'/gu,
  /new\s+ConvexError\(\s*\{\s*code:\s*'(?<code>[A-Z][A-Z_0-9]+)'/gu,
  /throwConvexError\(\s*'(?<code>[A-Z][A-Z_0-9]+)'/gu
]
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full)
  }
  return out
}
const main = () => {
  const files = [
    ...walk(`${REPO}/lib/noboil/src/convex/server`),
    ...walk(`${REPO}/lib/noboil/src/spacetimedb/server`),
    ...walk(`${REPO}/lib/noboil/src/shared`)
  ]
  const codes = new Set<string>()
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const re of PATTERNS) {
      let m = re.exec(src)
      while (m) {
        if (m.groups?.code) codes.add(m.groups.code)
        m = re.exec(src)
      }
    }
  }
  const sorted = [...codes].toSorted()
  const body = ['| Code |', '|------|', ...sorted.map(c => `| \`${c}\` |`)].join('\n')
  const target = `${REPO}/doc/content/docs/api-reference.mdx`
  const dirty = replaceBetween(target, 'ERROR-CODES', body)
  console.log(dirty ? `Updated error codes (${sorted.length} codes)` : `Error codes up to date (${sorted.length} codes)`)
}
main()

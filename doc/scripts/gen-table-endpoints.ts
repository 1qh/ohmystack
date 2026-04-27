#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: parser */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const EXPORT_BLOCK_RE = /export\s*\{(?<syms>[^}]+)\}/u
const main = () => {
  const dir = `${REPO}/backend/convex/convex`
  const rows: string[] = []
  let totalEndpoints = 0
  let tableCount = 0
  for (const f of readdirSync(dir).toSorted()) {
    if (!f.endsWith('.ts') || f.startsWith('_') || f === 'schema.ts' || f === 'http.ts' || f === 'auth.ts') continue
    const src = readFileSync(`${dir}/${f}`, 'utf8')
    const m = EXPORT_BLOCK_RE.exec(src)
    if (!m?.groups?.syms) continue
    const names = m.groups.syms
      .split(',')
      .map(s => s.trim())
      .filter(s => s && s !== 'type')
      .toSorted()
    if (names.length === 0) continue
    tableCount += 1
    totalEndpoints += names.length
    const table = f.slice(0, -'.ts'.length)
    rows.push(`| \`${table}\` | ${names.length} | ${names.map(n => `\`${n}\``).join(', ')} |`)
  }
  const body = [
    `**${totalEndpoints} endpoints across ${tableCount} table modules** in \`backend/convex/convex/\`. Each row is a re-export aggregator combining factory-generated CRUD + custom \`pq\`/\`q\`/\`m\` builders.`,
    '',
    '| Module | Count | Endpoints |',
    '|---|--:|---|',
    ...rows
  ].join('\n')
  const target = `${REPO}/doc/content/docs/api-reference.mdx`
  const dirty = replaceBetween(target, 'TABLE-ENDPOINTS', body)
  console.log(dirty ? `Updated table endpoints (${totalEndpoints} across ${tableCount})` : 'Table endpoints up to date')
}
main()

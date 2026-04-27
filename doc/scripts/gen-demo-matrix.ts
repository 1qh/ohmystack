#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: helpers used per-file */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const DEMOS = ['blog', 'chat', 'movie', 'org', 'poll']
const TABLE_RE = /(?<name>\w+):\s*table\(s\.\w+(?:,\s*\{(?<opts>[^}]*)\})?/gu
const API_RE = /\bapi\.(?<name>\w+)\b/gu
const parseTables = (src: string): Map<string, string[]> => {
  const result = new Map<string, string[]>()
  let m = TABLE_RE.exec(src)
  while (m) {
    if (m.groups?.name) {
      const opts = m.groups.opts ?? ''
      const tags: string[] = []
      for (const tag of ['rateLimit', 'search', 'softDelete', 'pub', 'acl', 'key', 'cascade', 'unique', 'aclFrom'])
        if (opts.includes(tag)) tags.push(tag)
      result.set(m.groups.name, tags)
    }
    m = TABLE_RE.exec(src)
  }
  TABLE_RE.lastIndex = 0
  return result
}
const walkSrc = (dir: string, out: string[] = []): string[] => {
  if (!statSync(dir, { throwIfNoEntry: false })) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'module_bindings' || name.startsWith('.')) continue
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) walkSrc(full, out)
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full)
  }
  return out
}
const cvxTablesUsedBy = (root: string): Set<string> => {
  const used = new Set<string>()
  for (const file of walkSrc(root)) {
    const src = readFileSync(file, 'utf8')
    let m = API_RE.exec(src)
    while (m) {
      if (m.groups?.name) used.add(m.groups.name)
      m = API_RE.exec(src)
    }
    API_RE.lastIndex = 0
  }
  return used
}
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const stdbTablesUsedBy = (root: string, knownTables: string[]): Set<string> => {
  const used = new Set<string>()
  const sources = walkSrc(root)
    .map(f => readFileSync(f, 'utf8'))
    .join('\n')
  for (const t of knownTables) {
    const re = new RegExp(`\\btables\\.${t}\\b|\\breducers\\.\\w*${cap(t)}\\b|\\b${t}_\\w+\\b`, 'u')
    if (re.test(sources)) used.add(t)
  }
  return used
}
const main = () => {
  const cvxLazy = readFileSync(`${REPO}/backend/convex/lazy.ts`, 'utf8')
  const stdbLazy = readFileSync(`${REPO}/backend/spacetimedb/src/index.ts`, 'utf8')
  const cvxTables = parseTables(cvxLazy)
  const stdbTables = parseTables(stdbLazy)
  const allTables = [...new Set([...cvxTables.keys(), ...stdbTables.keys()])].toSorted()
  const demoUsage: Record<string, { cvx: Set<string>; stdb: Set<string> }> = {}
  for (const demo of DEMOS)
    demoUsage[demo] = {
      cvx: cvxTablesUsedBy(`${REPO}/web/cvx/${demo}`),
      stdb: stdbTablesUsedBy(`${REPO}/web/stdb/${demo}`, allTables)
    }
  const tableHeader = `| Table | Options | ${DEMOS.map(d => `cvx-${d}`).join(' | ')} | ${DEMOS.map(d => `stdb-${d}`).join(' | ')} |`
  const sep = `|---|---|${DEMOS.map(() => '--').join('|')}|${DEMOS.map(() => '--').join('|')}|`
  const rows = allTables.map(t => {
    const opts =
      [...new Set([...(cvxTables.get(t) ?? []), ...(stdbTables.get(t) ?? [])])]
        .toSorted()
        .map(o => `\`${o}\``)
        .join(', ') || '—'
    const cvxCells = DEMOS.map(d => (demoUsage[d]?.cvx.has(t) ? '✓' : '—')).join(' | ')
    const stdbCells = DEMOS.map(d => (demoUsage[d]?.stdb.has(t) ? '✓' : '—')).join(' | ')
    return `| \`${t}\` | ${opts} | ${cvxCells} | ${stdbCells} |`
  })
  const body = [
    `**${allTables.length} tables across ${DEMOS.length * 2} demo apps.** ✓ = the demo's frontend imports from this table.`,
    '',
    tableHeader,
    sep,
    ...rows
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'DEMO-MATRIX', body)
  console.log(
    dirty ? `Updated demo matrix (${allTables.length} tables × ${DEMOS.length * 2} apps)` : 'Demo matrix up to date'
  )
}
main()

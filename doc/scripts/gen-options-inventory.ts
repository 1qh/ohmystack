#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/performance/useTopLevelRegex: small file */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const TABLE_RE = /(?<name>\w+):\s*table\(s\.\w+(?:,\s*\{(?<opts>[\s\S]*?)\}\s*\))?/gu
const KNOWN_OPTS = [
  'rateLimit',
  'search',
  'softDelete',
  'pub',
  'acl',
  'aclFrom',
  'cascade',
  'key',
  'unique',
  'ttl',
  'staleWhileRevalidate'
] as const
type Opt = (typeof KNOWN_OPTS)[number]
const parse = (src: string): Map<string, Set<Opt>> => {
  const result = new Map<string, Set<Opt>>()
  let m = TABLE_RE.exec(src)
  while (m) {
    if (m.groups?.name) {
      const opts = m.groups.opts ?? ''
      const set = new Set<Opt>()
      for (const o of KNOWN_OPTS) if (opts.includes(`${o}:`)) set.add(o)
      result.set(m.groups.name, set)
    }
    m = TABLE_RE.exec(src)
  }
  TABLE_RE.lastIndex = 0
  return result
}
const main = () => {
  const cvx = parse(readFileSync(`${REPO}/backend/convex/lazy.ts`, 'utf8'))
  const stdb = parse(readFileSync(`${REPO}/backend/spacetimedb/src/index.ts`, 'utf8'))
  const counts: Record<Opt, { cvx: string[]; stdb: string[] }> = Object.fromEntries(
    KNOWN_OPTS.map(o => [o, { cvx: [] as string[], stdb: [] as string[] }])
  ) as Record<Opt, { cvx: string[]; stdb: string[] }>
  for (const [name, set] of cvx) for (const o of set) counts[o].cvx.push(name)
  for (const [name, set] of stdb) for (const o of set) counts[o].stdb.push(name)
  const rows = KNOWN_OPTS.map(o => {
    const c = counts[o].cvx.toSorted()
    const s = counts[o].stdb.toSorted()
    return `| \`${o}\` | ${c.length} | ${s.length} | ${c.length === 0 ? '—' : c.map(t => `\`${t}\``).join(', ')} | ${s.length === 0 ? '—' : s.map(t => `\`${t}\``).join(', ')} |`
  })
  const body = [
    `**${KNOWN_OPTS.length} known table options** scanned across both backend lazy.ts files. Numbers are how many tables enable each option.`,
    '',
    '| Option | cvx tables | stdb tables | Where (cvx) | Where (stdb) |',
    '|---|--:|--:|---|---|',
    ...rows
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'OPTIONS-INVENTORY', body)
  console.log(dirty ? `Updated options inventory (${KNOWN_OPTS.length} options)` : 'Options inventory up to date')
}
main()

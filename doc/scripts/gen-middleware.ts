#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/performance/useTopLevelRegex: small file */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const MIDDLEWARE_RE = /(?:\/\*\*\s*(?<doc>[^*]+?)\s*\*\/\s*)?const (?<name>\w+) = \((?<args>[^)]*)\):\s*Middleware\b/gu
const escapeMd = (s: string): string =>
  s
    .replaceAll('|', String.raw`\|`)
    .replaceAll('{', String.raw`\{`)
    .replaceAll('}', String.raw`\}`)
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
interface MwInfo {
  args: string
  doc: string
  name: string
}
const extract = (src: string): MwInfo[] => {
  const out: MwInfo[] = []
  let m = MIDDLEWARE_RE.exec(src)
  while (m) {
    if (m.groups?.name)
      out.push({
        args: (m.groups.args ?? '').trim() || '()',
        doc: (m.groups.doc ?? '').replaceAll(/\s+/gu, ' ').trim(),
        name: m.groups.name
      })
    m = MIDDLEWARE_RE.exec(src)
  }
  MIDDLEWARE_RE.lastIndex = 0
  return out
}
const main = () => {
  const cvx = extract(readFileSync(`${REPO}/lib/noboil/src/convex/server/middleware.ts`, 'utf8'))
  const stdb = extract(readFileSync(`${REPO}/lib/noboil/src/spacetimedb/server/middleware.ts`, 'utf8'))
  const all = [...new Set([...cvx, ...stdb].map(mw => mw.name))].toSorted()
  const infoByName = new Map<string, MwInfo>()
  for (const mw of [...cvx, ...stdb]) if (!infoByName.has(mw.name) || mw.doc) infoByName.set(mw.name, mw)
  const cvxNames = new Set(cvx.map(mw => mw.name))
  const stdbNames = new Set(stdb.map(mw => mw.name))
  const rows = all.map(name => {
    const info = infoByName.get(name)
    const args = info?.args ?? '()'
    const desc = info?.doc ? escapeMd(info.doc) : '_(no JSDoc)_'
    return `| \`${name}\` | \`${escapeMd(args)}\` | ${cvxNames.has(name) ? '✓' : '—'} | ${stdbNames.has(name) ? '✓' : '—'} | ${desc} |`
  })
  const body = [
    `**${all.length} middleware factories** (combine via \`middleware: [a(), b()]\` in \`noboil({ ... })\`). Description column auto-extracted from leading JSDoc.`,
    '',
    '| Factory | Options arg | Convex | SpacetimeDB | Description |',
    '|---|---|---|---|---|',
    ...rows
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'MIDDLEWARE', body)
  console.log(dirty ? `Updated middleware reference (${all.length})` : `Middleware reference up to date (${all.length})`)
}
main()

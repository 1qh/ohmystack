#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/performance/useTopLevelRegex: small file */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const MIDDLEWARE_RE = /const (?<name>\w+) = \((?<args>[^)]*)\):\s*Middleware\b/gu
const escapeMd = (s: string): string =>
  s
    .replaceAll('|', String.raw`\|`)
    .replaceAll('{', String.raw`\{`)
    .replaceAll('}', String.raw`\}`)
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
const extract = (src: string): { args: string; name: string }[] => {
  const out: { args: string; name: string }[] = []
  let m = MIDDLEWARE_RE.exec(src)
  while (m) {
    if (m.groups?.name) out.push({ args: (m.groups.args ?? '').trim() || '()', name: m.groups.name })
    m = MIDDLEWARE_RE.exec(src)
  }
  MIDDLEWARE_RE.lastIndex = 0
  return out
}
const main = () => {
  const cvx = extract(readFileSync(`${REPO}/lib/noboil/src/convex/server/middleware.ts`, 'utf8'))
  const stdb = extract(readFileSync(`${REPO}/lib/noboil/src/spacetimedb/server/middleware.ts`, 'utf8'))
  const all = [...new Set([...cvx, ...stdb].map(m => m.name))].toSorted()
  const sigByName = new Map<string, string>()
  for (const m of [...cvx, ...stdb]) if (!sigByName.has(m.name)) sigByName.set(m.name, m.args)
  const cvxNames = new Set(cvx.map(m => m.name))
  const stdbNames = new Set(stdb.map(m => m.name))
  const rows = all.map(name => {
    const args = sigByName.get(name) ?? '()'
    return `| \`${name}\` | \`${escapeMd(args)}\` | ${cvxNames.has(name) ? '✓' : '—'} | ${stdbNames.has(name) ? '✓' : '—'} |`
  })
  const body = [
    `**${all.length} middleware factories** (combine via \`middleware: [a(), b()]\` in \`noboil({ ... })\`).`,
    '',
    '| Factory | Options arg | Convex | SpacetimeDB |',
    '|---|---|---|---|',
    ...rows
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'MIDDLEWARE', body)
  console.log(dirty ? `Updated middleware reference (${all.length})` : `Middleware reference up to date (${all.length})`)
}
main()

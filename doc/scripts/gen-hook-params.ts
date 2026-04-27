#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const escapeMd = (s: string): string =>
  s
    .replaceAll('|', String.raw`\|`)
    .replaceAll('{', String.raw`\{`)
    .replaceAll('}', String.raw`\}`)
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
const HOOK_RE = /const (?<name>use[A-Z]\w*)\s*=\s*(?:<[^>]+>\s*)?\(/gu
const balancedParens = (src: string, openIdx: number): string => {
  let depth = 1
  let i = openIdx + 1
  while (i < src.length && depth > 0) {
    if (src[i] === '(') depth += 1
    else if (src[i] === ')') depth -= 1
    i += 1
  }
  return src.slice(openIdx + 1, i - 1)
}
const extractHookSigs = (src: string): { args: string; name: string }[] => {
  const out: { args: string; name: string }[] = []
  let m = HOOK_RE.exec(src)
  while (m) {
    if (m.groups?.name) {
      const openIdx = src.indexOf('(', m.index + m[0].length - 1)
      if (openIdx !== -1) {
        const params = balancedParens(src, openIdx).replaceAll(/\s+/gu, ' ').trim()
        out.push({ args: params || '()', name: m.groups.name })
      }
    }
    m = HOOK_RE.exec(src)
  }
  HOOK_RE.lastIndex = 0
  return out
}
const collect = (kind: 'convex' | 'spacetimedb'): { args: string; name: string }[] => {
  const dir = `${REPO}/lib/noboil/src/${kind}/react`
  const out: { args: string; name: string }[] = []
  for (const f of readdirSync(dir)) {
    if (!(f.startsWith('use-') && f.endsWith('.ts') && !f.endsWith('.test.ts'))) continue
    for (const sig of extractHookSigs(readFileSync(`${dir}/${f}`, 'utf8'))) out.push(sig)
  }
  return out.toSorted((a, b) => a.name.localeCompare(b.name))
}
const main = () => {
  const cvx = collect('convex')
  const stdb = collect('spacetimedb')
  const cvxRows = cvx.map(h => `| \`${h.name}\` | \`(${escapeMd(h.args)})\` |`)
  const stdbRows = stdb.map(h => `| \`${h.name}\` | \`(${escapeMd(h.args)})\` |`)
  const body = [
    "<Tabs groupId=\"db\" items={['Convex', 'SpacetimeDB']} persist>",
    '<Tab value="Convex">',
    '',
    `**${cvx.length} hooks** (parameter list before generic constraints):`,
    '',
    '| Hook | Params |',
    '|---|---|',
    ...cvxRows,
    '',
    '</Tab>',
    '<Tab value="SpacetimeDB">',
    '',
    `**${stdb.length} hooks**:`,
    '',
    '| Hook | Params |',
    '|---|---|',
    ...stdbRows,
    '',
    '</Tab>',
    '</Tabs>'
  ].join('\n')
  const target = `${REPO}/doc/content/docs/api-reference.mdx`
  const dirty = replaceBetween(target, 'HOOK-PARAMS', body)
  console.log(dirty ? `Updated hook params (${cvx.length} cvx + ${stdb.length} stdb)` : 'Hook params up to date')
}
main()

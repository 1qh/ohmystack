#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const EXPORT_BRACE_RE = /export\s+\{(?<syms>[^}]+)\}/gu
const EXPORT_DECL_RE = /export\s+(?:const|function|class|default\s+(?:const|function|class)|default)\s+(?<name>\w+)/gu
const collectExports = (path: string): Set<string> => {
  const out = new Set<string>()
  if (!statSync(path, { throwIfNoEntry: false })) return out
  const src = readFileSync(path, 'utf8')
  let m = EXPORT_BRACE_RE.exec(src)
  while (m) {
    if (m.groups?.syms)
      for (const part of m.groups.syms.split(',')) {
        const t = part.trim()
        if (!t) continue
        const idx = t.indexOf(' as ')
        const name = idx === -1 ? t.replace(/^type\s+/u, '') : t.slice(idx + 4).trim()
        if (name && name !== 'type') out.add(name)
      }
    m = EXPORT_BRACE_RE.exec(src)
  }
  EXPORT_BRACE_RE.lastIndex = 0
  let dm = EXPORT_DECL_RE.exec(src)
  while (dm) {
    if (dm.groups?.name) out.add(dm.groups.name)
    dm = EXPORT_DECL_RE.exec(src)
  }
  EXPORT_DECL_RE.lastIndex = 0
  return out
}
interface CompFile {
  exports: Set<string>
  lines: number
}
const inspect = (root: string, file: string): CompFile => {
  const path = `${root}/${file}`
  if (!statSync(path, { throwIfNoEntry: false })) return { exports: new Set(), lines: 0 }
  return { exports: collectExports(path), lines: readFileSync(path, 'utf8').split('\n').length }
}
const main = () => {
  const cvxRoot = `${REPO}/lib/noboil/src/convex/components`
  const stdbRoot = `${REPO}/lib/noboil/src/spacetimedb/components`
  const cvxFiles = readdirSync(cvxRoot)
    .filter(f => f.endsWith('.tsx') || f === 'index.ts')
    .toSorted()
  const stdbFiles = readdirSync(stdbRoot)
    .filter(f => f.endsWith('.tsx') || f === 'index.ts')
    .toSorted()
  const allFiles = [...new Set([...cvxFiles, ...stdbFiles])].toSorted()
  const rows: string[] = []
  let perfect = 0
  for (const f of allFiles) {
    const c = inspect(cvxRoot, f)
    const s = inspect(stdbRoot, f)
    const cvxHas = cvxFiles.includes(f)
    const stdbHas = stdbFiles.includes(f)
    const shared = [...c.exports].filter(e => s.exports.has(e))
    const cvxOnly = [...c.exports].filter(e => !s.exports.has(e))
    const stdbOnly = [...s.exports].filter(e => !c.exports.has(e))
    const allOk = cvxHas && stdbHas && cvxOnly.length === 0 && stdbOnly.length === 0
    if (allOk) perfect += 1
    const status = allOk ? '🟢' : '🟡'
    rows.push(
      `| \`${f}\` | ${cvxHas ? '✓' : '✗'} ${c.lines}L | ${stdbHas ? '✓' : '✗'} ${s.lines}L | ${shared.length} | ${
        cvxOnly.length === 0
          ? '—'
          : cvxOnly
              .toSorted()
              .map(e => `\`${e}\``)
              .join(', ')
      } | ${
        stdbOnly.length === 0
          ? '—'
          : stdbOnly
              .toSorted()
              .map(e => `\`${e}\``)
              .join(', ')
      } | ${status} |`
    )
  }
  const body = [
    'Per-file React component parity. Each `*.tsx` in `lib/noboil/src/{convex,spacetimedb}/components/` cross-checked. Shared = symbol present in both files; -only = symbol present in only one.',
    '',
    `**${perfect}/${allFiles.length} component files at full parity.**`,
    '',
    '| File | cvx | stdb | shared exports | cvx-only | stdb-only | status |',
    '|---|---|---|--:|---|---|--|',
    ...rows
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'COMPONENT-PARITY', body)
  if (dirty) console.log(`Updated component parity (${perfect}/${allFiles.length} full)`)
}
main()

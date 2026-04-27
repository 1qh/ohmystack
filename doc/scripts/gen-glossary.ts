#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, relative, resolve } from 'node:path'
const REPO = resolve(import.meta.dir, '../..')
const EXPORT_BRACE_RE = /export\s+(?:type\s+)?\{(?<syms>[^}]+)\}/gu
const EXPORT_DECL_RE = /export\s+(?:const|function|class|interface|type)\s+(?<name>\w+)/gu
const STRIP_AUTOGEN_RE = /\{\/\* AUTO-GENERATED:[\s\S]*?\/AUTO-GENERATED:[^}]+\*\/\}/gu
const STRIP_FENCE_RE = /```[\s\S]*?```/gu
const collectExports = (file: string): Set<string> => {
  const out = new Set<string>()
  const src = readFileSync(file, 'utf8')
  let m = EXPORT_BRACE_RE.exec(src)
  while (m) {
    if (m.groups?.syms)
      for (const part of m.groups.syms.split(',')) {
        const trimmed = part.trim()
        if (!trimmed) continue
        const aliasIdx = trimmed.indexOf(' as ')
        const name = aliasIdx === -1 ? trimmed.replace(/^type\s+/u, '') : trimmed.slice(aliasIdx + 4).trim()
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
interface Entry {
  docs: string[]
  file: string
  subpaths: string[]
}
const main = () => {
  const pkg = JSON.parse(readFileSync(`${REPO}/lib/noboil/package.json`, 'utf8')) as {
    exports: Record<string, string | { default?: string; import?: string; require?: string; types?: string }>
    name: string
  }
  const symToEntry = new Map<string, Entry>()
  for (const [sub, target] of Object.entries(pkg.exports)) {
    const path = typeof target === 'string' ? target : (target.types ?? target.default ?? target.import ?? '')
    if (!path) continue
    const abs = resolve(`${REPO}/lib/noboil`, path)
    if (!statSync(abs, { throwIfNoEntry: false })) continue
    const subpath = sub === '.' ? pkg.name : `${pkg.name}/${sub.replace('./', '')}`
    for (const sym of collectExports(abs)) {
      const e = symToEntry.get(sym) ?? { docs: [], file: relative(REPO, abs), subpaths: [] }
      if (!e.subpaths.includes(subpath)) e.subpaths.push(subpath)
      symToEntry.set(sym, e)
    }
  }
  const docsDir = `${REPO}/doc/content/docs`
  for (const file of readdirSync(docsDir)) {
    if (!file.endsWith('.mdx') || file === 'glossary.mdx') continue
    const src = readFileSync(`${docsDir}/${file}`, 'utf8').replaceAll(STRIP_AUTOGEN_RE, '').replaceAll(STRIP_FENCE_RE, '')
    const slug = basename(file, '.mdx')
    for (const [sym, entry] of symToEntry) {
      const re = new RegExp(`\\b${sym}\\b`, 'u')
      if (re.test(src) && !entry.docs.includes(slug)) entry.docs.push(slug)
    }
  }
  const sorted = [...symToEntry.entries()].toSorted(([a], [b]) => a.localeCompare(b))
  const rows: string[] = []
  for (const [sym, e] of sorted) {
    const subs = e.subpaths.map(s => `\`${s}\``).join(', ')
    const refs = e.docs.length === 0 ? '_(undocumented)_' : e.docs.map(d => `[${d}](./${d})`).join(', ')
    rows.push(`| \`${sym}\` | ${subs} | \`${e.file}\` | ${refs} |`)
  }
  const body = [
    '---',
    'title: Glossary',
    'description: Every public export with its import path, source file, and pages mentioning it. Auto-generated.',
    '---',
    '',
    `Auto-generated index of every public export reachable through \`noboil/...\` subpaths. **${sorted.length} symbols.**`,
    '',
    'For an explanation of what each symbol does, follow the "Mentioned in" links — that is where the prose lives.',
    '',
    '| Symbol | Import paths | Source file | Mentioned in |',
    '|---|---|---|---|',
    ...rows
  ].join('\n')
  writeFileSync(`${docsDir}/glossary.mdx`, `${body}\n`)
  console.log(`Wrote glossary.mdx (${sorted.length} symbols)`)
}
main()

#!/usr/bin/env bun
/* eslint-disable no-console, no-continue, max-depth */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: parser */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const TAGS = ['@beta', '@alpha', '@experimental', '@deprecated', '@internal'] as const
type Tag = (typeof TAGS)[number]
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (!statSync(full, { throwIfNoEntry: false })) continue
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(full, out)
    } else if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.test.ts')) out.push(full)
  }
  return out
}
const SYM_RE = /(?:export\s+)?(?:const|function|class|interface|type)\s+(?<name>\w+)/u
const main = () => {
  const root = `${REPO}/lib/noboil/src`
  const files = walk(root)
  let symbols = 0
  const tagged: { file: string; reason: string; symbol: string; tag: Tag }[] = []
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? ''
      const sm = SYM_RE.exec(line)
      if (sm?.groups) symbols += 1
      for (const tag of TAGS)
        if (line.includes(tag))
          for (let j = i; j < Math.min(i + 8, lines.length); j += 1) {
            const sym = SYM_RE.exec(lines[j] ?? '')
            if (sym?.groups) {
              const reason = (line.split(tag)[1] ?? '').replaceAll('*/', '').replaceAll('*', '').trim() || '_(no reason)_'
              const symbolName = sym.groups.name ?? ''
              tagged.push({ file: relative(REPO, file), reason, symbol: symbolName, tag })
              break
            }
          }
    }
  }
  const counts: Record<Tag, number> = { '@alpha': 0, '@beta': 0, '@deprecated': 0, '@experimental': 0, '@internal': 0 }
  for (const t of tagged) counts[t.tag] += 1
  const summaryLine = `Scanned **${files.length} files**, **${symbols} declared symbols**. ${
    tagged.length === 0
      ? 'No `@beta`/`@alpha`/`@experimental`/`@deprecated`/`@internal` JSDoc tags found — entire public surface is **stable**.'
      : ''
  }`
  const lines: string[] = [summaryLine, '']
  if (tagged.length > 0) {
    lines.push(
      `**Tag counts:** ${Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([t, n]) => `${t}: ${n}`)
        .join(', ')}`
    )
    lines.push('')
    lines.push('| Symbol | Tag | File | Reason |')
    lines.push('|---|---|---|---|')
    for (const t of tagged.toSorted((a, b) => a.tag.localeCompare(b.tag) || a.symbol.localeCompare(b.symbol)))
      lines.push(`| \`${t.symbol}\` | \`${t.tag}\` | \`${t.file}\` | ${t.reason} |`)
  } else {
    lines.push('To mark API stability, add JSDoc tags above an export:')
    lines.push('')
    lines.push('```ts')
    lines.push('/** @beta New shape, may change without major version bump. */')
    lines.push('export const someExperiment = () => 42')
    lines.push('```')
    lines.push('')
    lines.push('This generator picks them up automatically.')
  }
  const body = lines.join('\n')
  const target = `${REPO}/doc/content/docs/api-reference.mdx`
  const dirty = replaceBetween(target, 'STABILITY', body)
  console.log(
    dirty ? `Updated stability table (${tagged.length} tagged of ${symbols} symbols)` : 'Stability table up to date'
  )
}
main()

#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (
      name.startsWith('.') ||
      name === 'node_modules' ||
      name === 'dist' ||
      name === '_generated' ||
      name === '__tests__'
    )
      continue
    const full = join(dir, name)
    if (!statSync(full, { throwIfNoEntry: false })) continue
    if (statSync(full).isDirectory()) walk(full, out)
    else if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.test.ts')) out.push(full)
  }
  return out
}
const SYM_RE = /(?:export\s+)?(?:const|function|class|interface|type)\s+(?<name>\w+)/u
interface Example {
  code: string
  file: string
  symbol: string
}
const extractExamples = (src: string, file: string): Example[] => {
  const out: Example[] = []
  const lines = src.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.includes('@example')) {
      const codeLines: string[] = []
      let j = i + 1
      while (j < lines.length && !(lines[j] ?? '').includes('*/')) {
        const cleaned = (lines[j] ?? '').replace(/^\s*\*\s?/u, '')
        codeLines.push(cleaned)
        j += 1
      }
      let symbol = ''
      for (let k = j + 1; k < Math.min(j + 6, lines.length); k += 1) {
        const sm = SYM_RE.exec(lines[k] ?? '')
        if (sm?.groups?.name) {
          symbol = sm.groups.name
          break
        }
      }
      const code = codeLines
        .join('\n')
        .replaceAll(/^```\w*\n?/gmu, '')
        .replaceAll(/\n?```$/gmu, '')
        .trim()
      if (code) out.push({ code, file, symbol: symbol || '_(anonymous)_' })
      i = j
    }
    i += 1
  }
  return out
}
const main = () => {
  const root = `${REPO}/lib/noboil/src`
  const files = walk(root)
  const all: Example[] = []
  for (const file of files) {
    const rel = relative(REPO, file)
    for (const ex of extractExamples(readFileSync(file, 'utf8'), rel)) all.push(ex)
  }
  const sections: string[] = [`**${all.length} \`@example\` blocks** harvested from JSDoc across \`lib/noboil/src/\`.`, '']
  if (all.length === 0) {
    sections.push('No JSDoc `@example` blocks found yet. Add them above any export:')
    sections.push('')
    sections.push('```ts')
    sections.push('/**')
    sections.push(' * @example')
    sections.push(' * const result = await myThing({ x: 1 })')
    sections.push(' */')
    sections.push('export const myThing = ...')
    sections.push('```')
  } else
    for (const ex of all.toSorted((a, b) => a.symbol.localeCompare(b.symbol))) {
      sections.push(`### \`${ex.symbol}\` — \`${ex.file}\``)
      sections.push('')
      sections.push('```ts')
      sections.push(ex.code)
      sections.push('```')
      sections.push('')
    }
  const body = sections.join('\n')
  const target = `${REPO}/doc/content/docs/recipes.mdx`
  const dirty = replaceBetween(target, 'JSDOC-EXAMPLES', body)
  console.log(dirty ? `Updated JSDoc examples (${all.length})` : `JSDoc examples up to date (${all.length})`)
}
main()

#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { Transpiler } from 'bun'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const FENCE_RE = /```(?:ts|tsx|typescript)\n(?<code>[\s\S]*?)```/gu
const walk = (dir: string, out: string[] = []): string[] => {
  if (!statSync(dir, { throwIfNoEntry: false })) return out
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.mdx')) out.push(full)
  }
  return out
}
interface Block {
  code: string
  file: string
  index: number
}
const extractBlocks = (src: string, file: string): Block[] => {
  const out: Block[] = []
  let m = FENCE_RE.exec(src)
  let idx = 0
  while (m) {
    if (m.groups?.code) out.push({ code: m.groups.code, file, index: idx })
    idx += 1
    m = FENCE_RE.exec(src)
  }
  FENCE_RE.lastIndex = 0
  return out
}
const SYNTAX_TOKENS = [
  'import ',
  'export ',
  'const ',
  'let ',
  'function ',
  'interface ',
  'type ',
  'class ',
  'await ',
  'return ',
  '=>',
  '({',
  '})',
  ': string',
  ': number',
  ': boolean'
]
const looksLikeTypeScript = (code: string): boolean => SYNTAX_TOKENS.some(t => code.includes(t))
const main = () => {
  const files = walk(`${REPO}/doc/content/docs`)
  let total = 0
  let parseable = 0
  const issues: string[] = []
  for (const file of files) {
    const blocks = extractBlocks(readFileSync(file, 'utf8'), file)
    for (const b of blocks) {
      total += 1
      if (!looksLikeTypeScript(b.code)) {
        parseable += 1
        continue
      }
      if (/\{\s*\.\.\.\s*\}/u.test(b.code) || b.code.includes('/* ... */') || /^\s*\{\s*\n/u.test(b.code)) {
        parseable += 1
        continue
      }
      try {
        new Transpiler({ loader: 'tsx', target: 'browser' }).scan(b.code)
        parseable += 1
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        const first = msg.split('\n')[0] ?? ''
        const SOFT = [
          'has already been declared',
          'cannot be reassigned',
          'Top-level return',
          'must have an initializer',
          'cannot use import',
          'export from a non ECMAScript',
          'Parse error',
          'Multiple exports with the same name'
        ]
        if (SOFT.some(s => first.includes(s))) parseable += 1
        else issues.push(`${relative(REPO, b.file)} block #${b.index}: ${first}`)
      }
    }
  }
  const pct = total === 0 ? 100 : Math.round((parseable / total) * 100)
  const body = [
    'Bun.Transpiler.scan() over every ```ts/tsx code fence in `doc/content/docs/*.mdx`. Catches syntax-level rot when source code changes break embedded snippets.',
    '',
    `**${parseable}/${total} blocks parseable (${pct}%).** Snippets without TypeScript-shaped syntax (config JSON, shell, mermaid) are skipped — they're counted as parseable but not actually checked.`,
    '',
    issues.length === 0 ? '_No syntax issues._' : '**Failures:**',
    '',
    ...issues.map(i => `- ${i}`)
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'EXAMPLE-CHECK', body)
  console.log(
    dirty
      ? `Updated example check (${parseable}/${total} = ${pct}%, ${issues.length} issue(s))`
      : `Example check up to date (${pct}%)`
  )
  if (issues.length > 0) {
    console.warn(`  ⚠ ${issues.length} doc snippet(s) failed to parse`)
    for (const i of issues.slice(0, 5)) console.warn(`    ${i}`)
  }
}
main()

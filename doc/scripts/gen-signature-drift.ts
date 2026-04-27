#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
interface Hook {
  args: string
  file: string
  name: string
}
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
const collectHooks = (root: string): Hook[] => {
  const out: Hook[] = []
  if (!statSync(root, { throwIfNoEntry: false })) return out
  for (const f of readdirSync(root)) {
    if (!(f.startsWith('use-') && f.endsWith('.ts')) || f.endsWith('.test.ts')) continue
    const src = readFileSync(`${root}/${f}`, 'utf8')
    let m = HOOK_RE.exec(src)
    while (m) {
      if (m.groups?.name) {
        const openIdx = src.indexOf('(', m.index + m[0].length - 1)
        if (openIdx !== -1) {
          const params = balancedParens(src, openIdx).replaceAll(/\s+/gu, ' ').trim()
          out.push({ args: params || '', file: relative(REPO, `${root}/${f}`), name: m.groups.name })
        }
      }
      m = HOOK_RE.exec(src)
    }
    HOOK_RE.lastIndex = 0
  }
  return out
}
const walkDocs = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walkDocs(full, out)
    else if (name.endsWith('.mdx')) out.push(full)
  }
  return out
}
const main = () => {
  const sources = [
    ...collectHooks(`${REPO}/lib/noboil/src/convex/react`),
    ...collectHooks(`${REPO}/lib/noboil/src/spacetimedb/react`)
  ]
  const docFiles = walkDocs(`${REPO}/doc/content/docs`)
  const allDocText = docFiles.map(f => readFileSync(f, 'utf8')).join('\n')
  const issues: string[] = []
  let mentioned = 0
  let withDecl = 0
  let drift = 0
  for (const hook of sources) {
    const re = new RegExp(`\\b${hook.name}\\b`, 'u')
    if (!re.test(allDocText)) continue
    mentioned += 1
    const declRe = new RegExp(`(?:const|function)\\s+${hook.name}\\s*=?\\s*(?:<[^>]+>)?\\s*\\(([^)]{0,300})\\)`, 'gu')
    let dm = declRe.exec(allDocText)
    while (dm) {
      withDecl += 1
      const docArgs = (dm[1] ?? '').trim()
      const docFirst = docArgs.split(',')[0]?.trim() ?? ''
      const srcFirst = hook.args.split(',')[0]?.trim() ?? ''
      const docName = docFirst.split(/[\s:]/u)[0] ?? ''
      const srcName = srcFirst.split(/[\s:]/u)[0] ?? ''
      if (docName && srcName && docName !== srcName) {
        drift += 1
        issues.push(`\`${hook.name}\`: doc declaration shows first arg \`${docName}\`, source has \`${srcName}\``)
      }
      dm = declRe.exec(allDocText)
    }
  }
  const total = sources.length
  const body = [
    'Compares first argument names of every `useXxx(...)` call appearing in docs to the actual hook signature in `lib/noboil/src/{convex,spacetimedb}/react/use-*.ts`. Catches a common kind of doc rot.',
    '',
    `**${mentioned}/${total} hooks mentioned in docs.** Of those, ${withDecl} have at least one \`const useX = (...)\`-style declaration in a code fence. **${drift} drift mismatches.**`,
    '',
    issues.length === 0 ? '_No drift detected._' : '**Drift:**',
    '',
    ...issues.map(i => `- ${i}`)
  ].join('\n')
  const archTarget = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(archTarget, 'SIGNATURE-DRIFT', body)
  console.log(
    dirty ? `Updated signature drift (${drift} mismatch(es) across ${mentioned} hooks)` : 'Signature drift up to date'
  )
}
main()

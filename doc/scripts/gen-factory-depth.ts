#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const FACTORIES = [
  {
    brand: 'base',
    cvxFn: 'cacheCrud',
    cvxSrc: 'cache-crud.ts',
    dedicatedDoc: false,
    hookFile: 'use-cache.ts',
    stdbFn: 'makeCacheCrud',
    stdbSrc: 'cache-crud.ts'
  },
  {
    brand: 'child',
    cvxFn: 'childCrud',
    cvxSrc: 'child.ts',
    dedicatedDoc: false,
    hookFile: 'use-crud.ts',
    stdbFn: 'makeChildCrud',
    stdbSrc: 'child.ts'
  },
  {
    brand: 'kv',
    cvxFn: 'kv',
    cvxSrc: 'kv.ts',
    dedicatedDoc: true,
    hookFile: 'use-kv.ts',
    stdbFn: 'makeKv',
    stdbSrc: 'kv.ts'
  },
  {
    brand: 'log',
    cvxFn: 'log',
    cvxSrc: 'log.ts',
    dedicatedDoc: true,
    hookFile: 'use-log.ts',
    stdbFn: 'makeLog',
    stdbSrc: 'log.ts'
  },
  {
    brand: 'orgScoped',
    cvxFn: 'orgCrud',
    cvxSrc: 'org-crud.ts',
    dedicatedDoc: false,
    hookFile: 'use-crud.ts',
    stdbFn: 'makeOrgCrud',
    stdbSrc: 'org-crud.ts'
  },
  {
    brand: 'owned',
    cvxFn: 'crud',
    cvxSrc: 'crud.ts',
    dedicatedDoc: false,
    hookFile: 'use-crud.ts',
    stdbFn: 'makeCrud',
    stdbSrc: 'crud.ts'
  },
  {
    brand: 'quota',
    cvxFn: 'quota',
    cvxSrc: 'quota.ts',
    dedicatedDoc: true,
    hookFile: 'use-quota.ts',
    stdbFn: 'makeQuota',
    stdbSrc: 'quota.ts'
  },
  {
    brand: 'singleton',
    cvxFn: 'singletonCrud',
    cvxSrc: 'singleton.ts',
    dedicatedDoc: false,
    hookFile: 'use-singleton.ts',
    stdbFn: 'makeSingleton',
    stdbSrc: 'singleton.ts'
  }
]
const TEST_BLOCK_RE = /\b(?:test|it)\(\s*['"`][^'"`]+['"`][\s\S]*?^\s*\}\)/gmu
const walk = (dir: string, out: string[] = []): string[] => {
  if (!statSync(dir, { throwIfNoEntry: false })) return out
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.test.ts')) out.push(full)
  }
  return out
}
const lineCount = (path: string): number => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').length : 0)
const countTestsMentioning = (testRoot: string, fn: string): number => {
  const re = new RegExp(`\\b${fn}\\b`, 'u')
  let n = 0
  for (const f of walk(testRoot)) {
    const src = readFileSync(f, 'utf8')
    let m = TEST_BLOCK_RE.exec(src)
    while (m) {
      if (re.test(m[0])) n += 1
      m = TEST_BLOCK_RE.exec(src)
    }
    TEST_BLOCK_RE.lastIndex = 0
  }
  return n
}
const main = () => {
  const docsDir = `${REPO}/doc/content/docs`
  const cvxServer = `${REPO}/lib/noboil/src/convex/server`
  const stdbServer = `${REPO}/lib/noboil/src/spacetimedb/server`
  const cvxReact = `${REPO}/lib/noboil/src/convex/react`
  const stdbReact = `${REPO}/lib/noboil/src/spacetimedb/react`
  const allDocs = readdirSync(docsDir)
    .filter(f => f.endsWith('.mdx'))
    .map(f => readFileSync(`${docsDir}/${f}`, 'utf8'))
    .join('\n')
  const rows: string[] = []
  for (const f of FACTORIES) {
    const cvxLines = lineCount(`${cvxServer}/${f.cvxSrc}`)
    const stdbLines = lineCount(`${stdbServer}/${f.stdbSrc}`)
    const cvxTests = countTestsMentioning(`${REPO}/lib/noboil/src/convex`, f.cvxFn)
    const stdbTests = countTestsMentioning(`${REPO}/lib/noboil/src/spacetimedb`, f.stdbFn)
    const cvxHook = lineCount(`${cvxReact}/${f.hookFile}`)
    const stdbHook = lineCount(`${stdbReact}/${f.hookFile}`)
    const docPage = existsSync(`${docsDir}/${f.brand}.mdx`) ? lineCount(`${docsDir}/${f.brand}.mdx`) : 0
    const docMentionsCvx = (allDocs.match(new RegExp(`\\b${f.cvxFn}\\b`, 'gu')) ?? []).length
    const docMentionsStdb = (allDocs.match(new RegExp(`\\b${f.stdbFn}\\b`, 'gu')) ?? []).length
    rows.push(
      `| \`${f.brand}\` | ${cvxLines} / ${stdbLines} | ${cvxHook} / ${stdbHook} | ${cvxTests} / ${stdbTests} | ${docPage > 0 ? `${docPage}L` : '—'} | ${docMentionsCvx} / ${docMentionsStdb} |`
    )
  }
  const body = [
    'Quantitative depth per factory: source LOC, hook file LOC, test count (cases that reference the factory name), dedicated doc page LOC if any, and total mentions in all docs. **Bigger numbers ≠ better quality**, but large gaps signal uneven investment.',
    '',
    '| Factory | src LOC (cvx/stdb) | hook LOC (cvx/stdb) | tests (cvx/stdb) | dedicated doc | doc mentions (cvx/stdb) |',
    '|---|---|---|---|---|---|',
    ...rows
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'FACTORY-DEPTH', body)
  if (dirty) console.log(`Updated factory depth (${FACTORIES.length} factories)`)
}
main()

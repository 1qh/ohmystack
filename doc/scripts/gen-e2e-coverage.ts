#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const DEMOS = ['blog', 'chat', 'movie', 'org', 'poll']
const TEST_RE = /\b(?:test|it)\(\s*['"`](?<name>[^'"`]+)['"`]/gu
const DESCRIBE_RE = /describe\(\s*['"`](?<name>[^'"`]+)['"`]/gu
const countMatches = (re: RegExp, src: string): number => {
  let n = 0
  let m = re.exec(src)
  while (m) {
    n += 1
    m = re.exec(src)
  }
  re.lastIndex = 0
  return n
}
const collectDir = (dir: string): { describes: number; files: number; tests: number } => {
  if (!statSync(dir, { throwIfNoEntry: false })) return { describes: 0, files: 0, tests: 0 }
  let describes = 0
  let tests = 0
  let files = 0
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.test.ts')) continue
    const src = readFileSync(`${dir}/${name}`, 'utf8')
    files += 1
    describes += countMatches(DESCRIBE_RE, src)
    tests += countMatches(TEST_RE, src)
  }
  return { describes, files, tests }
}
const main = () => {
  const rows: string[] = []
  const totals = { cvxFiles: 0, cvxTests: 0, stdbFiles: 0, stdbTests: 0 }
  for (const demo of DEMOS) {
    const cvx = collectDir(`${REPO}/web/cvx/${demo}/e2e`)
    const stdb = collectDir(`${REPO}/web/stdb/${demo}/e2e`)
    totals.cvxFiles += cvx.files
    totals.cvxTests += cvx.tests
    totals.stdbFiles += stdb.files
    totals.stdbTests += stdb.tests
    rows.push(
      `| \`${demo}\` | ${cvx.files} | ${cvx.describes} | ${cvx.tests} | ${stdb.files} | ${stdb.describes} | ${stdb.tests} |`
    )
  }
  const body = [
    `**Playwright E2E coverage** across all 10 demo apps. ${totals.cvxTests + totals.stdbTests} total tests in ${totals.cvxFiles + totals.stdbFiles} files.`,
    '',
    '| Demo | cvx files | cvx describe | cvx test | stdb files | stdb describe | stdb test |',
    '|---|--:|--:|--:|--:|--:|--:|',
    ...rows,
    `| **total** | **${totals.cvxFiles}** | — | **${totals.cvxTests}** | **${totals.stdbFiles}** | — | **${totals.stdbTests}** |`
  ].join('\n')
  const target = `${REPO}/doc/content/docs/testing.mdx`
  const dirty = replaceBetween(target, 'E2E-COVERAGE', body)
  console.log(dirty ? `Updated e2e coverage (${totals.cvxTests + totals.stdbTests} tests)` : 'E2E coverage up to date')
}
main()

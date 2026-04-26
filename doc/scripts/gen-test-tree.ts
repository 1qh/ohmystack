#!/usr/bin/env bun
/* eslint-disable no-console */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const DESCRIBE_RE = /describe\(\s*['"`](?<name>[^'"`]+)['"`]/gu
const TEST_RE = /\b(?:test|it)\(\s*['"`](?<name>[^'"`]+)['"`]/gu
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) out.push(full)
  }
  return out
}
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
const main = () => {
  const root = `${REPO}/lib/noboil/src`
  const files = walk(root).toSorted()
  const rows: string[] = []
  let totalDescribes = 0
  let totalTests = 0
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const describes = countMatches(DESCRIBE_RE, src)
    const tests = countMatches(TEST_RE, src)
    if (tests > 0) {
      totalDescribes += describes
      totalTests += tests
      const rel = relative(`${REPO}/lib/noboil`, file)
      rows.push(`| \`${rel}\` | ${describes} | ${tests} |`)
    }
  }
  const body = [
    `**${totalTests} tests across ${rows.length} files (${totalDescribes} describe blocks)**`,
    '',
    '| File | describe | test/it |',
    '|---|--:|--:|',
    ...rows
  ].join('\n')
  const target = `${REPO}/doc/content/docs/testing.mdx`
  const dirty = replaceBetween(target, 'TEST-TREE', body)
  console.log(dirty ? `Updated test tree (${totalTests} tests)` : `Test tree up to date (${totalTests} tests)`)
}
main()

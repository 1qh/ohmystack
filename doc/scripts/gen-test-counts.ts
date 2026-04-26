#!/usr/bin/env bun
/* eslint-disable no-console */
/* oxlint-disable unicorn/prefer-top-level-await */
import { $ } from 'bun'
import { resolve } from 'node:path'
import { replaceLineBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const PASS_RE = /(?<pass>\d+)\s+pass/u
const runCount = async (cwd: string, file: string): Promise<number> => {
  const proc = await $`bun test ${file}`.cwd(cwd).quiet().nothrow()
  const out = (proc.stdout.toString() + proc.stderr.toString()).split('\n')
  for (const line of out) {
    const m = PASS_RE.exec(line)
    if (m?.groups?.pass) return Number(m.groups.pass)
  }
  return 0
}
const main = async () => {
  console.log('Counting tests...')
  const cvxPure = await runCount(`${REPO}/lib/noboil`, 'src/convex/__tests__/pure.test.ts')
  const stdbPure = await runCount(`${REPO}/lib/noboil`, 'src/spacetimedb/__tests__/pure.test.ts')
  const total = cvxPure + stdbPure
  const summary = `${total} pure tests passing (${cvxPure} Convex + ${stdbPure} SpacetimeDB)`
  const todo = `${REPO}/TODO.md`
  const dirty = replaceLineBetween(todo, 'TEST-COUNTS', summary)
  console.log(dirty ? `Updated test counts: ${summary}` : `Test counts up to date: ${summary}`)
}
main()

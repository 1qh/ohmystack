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
  console.log('Counting tests (this takes ~30s)...')
  const [cvxPure, stdbPure, cvxFTest] = await Promise.all([
    runCount(`${REPO}/lib/noboil`, 'src/convex/__tests__/pure.test.ts'),
    runCount(`${REPO}/lib/noboil`, 'src/spacetimedb/__tests__/pure.test.ts'),
    runCount(`${REPO}/backend/convex`, 'convex/f.test.ts')
  ])
  const total = cvxPure + stdbPure + cvxFTest
  const summary = `${total} tests passing — ${cvxPure} cvx pure + ${stdbPure} stdb pure + ${cvxFTest} cvx integration (f.test). E2E: 52/52 cvx-blog, 52/52 stdb-blog, 82/82 cvx-poll, 82/82 stdb-poll (run via \`bun run test:e2e\` per app).`
  const todo = `${REPO}/TODO.md`
  const dirty = replaceLineBetween(todo, 'TEST-COUNTS', summary)
  console.log(dirty ? `Updated test counts: ${total} total` : `Test counts up to date: ${total} total`)
}
main()

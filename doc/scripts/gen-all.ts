#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop, no-continue */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/nursery/noContinue: skip-on-failure */
import { $ } from 'bun'
import { resolve } from 'node:path'
const REPO = resolve(import.meta.dir, '../..')
const SCRIPTS = [
  'gen-cli-help.ts',
  'gen-api-imports.ts',
  'gen-demo-inventory.ts',
  'gen-brand-registry.ts',
  'gen-factory-api.ts',
  'gen-cvx-factory-api.ts',
  'gen-factory-options.ts',
  'gen-hook-reference.ts',
  'gen-cli-types.ts',
  'gen-error-codes.ts',
  'gen-test-counts.ts',
  'gen-meta-nav.ts',
  'gen-auto-fields.ts',
  'gen-package-info.ts',
  'gen-readme-factories.ts',
  'gen-react-hooks.ts',
  'gen-eslint-rules.ts',
  'gen-config-schema.ts',
  'gen-ui-components.ts',
  'gen-test-tree.ts',
  'gen-recipe-toc.ts',
  'gen-parity-matrix.ts',
  'gen-link-check.ts',
  'gen-coverage-report.ts'
]
const main = async () => {
  const isCheck = process.argv.includes('--check')
  console.log(isCheck ? 'Drift check (read-only)...' : 'Regenerating all auto-doc sections...')
  const failures: string[] = []
  for (const script of SCRIPTS) {
    const proc = await $`bun ${REPO}/doc/scripts/${script}`.cwd(REPO).quiet().nothrow()
    const out = (proc.stdout.toString() + proc.stderr.toString()).trim()
    if (proc.exitCode !== 0) {
      failures.push(`${script}: exit ${proc.exitCode}\n${out}`)
      console.log(`✗ ${script}`)
      continue
    }
    if (isCheck && out.startsWith('Updated')) {
      failures.push(`${script}: drift detected — run \`bun doc/scripts/gen-all.ts\``)
      console.log(`✗ ${script} (drift)`)
    } else console.log(`✓ ${script} — ${out.split('\n').pop()}`)
  }
  if (failures.length > 0) {
    console.log(`\n${failures.length} failure(s):\n${failures.join('\n')}`)
    process.exit(1)
  }
  console.log(isCheck ? '\nNo drift — all auto-doc sections in sync with source.' : '\nDone.')
}
await main()

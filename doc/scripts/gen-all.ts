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
  'gen-hotkeys.ts',
  'gen-demo-matrix.ts',
  'gen-noboil-options.ts',
  'gen-middleware.ts',
  'gen-schema-diagram.ts',
  'gen-hook-params.ts',
  'gen-cli-flags.ts',
  'gen-stability.ts',
  'gen-table-endpoints.ts',
  'gen-schema-fields.ts',
  'gen-env-vars.ts',
  'gen-jsdoc-examples.ts',
  'gen-e2e-coverage.ts',
  'gen-pkg-exports.ts',
  'gen-route-map.ts',
  'gen-options-inventory.ts',
  'gen-http-routes.ts',
  'gen-symbol-coverage.ts',
  'gen-example-check.ts',
  'gen-signature-drift.ts',
  'gen-doc-dedup.ts',
  'gen-glossary.ts',
  'gen-factory-parity.ts',
  'gen-factory-depth.ts',
  'gen-option-parity.ts',
  'gen-demo-parity.ts',
  'gen-utility-parity.ts',
  'gen-recipe-toc.ts',
  'gen-parity-matrix.ts',
  'gen-link-check.ts',
  'gen-coverage-report.ts'
]
const main = async () => {
  const isCheck = process.argv.includes('--check')
  const verbose = process.argv.includes('--verbose')
  const failures: string[] = []
  for (const script of SCRIPTS) {
    const proc = await $`bun ${REPO}/doc/scripts/${script}`.cwd(REPO).quiet().nothrow()
    const out = (proc.stdout.toString() + proc.stderr.toString()).trim()
    if (proc.exitCode !== 0) {
      failures.push(`✗ ${script}: exit ${proc.exitCode}\n${out}`)
      continue
    }
    if (isCheck && out.startsWith('Updated')) {
      failures.push(`✗ ${script}: drift — run \`bun doc/scripts/gen-all.ts\`\n${out}`)
      continue
    }
    if (verbose) console.log(`✓ ${script} — ${out.split('\n').pop()}`)
  }
  if (failures.length > 0) {
    for (const f of failures) console.error(f)
    process.exit(1)
  }
}
await main()

#!/usr/bin/env bun
/* eslint-disable no-console */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { bold, dim, red } from '../ansi'
const COMMANDS: Record<string, { description: string; script: string }> = {
  add: { description: 'Add a new table/endpoint to your project', script: 'add.ts' },
  check: { description: 'Validate schema/factory consistency', script: 'check.ts' },
  docs: { description: 'Generate API documentation', script: 'docs-gen.ts' },
  doctor: { description: 'Run project diagnostics', script: 'doctor.ts' },
  migrate: { description: 'Schema diff and migration plans', script: 'migrate.ts' },
  viz: { description: 'Visualize schema relationships', script: 'viz.ts' }
}
const printHelp = () => {
  console.log(`\n${bold('noboil/convex')} — Zod schema → fullstack app\n`)
  console.log(bold('Usage:'))
  console.log('  noboil-convex <command> [options]\n')
  console.log(bold('Commands:'))
  for (const [name, { description }] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(16)} ${dim(description)}`)
  console.log(`\nRun ${dim('noboil-convex <command> --help')} for command-specific options.\n`)
}
const [cmd, ...rest] = process.argv.slice(2)
if (!cmd || cmd === '--help' || cmd === '-h') printHelp()
else if (!(cmd in COMMANDS)) {
  console.log(`${red('Unknown command:')} ${cmd}\n`)
  printHelp()
  process.exit(1)
} else if (cmd === 'add') {
  const { add } = await import('./add')
  await add(rest)
} else {
  const entry = COMMANDS[cmd]
  if (!entry) process.exit(1)
  const script = fileURLToPath(new URL(entry.script, import.meta.url))
  const result = spawnSync('bun', [script, ...rest], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}

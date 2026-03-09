#!/usr/bin/env bun
/* eslint-disable no-console */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  COMMANDS: Record<string, { description: string; script: string }> = {
    add: { description: 'Add a new table/reducer to your project', script: 'add.ts' },
    check: { description: 'Validate schema/reducer consistency', script: 'check.ts' },
    dev: { description: 'Start integrated local development workflow', script: '' },
    docs: { description: 'Generate API documentation', script: 'docs-gen.ts' },
    doctor: { description: 'Run project diagnostics', script: 'doctor.ts' },
    generate: { description: 'Generate project files (docker-compose, etc.)', script: '' },
    init: { description: 'Scaffold a new ohmystack-stdb project', script: '' },
    migrate: { description: 'Schema diff and publish migration plans', script: 'migrate.ts' },
    use: { description: 'Switch SpacetimeDB target (local / cloud)', script: '' },
    validate: { description: 'Lint schema, reducers, indexes, and access control', script: 'check.ts' },
    viz: { description: 'Visualize schema relationships', script: 'viz.ts' }
  },
  printHelp = () => {
    console.log(`\n${bold('@ohmystack/spacetimedb')} — Zod schema → fullstack app\n`)
    console.log(bold('Usage:'))
    console.log('  ohmystack-stdb <command> [options]\n')
    console.log(bold('Commands:'))
    for (const [name, { description }] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(16)} ${dim(description)}`)
    console.log(`\nRun ${dim('ohmystack-stdb <command> --help')} for command-specific options.\n`)
  },
  [cmd, ...rest] = process.argv.slice(2)

if (!cmd || cmd === '--help' || cmd === '-h') printHelp()
else if (!(cmd in COMMANDS)) {
  console.log(`${red('Unknown command:')} ${cmd}\n`)
  printHelp()
  process.exit(1)
} else if (cmd === 'init') {
  const { init } = await import('./create')
  init(rest)
} else if (cmd === 'add') {
  const { add } = await import('./add')
  await add(rest)
} else if (cmd === 'use') {
  const { switchTarget } = await import('./use')
  switchTarget(rest)
} else if (cmd === 'generate') {
  const { generate } = await import('./generate')
  generate(rest)
} else if (cmd === 'dev') {
  const { dev } = await import('./dev')
  await dev(rest)
} else {
  const entry = COMMANDS[cmd]
  if (!entry) process.exit(1)
  const args = cmd === 'validate' && rest.length === 0 ? ['--health'] : rest,
    script = fileURLToPath(new URL(entry.script, import.meta.url)),
    result = spawnSync('bun', [script, ...args], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}

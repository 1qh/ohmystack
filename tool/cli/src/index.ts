#!/usr/bin/env bun
/* oxlint-disable eslint-plugin-promise(prefer-await-to-then) */
/* eslint-disable no-console */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bold, dim, red } from './ansi'
import { LOG_PATH, logCrash } from './shared/crash-log'
import { getCliVersion } from './shared/version'
const handleFatal = (label: string, err: unknown) => {
  logCrash(err).catch(() => null)
  console.error(`${red(label)} ${err instanceof Error ? err.message : String(err)}`)
  console.error(dim(`Crash log written to ${LOG_PATH()}`))
  process.exit(1)
}
process.on('uncaughtException', err => handleFatal('Fatal:', err))
process.on('unhandledRejection', reason => handleFatal('Unhandled rejection:', reason))
const COMMANDS: Record<string, string> = {
  add: 'Add a table/endpoint (auto-detects DB from .noboilrc.json)',
  completions: 'Print or install shell completion script',
  convex: 'Run a Convex subcommand (add, check, docs, migrate, viz, doctor)',
  doctor: 'Check project health and version alignment',
  eject: 'Detach from upstream, convert to standalone',
  init: 'Create a new noboil project',
  stdb: 'Run a SpacetimeDB subcommand (add, dev, generate, migrate, use, viz, ...)',
  sync: 'Pull and apply upstream changes',
  upgrade: 'Install the latest noboil version'
}
const printHelp = () => {
  console.log(`\n${bold('noboil')} — schema-first, zero-boilerplate fullstack\n`)
  console.log(bold('Usage:'))
  console.log('  noboil <command> [options]\n')
  console.log(bold('Commands:'))
  for (const [name, description] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(12)} ${dim(description)}`)
  console.log(`\nRun ${dim('noboil <command> --help')} for command-specific options.\n`)
}
const detectDb = (): 'convex' | 'spacetimedb' | null => {
  const p = join(process.cwd(), '.noboilrc.json')
  if (!existsSync(p)) return null
  try {
    const rc = JSON.parse(readFileSync(p, 'utf8')) as { db?: string }
    if (rc.db === 'convex' || rc.db === 'spacetimedb') return rc.db
  } catch {
    return null
  }
  return null
}
const runNamespace = (ns: 'convex' | 'spacetimedb', args: string[]): never => {
  const entry = ns === 'convex' ? '../convex/cli.ts' : '../spacetimedb/cli.ts'
  const script = fileURLToPath(new URL(entry, import.meta.url))
  const result = spawnSync('bun', [script, ...args], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
const [cmd, ...rest] = process.argv.slice(2)
if (cmd === '--version' || cmd === '-v') console.log(await getCliVersion())
else if (cmd === '--help' || cmd === '-h') printHelp()
else if (!cmd) {
  const { runDashboard } = await import('./dashboard-tui')
  const action = await runDashboard()
  if (action === 'init') {
    const { init } = await import('./init')
    await init([])
  } else if (action === 'doctor') {
    const { doctor } = await import('./doctor')
    await doctor([])
  } else if (action === 'sync') {
    const { sync } = await import('./sync')
    await sync([])
  } else if (action === 'eject') {
    const { eject } = await import('./eject')
    await eject([])
  } else if (action === 'upgrade') {
    const { upgrade } = await import('./upgrade')
    upgrade([])
  } else if (action === 'completions') {
    const { printCompletions } = await import('./completions')
    await printCompletions('bash')
  } else if (action === 'add') {
    const db = detectDb()
    if (db) runNamespace(db, ['add'])
    else console.log(`${red('No .noboilrc.json found.')} Run ${dim('noboil init')} first.`)
  }
} else if (cmd === 'init') {
  const { init } = await import('./init')
  await init(rest)
} else if (cmd === 'doctor') {
  const { doctor } = await import('./doctor')
  await doctor(rest)
} else if (cmd === 'sync') {
  const { sync } = await import('./sync')
  await sync(rest)
} else if (cmd === 'eject') {
  const { eject } = await import('./eject')
  await eject(rest)
} else if (cmd === 'completions') {
  const { printCompletions } = await import('./completions')
  await printCompletions(rest[0] ?? '', rest.slice(1))
} else if (cmd === 'upgrade') {
  const { upgrade } = await import('./upgrade')
  upgrade(rest)
} else if (cmd === 'convex') runNamespace('convex', rest)
else if (cmd === 'stdb' || cmd === 'spacetimedb') runNamespace('spacetimedb', rest)
else if (cmd === 'add') {
  const db = detectDb()
  if (!db) {
    console.log(
      `${red('No .noboilrc.json found.')} Run inside a noboil project, or use ${dim('noboil convex add')} / ${dim('noboil stdb add')} explicitly.`
    )
    process.exit(1)
  }
  runNamespace(db, ['add', ...rest])
} else {
  console.log(`${red('Unknown command:')} ${cmd}\n`)
  printHelp()
  process.exit(1)
}

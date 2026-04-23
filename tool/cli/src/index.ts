#!/usr/bin/env bun
/* eslint-disable no-console */
import { bold, dim, red } from './ansi'
import { getCliVersion } from './shared/version'
const COMMANDS: Record<string, string> = {
  completions: 'Print shell completion script',
  doctor: 'Check project health and version alignment',
  eject: 'Detach from upstream, convert to standalone',
  init: 'Create a new noboil project',
  sync: 'Pull and apply upstream changes'
}
const printHelp = () => {
  console.log(`\n${bold('noboil')} — schema-first, zero-boilerplate fullstack\n`)
  console.log(bold('Usage:'))
  console.log('  noboil <command> [options]\n')
  console.log(bold('Commands:'))
  for (const [name, description] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(12)} ${dim(description)}`)
  console.log(`\nRun ${dim('noboil <command> --help')} for command-specific options.\n`)
}
const [cmd, ...rest] = process.argv.slice(2)
if (cmd === '--version' || cmd === '-v') console.log(await getCliVersion())
else if (cmd === '--help' || cmd === '-h') printHelp()
else if (!cmd) {
  const { runDashboard } = await import('./dashboard-tui')
  await runDashboard()
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
  printCompletions(rest[0] ?? '')
} else {
  console.log(`${red('Unknown command:')} ${cmd}\n`)
  printHelp()
  process.exit(1)
}

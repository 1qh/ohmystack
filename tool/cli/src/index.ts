#!/usr/bin/env bun
/* eslint-disable no-console */

const bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  COMMANDS: Record<string, string> = {
    doctor: 'Check project health and version alignment',
    eject: 'Detach from upstream, convert to standalone',
    init: 'Create a new noboil project',
    sync: 'Pull and apply upstream changes'
  },
  printHelp = () => {
    console.log(`\n${bold('noboil')} — schema-first, zero-boilerplate fullstack\n`)
    console.log(bold('Usage:'))
    console.log('  noboil <command> [options]\n')
    console.log(bold('Commands:'))
    for (const [name, description] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(12)} ${dim(description)}`)
    console.log(`\nRun ${dim('noboil <command> --help')} for command-specific options.\n`)
  },
  [cmd, ...rest] = process.argv.slice(2)

if (!cmd || cmd === '--help' || cmd === '-h') printHelp()
else if (cmd === 'init') {
  const { init } = await import('./init')
  await init(rest)
} else if (cmd === 'doctor') {
  const { doctor } = await import('./doctor')
  doctor(rest)
} else if (cmd === 'sync') {
  const { sync } = await import('./sync')
  sync(rest)
} else if (cmd === 'eject') {
  const { eject } = await import('./eject')
  eject(rest)
} else {
  console.log(`${red('Unknown command:')} ${cmd}\n`)
  printHelp()
  process.exit(1)
}

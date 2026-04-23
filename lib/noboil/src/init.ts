#!/usr/bin/env bun
/* eslint-disable no-console */
import type { Db } from './scaffold-ops'
import { bold, dim } from './ansi'
const init = async (args: string[]) => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`\n${bold('noboil init')} — create a new noboil project\n`)
    console.log(bold('Usage:'))
    console.log('  noboil init [directory]\n')
    console.log(bold('Options:'))
    console.log(`  --db=convex|spacetimedb    ${dim('Skip database prompt')}`)
    console.log(`  --no-demos                 ${dim('Skip demo apps')}`)
    console.log(`  --skip-install             ${dim('Skip bun install after scaffolding')}`)
    console.log(`  --no-git                   ${dim('Skip auto git init + initial commit')}`)
    console.log(`  --help, -h                 ${dim('Show this help')}\n`)
    return
  }
  let db: Db | undefined
  let includeDemos: boolean | undefined
  let dir: string | undefined
  let skipInstall = false
  let skipGit = false
  for (const arg of args)
    if (arg === '--db=convex') db = 'convex'
    else if (arg === '--db=spacetimedb') db = 'spacetimedb'
    else if (arg === '--no-demos') includeDemos = false
    else if (arg === '--skip-install') skipInstall = true
    else if (arg === '--no-git') skipGit = true
    else if (!arg.startsWith('--')) dir = arg
  let defaultDb: Db | undefined
  if (!db) {
    const { readState } = await import('./shared/state')
    const prev = await readState()
    defaultDb = prev.lastDb
  }
  const { runInitTui } = await import('./init-tui')
  await runInitTui({ db, defaultDb, dir, includeDemos, skipGit, skipInstall })
}
export { init }

/* oxlint-disable eslint-plugin-unicorn(no-process-exit) */
/* eslint-disable no-console */
import { spawnSync } from 'node:child_process'
import { bold, dim, green, red, yellow } from './ansi'
import { findManifestPath } from './shared/manifest'
const HELP = `
${bold('noboil upgrade')} — install latest noboil
Usage:
  noboil upgrade [--global]
Options:
  --global, -g   Upgrade the globally installed binary (bun add -g noboil@latest)
  --help, -h     Show this help
`
const upgrade = (args: string[]) => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    return
  }
  const isGlobal = args.includes('--global') || args.includes('-g') || !findManifestPath(process.cwd())
  const bunArgs = isGlobal ? ['add', '-g', 'noboil@latest'] : ['add', 'noboil@latest']
  if (isGlobal && !args.includes('--global') && !args.includes('-g'))
    console.log(dim('no noboil project detected — defaulting to global install'))
  console.log(`${bold('noboil upgrade')} — running ${dim(`bun ${bunArgs.join(' ')}`)}\n`)
  const result = spawnSync('bun', bunArgs, { stdio: 'inherit' })
  if (result.status === 0) console.log(`\n${green('✓')} noboil upgraded.`)
  else {
    console.log(`\n${red('✘')} upgrade failed.`)
    console.log(`${yellow('hint:')} try ${dim('bun add -g noboil@latest')} manually.`)
    process.exit(result.status ?? 1)
  }
}
export { upgrade }

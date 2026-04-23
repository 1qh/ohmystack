/* oxlint-disable eslint(complexity) */
/* eslint-disable no-console, complexity */
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { bold, dim, green, red, yellow } from './ansi'
import { readManifestFrom } from './shared/manifest'
const HELP = `
${bold('noboil status')} — snapshot of the current project
Usage:
  noboil status
Shows: database, scaffolded-from hash, drift vs upstream, last sync, install health.
`
const humanizeAge = (isoDate: string): string => {
  const ms = Date.now() - new Date(isoDate).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  return `${Math.floor(days / 30)} months ago`
}
const status = (args: string[]) => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    return
  }
  const cwd = process.cwd()
  console.log(`\n${bold('noboil status')}\n`)
  console.log(`  ${dim('cwd:')}      ${cwd}`)
  const found = readManifestFrom(cwd)
  if (!found) {
    console.log(`  ${red('✘')} no .noboilrc.json — not a noboil project`)
    console.log(`\nRun ${dim('noboil init')} to scaffold a new project.\n`)
    return
  }
  const { manifest: rc, path: rcPath } = found
  const projectRoot = dirname(rcPath)
  if (projectRoot !== cwd) console.log(`  ${dim('root:')}     ${projectRoot}`)
  console.log(`  ${dim('db:')}       ${rc.db ?? '?'}`)
  console.log(`  ${dim('demos:')}    ${rc.includeDemos ? 'included' : 'excluded'}`)
  if (rc.ejected) console.log(`  ${yellow('!')} ejected — sync disabled`)
  if (rc.scaffoldedFrom) console.log(`  ${dim('from:')}     ${rc.scaffoldedFrom.slice(0, 7)}`)
  if (rc.scaffoldedAt) {
    const age = Date.now() - new Date(rc.scaffoldedAt).getTime()
    const days = age / 86_400_000
    const stale = days > 30
    console.log(`  ${dim('last sync:')} ${humanizeAge(rc.scaffoldedAt)}${stale ? ` ${yellow('(stale)')}` : ''}`)
    if (stale) console.log(`    ${yellow('!')} consider ${dim('noboil sync')} — scaffold is >30 days old`)
  }
  if (existsSync(join(projectRoot, 'node_modules'))) console.log(`  ${green('✓')} node_modules present`)
  else console.log(`  ${yellow('!')} node_modules missing — run ${dim('bun install')}`)
  if (!rc.ejected && rc.scaffoldedFrom) {
    const r = spawnSync('git', ['ls-remote', 'https://github.com/1qh/noboil.git', 'HEAD'], { encoding: 'utf8' })
    if (r.status === 0) {
      const latest = (r.stdout.split('\n')[0] ?? '').split('\t')[0] ?? ''
      if (latest && latest !== rc.scaffoldedFrom) {
        console.log(`  ${yellow('!')} upstream ahead: ${rc.scaffoldedFrom.slice(0, 7)} → ${latest.slice(0, 7)}`)
        console.log(`    run ${dim('noboil sync')} to pull updates`)
      } else console.log(`  ${green('✓')} up to date with upstream`)
    }
  }
  const logPath = join(projectRoot, 'package.json')
  if (existsSync(logPath)) {
    const { mtime } = statSync(logPath)
    console.log(`  ${dim('pkg mtime:')} ${humanizeAge(mtime.toISOString())}`)
  }
  console.log('')
}
export { status }

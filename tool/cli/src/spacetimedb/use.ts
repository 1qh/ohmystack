#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/style/noProcessEnv: cli */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bold, dim, green, red } from '../ansi'
type Target = 'cloud' | 'local'
const TARGETS: Record<Target, { label: string; server: string; uri: string }> = {
  cloud: { label: '☁️  MainCloud', server: 'maincloud', uri: 'https://maincloud.spacetimedb.com' },
  local: { label: '🐳 Local Docker', server: 'local', uri: 'ws://localhost:4000' }
}
const URI_PAT = /^(?:NEXT_PUBLIC_SPACETIMEDB_URI|SPACETIMEDB_URI)=.*$/gmu
const findEnvFile = (from: string): null | string => {
  let dir = resolve(from)
  for (let i = 0; i < 10; i += 1) {
    const candidate = `${dir}/.env`
    if (existsSync(candidate)) return candidate
    const parent = resolve(dir, '..')
    if (parent === dir) return null
    dir = parent
  }
  return null
}
const printUseHelp = () => {
  console.log(`${bold('noboil-stdb use')} — switch SpacetimeDB target\n`)
  console.log(bold('Usage:'))
  console.log('  noboil-stdb use <target>\n')
  console.log(bold('Targets:'))
  console.log(`  local    ${dim('ws://localhost:4000 (Docker)')}`)
  console.log(`  cloud    ${dim('https://maincloud.spacetimedb.com')}\n`)
  console.log(bold('What it does:'))
  console.log(`  ${dim('1.')} Updates NEXT_PUBLIC_SPACETIMEDB_URI and SPACETIMEDB_URI in .env`)
  console.log(`  ${dim('2.')} Sets spacetime CLI default server\n`)
  console.log(bold('Examples:'))
  console.log(`  ${dim('$')} noboil-stdb use local`)
  console.log(`  ${dim('$')} noboil-stdb use cloud\n`)
}
const switchTarget = (args: string[] = []) => {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUseHelp()
    return
  }
  const [targetArg] = args
  if (targetArg !== 'local' && targetArg !== 'cloud') {
    console.log(`${red('Unknown target:')} ${targetArg}`)
    console.log(`Valid targets: ${bold('local')}, ${bold('cloud')}\n`)
    process.exit(1)
  }
  const target = TARGETS[targetArg]
  const envPath = findEnvFile(process.cwd())
  if (!envPath) {
    console.log(`${red('No .env file found.')} Create one first.\n`)
    process.exit(1)
  }
  const original = readFileSync(envPath, 'utf8')
  const updated = original.replace(URI_PAT, (line: string) => {
    const key = line.slice(0, line.indexOf('='))
    return `${key}=${target.uri}`
  })
  if (updated === original) {
    const lines = original.split('\n')
    let hasPublic = false
    let hasServer = false
    for (const l of lines) {
      if (l.startsWith('NEXT_PUBLIC_SPACETIMEDB_URI=')) hasPublic = true
      if (l.startsWith('SPACETIMEDB_URI=')) hasServer = true
    }
    const additions: string[] = []
    if (!hasPublic) additions.push(`NEXT_PUBLIC_SPACETIMEDB_URI=${target.uri}`)
    if (!hasServer) additions.push(`SPACETIMEDB_URI=${target.uri}`)
    if (additions.length > 0) writeFileSync(envPath, `${original.trimEnd()}\n${additions.join('\n')}\n`)
  } else writeFileSync(envPath, updated)
  spawnSync('spacetime', ['server', 'set-default', target.server], { stdio: 'pipe' })
  console.log(`${green('✓')} ${target.label}`)
  console.log(`  ${dim(envPath)} → ${bold(target.uri)}`)
}
if (process.argv[1]?.endsWith('use.ts')) switchTarget(process.argv.slice(2))
export { findEnvFile, switchTarget }
export type { Target }

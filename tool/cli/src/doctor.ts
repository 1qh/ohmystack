#!/usr/bin/env bun
/* eslint-disable no-console,@typescript-eslint/no-unused-vars */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  checkManifest = (cwd: string) => {
    const manifestPath = join(cwd, '.noboilrc.json')
    if (!existsSync(manifestPath)) {
      console.log(`  ${yellow('!')} No .noboilrc.json found — sync won't work`)
      return 1
    }
    const manifestRaw = readFileSync(manifestPath, 'utf8'),
      manifest = JSON.parse(manifestRaw) as { scaffoldedFrom?: string }
    if (typeof manifest.scaffoldedFrom !== 'string' || manifest.scaffoldedFrom.length === 0) {
      console.log(`  ${yellow('!')} .noboilrc.json is invalid — run ${dim('noboil sync --force')}`)
      return 1
    }
    console.log(`  ${green('+')} noboil manifest found ${dim(`(scaffolded from ${manifest.scaffoldedFrom})`)}`)
    const remoteResult = spawnSync('git', ['ls-remote', 'https://github.com/1qh/noboil.git', 'HEAD'], {
      encoding: 'utf8'
    })
    if (remoteResult.status === 0) {
      const line = remoteResult.stdout.split('\n')[0] ?? '',
        latestHash = line.split('\t')[0] ?? ''
      if (latestHash && latestHash !== manifest.scaffoldedFrom) {
        console.log(`  ${yellow('!')} noboil manifest is outdated — run ${dim('noboil sync')}`)
        return 1
      }
    }
    return 0
  },
  doctor = (_args: string[]) => {
    console.log(`\n${bold('noboil doctor')} — project health check\n`)
    const cwd = process.cwd()
    let issues = 0,
      warnings = 0
    const pkgPath = join(cwd, 'package.json')
    if (!existsSync(pkgPath)) {
      console.log(`  ${red('x')} No package.json found in current directory`)
      process.exit(1)
    }
    console.log(`  ${green('+')} package.json found`)
    const raw = readFileSync(pkgPath, 'utf8'),
      pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
      deps = { ...pkg.dependencies, ...pkg.devDependencies },
      hasConvex = '@noboil/convex' in deps,
      hasStdb = '@noboil/spacetimedb' in deps
    if (hasConvex || hasStdb) {
      if (hasConvex) console.log(`  ${green('+')} @noboil/convex ${dim(deps['@noboil/convex'] ?? 'unknown')}`)
      if (hasStdb) console.log(`  ${green('+')} @noboil/spacetimedb ${dim(deps['@noboil/spacetimedb'] ?? 'unknown')}`)
    } else {
      console.log(`  ${red('x')} Neither @noboil/convex nor @noboil/spacetimedb found in dependencies`)
      issues += 1
    }
    const bunResult = spawnSync('bun', ['--version'], { encoding: 'utf8' })
    if (bunResult.status === 0) console.log(`  ${green('+')} bun ${dim(bunResult.stdout.trim())}`)
    else {
      console.log(`  ${red('x')} bun not found`)
      issues += 1
    }
    const nodeModules = join(cwd, 'node_modules')
    if (existsSync(nodeModules)) console.log(`  ${green('+')} node_modules installed`)
    else {
      console.log(`  ${yellow('!')} node_modules missing — run ${dim('bun install')}`)
      warnings += 1
    }
    const tsconfig = join(cwd, 'tsconfig.json')
    if (existsSync(tsconfig)) console.log(`  ${green('+')} tsconfig.json found`)
    else {
      console.log(`  ${yellow('!')} tsconfig.json missing`)
      warnings += 1
    }
    warnings += checkManifest(cwd)
    if (hasConvex) {
      const convexDir = join(cwd, 'convex')
      if (existsSync(convexDir)) console.log(`  ${green('+')} convex/ directory found`)
      else {
        console.log(`  ${yellow('!')} convex/ directory missing`)
        warnings += 1
      }
    }
    if (hasStdb) {
      const dockerFile = join(cwd, 'docker-compose.yml'),
        dockerFileAlt = join(cwd, 'compose.yml')
      if (existsSync(dockerFile) || existsSync(dockerFileAlt)) console.log(`  ${green('+')} Docker compose file found`)
      else {
        console.log(`  ${yellow('!')} No docker-compose.yml found — needed for SpacetimeDB`)
        warnings += 1
      }
    }
    console.log()
    if (issues > 0) {
      console.log(`  ${red(`${issues} issue(s)`)}${warnings > 0 ? `, ${yellow(`${warnings} warning(s)`)}` : ''}\n`)
      process.exit(1)
    } else if (warnings > 0) console.log(`  ${green('No issues.')} ${yellow(`${warnings} warning(s)`)}\n`)
    else console.log(`  ${green('All good!')}\n`)
  }
export { doctor }

#!/usr/bin/env bun
/* eslint-disable no-console */
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
// biome-ignore-all lint/suspicious/useAwait: async without await
// oxlint-disable promise/avoid-new

import type { ChildProcess, SpawnSyncReturns } from 'node:child_process'
import type { FSWatcher } from 'node:fs'

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, watch } from 'node:fs'
import { join, resolve } from 'node:path'

import { findEnvFile } from './use'

interface DevFlags {
  docker: boolean
  help: boolean
  moduleDir: null | string
  watch: boolean
}

const green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  SPACE_PAT = /\s+/u,
  findPackageJsonFile = (from: string): null | string => {
    let dir = resolve(from)
    for (let i = 0; i < 10; i += 1) {
      const candidate = join(dir, 'package.json')
      if (existsSync(candidate)) return candidate
      const parent = resolve(dir, '..')
      if (parent === dir) return null
      dir = parent
    }
    return null
  },
  parseJsonFile = (path: string): null | Record<string, unknown> => {
    try {
      const raw = readFileSync(path, 'utf8')
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return null
    }
  },
  unquote = (value: string) => {
    if (value.length < 2) return value
    const [first] = value,
      last = value.at(-1)
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1)
    return value
  },
  extractFlagValue = (script: string, flag: string): null | string => {
    const parts = script.split(SPACE_PAT)
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i] ?? ''
      if (part === flag) {
        const value = parts[i + 1]
        if (value) return unquote(value)
      } else if (part.startsWith(`${flag}=`)) return unquote(part.slice(flag.length + 1))
    }
    return null
  },
  detectModuleDirFromScripts = (pkg: Record<string, unknown>): string => {
    const scriptsObj = pkg.scripts
    if (!scriptsObj || typeof scriptsObj !== 'object') return 'module'
    const scripts = scriptsObj as Record<string, unknown>
    for (const value of Object.values(scripts))
      if (typeof value === 'string') {
        const modulePath = extractFlagValue(value, '--module-path')
        if (modulePath) return modulePath
        const projectPath = extractFlagValue(value, '--project-path')
        if (projectPath) return projectPath
      }

    return 'module'
  },
  parseEnvValue = (envPath: string, key: string): null | string => {
    const raw = readFileSync(envPath, 'utf8'),
      lines = raw.split('\n')
    for (const lineRaw of lines) {
      const line = lineRaw.trim()
      if (line && !line.startsWith('#') && line.startsWith(`${key}=`)) return unquote(line.slice(key.length + 1).trim())
    }
    return null
  },
  parseDevFlags = (args: string[]): DevFlags => {
    let moduleDir: null | string = null,
      docker = true,
      watchEnabled = true,
      help = false
    for (const arg of args)
      if (arg === '--help' || arg === '-h') help = true
      else if (arg === '--no-docker') docker = false
      else if (arg === '--no-watch') watchEnabled = false
      else if (arg.startsWith('--module-dir=')) moduleDir = arg.slice('--module-dir='.length)
      else if (arg.startsWith('-')) {
        console.log(`${red('Unknown option:')} ${arg}\n`)
        process.exit(1)
      }
    return { docker, help, moduleDir, watch: watchEnabled }
  },
  printDevHelp = () => {
    console.log(`${bold('noboil-stdb dev')} — integrated SpacetimeDB + Next.js development\n`)
    console.log(bold('Usage:'))
    console.log('  noboil-stdb dev [options]\n')
    console.log(bold('Options:'))
    console.log(
      `  --module-dir=DIR   ${dim('SpacetimeDB module directory (default: auto-detect from package.json scripts)')}`
    )
    console.log(`  --no-docker        ${dim('Skip docker compose startup')}`)
    console.log(`  --no-watch         ${dim('Disable module watch auto-republish')}`)
    console.log('  --help, -h         Show this help\n')
  },
  runSyncCommand = ({
    cmdArgs,
    command,
    cwd,
    label
  }: {
    cmdArgs: string[]
    command: string
    cwd: string
    label: string
  }): boolean => {
    const result: SpawnSyncReturns<Buffer> = spawnSync(command, cmdArgs, {
      cwd,
      env: process.env,
      stdio: 'inherit'
    })
    if (result.status === 0) return true
    if (typeof result.status === 'number') console.log(`${red('Failed:')} ${label} ${dim(`(exit ${result.status})`)}`)
    else console.log(`${red('Failed:')} ${label}`)
    return false
  },
  sleep = async (ms: number): Promise<void> =>
    new Promise(_resolve => {
      setTimeout(_resolve, ms)
    }),
  pingSpacetime = async (): Promise<boolean> => {
    const urls = ['http://localhost:3000/v1/ping', 'http://localhost:3000/database/ping'],
      checks = urls.map(async url => {
        try {
          const response = await fetch(url)
          return response.ok
        } catch (error) {
          if (error instanceof Error) return false
          return false
        }
      }),
      results = await Promise.all(checks)
    for (const result of results) if (result) return true
    return false
  },
  waitForSpacetimeHealth = async (timeoutMs = 120_000, intervalMs = 1000): Promise<boolean> => {
    const started = Date.now(),
      poll = async (): Promise<boolean> => {
        const isHealthy = await pingSpacetime()
        if (isHealthy) return true
        if (Date.now() - started >= timeoutMs) return false
        await sleep(intervalMs)
        return poll()
      }
    return poll()
  },
  findComposeFile = (cwd: string): null | string => {
    const candidates = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']
    for (const candidate of candidates) {
      const path = join(cwd, candidate)
      if (existsSync(path)) return path
    }
    return null
  },
  detectDevServerCommand = (pkg: null | Record<string, unknown>): { args: string[]; command: string } => {
    if (pkg) {
      const scriptsObj = pkg.scripts
      if (scriptsObj && typeof scriptsObj === 'object') {
        const scripts = scriptsObj as Record<string, unknown>
        if (typeof scripts.dev === 'string' && scripts.dev.trim().length > 0) return { args: ['dev'], command: 'bun' }
      }
    }
    return { args: ['dev'], command: 'next' }
  },
  createPublishAndGenerate =
    ({
      cwd,
      moduleDirAbs,
      moduleName,
      spacetimeBin
    }: {
      cwd: string
      moduleDirAbs: string
      moduleName: string
      spacetimeBin: string
    }) =>
    () => {
      console.log(`\n${bold('Publishing SpacetimeDB module...')}`)
      const publishOk = runSyncCommand({
        cmdArgs: ['publish', '--module-path', moduleDirAbs, moduleName],
        command: spacetimeBin,
        cwd,
        label: `spacetime publish ${moduleName}`
      })
      if (!publishOk) return false
      console.log(bold('Generating TypeScript bindings...'))
      return runSyncCommand({
        cmdArgs: ['generate', '--lang', 'typescript', '--project-path', moduleDirAbs],
        command: spacetimeBin,
        cwd,
        label: 'spacetime generate'
      })
    },
  startWatching = (moduleDirAbs: string, onChange: () => void): FSWatcher =>
    watch(moduleDirAbs, { recursive: true }, (_eventType, filename) => {
      if (typeof filename !== 'string') return
      if (!filename.endsWith('.ts')) return
      onChange()
    }),
  startDevServer = (cwd: string, pkg: null | Record<string, unknown>): ChildProcess => {
    const cmd = detectDevServerCommand(pkg)
    return spawn(cmd.command, cmd.args, {
      cwd,
      env: process.env,
      stdio: 'inherit'
    })
  },
  /**
   * Starts the integrated Betterspace development workflow.
   */
  dev = async (args: string[] = []) => {
    const flags = parseDevFlags(args)
    if (flags.help) {
      printDevHelp()
      return
    }

    const cwd = process.cwd(),
      packageJsonPath = findPackageJsonFile(cwd)
    if (!packageJsonPath) {
      console.log(`${red('No package.json found.')} Run this command from a project directory.\n`)
      process.exit(1)
    }

    const packageJson = parseJsonFile(packageJsonPath)
    if (!packageJson) {
      console.log(red('Failed to parse package.json.'))
      process.exit(1)
    }

    const moduleDir = flags.moduleDir ?? detectModuleDirFromScripts(packageJson),
      moduleDirAbs = resolve(cwd, moduleDir)
    if (!existsSync(moduleDirAbs)) {
      console.log(`${red('Module directory not found:')} ${moduleDir}`)
      process.exit(1)
    }

    const envPath = findEnvFile(cwd)
    let moduleName: null | string = null
    if (envPath) moduleName = parseEnvValue(envPath, 'SPACETIMEDB_MODULE_NAME')
    if (!moduleName && typeof packageJson.name === 'string' && packageJson.name.trim().length > 0)
      moduleName = packageJson.name
    if (!moduleName) {
      console.log(`${red('Module name not found.')} Set SPACETIMEDB_MODULE_NAME in .env or package.json name.`)
      process.exit(1)
    }

    const spacetimeBin = `${process.env.HOME ?? ''}/.local/bin/spacetime`
    if (!existsSync(spacetimeBin)) {
      console.log(`${red('Spacetime CLI not found:')} ${spacetimeBin}`)
      process.exit(1)
    }

    console.log(`\n${bold('noboil-stdb dev')} ${dim('— starting development environment')}`)
    console.log(`${dim('module dir:')} ${moduleDir}`)
    console.log(`${dim('module name:')} ${moduleName}`)

    const composeFile = findComposeFile(cwd)
    if (flags.docker)
      if (composeFile) {
        console.log(`\n${bold('Starting Docker services...')}`)
        const dockerOk = runSyncCommand({
          cmdArgs: ['compose', 'up', '-d'],
          command: 'docker',
          cwd,
          label: 'docker compose up -d'
        })
        if (!dockerOk) process.exit(1)
      } else console.log(`${yellow('⚠')} No docker compose file found, skipping Docker startup.`)
    else console.log(dim('Skipping Docker startup (--no-docker).'))

    console.log(bold('Waiting for SpacetimeDB health...'))
    const healthy = await waitForSpacetimeHealth()
    if (!healthy) {
      console.log(red('SpacetimeDB did not become healthy in time.'))
      process.exit(1)
    }
    console.log(`${green('✓')} SpacetimeDB is healthy`)

    const publishAndGenerate = createPublishAndGenerate({ cwd, moduleDirAbs, moduleName, spacetimeBin })
    if (!publishAndGenerate()) process.exit(1)
    console.log(`${green('✓')} Initial publish + generate complete`)

    let watcher: FSWatcher | null = null,
      watcherTimer: null | ReturnType<typeof setTimeout> = null,
      shutdownStarted = false

    const scheduleRepublish = () => {
        if (!flags.watch) return
        if (watcherTimer) clearTimeout(watcherTimer)
        watcherTimer = setTimeout(() => {
          console.log(`\n${dim('Detected module .ts change, republishing...')}`)
          const ok = publishAndGenerate()
          if (!ok) console.log(`${yellow('⚠')} Republish failed; waiting for next file change.`)
        }, 250)
      },
      devProcess = startDevServer(cwd, packageJson),
      shutdown = (code: number) => {
        if (shutdownStarted) return
        shutdownStarted = true
        if (watcherTimer) clearTimeout(watcherTimer)
        if (watcher) watcher.close()
        if (devProcess.exitCode === null && !devProcess.killed) devProcess.kill('SIGTERM')
        process.exit(code)
      }

    if (flags.watch) {
      watcher = startWatching(moduleDirAbs, scheduleRepublish)
      console.log(`${green('✓')} Watching ${moduleDir} for .ts changes`)
    } else console.log(dim('Watch disabled (--no-watch).'))

    console.log(`${green('✓')} Next.js dev server started\n`)

    process.on('SIGINT', () => shutdown(0))
    process.on('SIGTERM', () => shutdown(0))
    devProcess.on('exit', code => shutdown(code ?? 0))
  }

if (process.argv[1]?.endsWith('dev.ts'))
  try {
    await dev(process.argv.slice(2))
  } catch {
    process.exit(1)
  }

export { dev }

#!/usr/bin/env bun
/* eslint-disable no-console, max-depth, complexity */
/* oxlint-disable eslint/max-statements, eslint/complexity */
/** biome-ignore-all lint/style/noProcessEnv: cli */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { FactoryCall } from './check'

import {
  accessForFactory,
  checkIndexCoverage,
  checkSchemaConsistency,
  endpointsForFactory,
  extractSchemaFields,
  HEALTH_ERROR_PENALTY,
  HEALTH_MAX,
  HEALTH_WARN_PENALTY
} from './check'

interface CheckResult {
  details: string[]
  status: 'fail' | 'pass' | 'warn'
  title: string
}

const bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  STATUS_ICON: Record<string, string> = { fail: red('✗'), pass: green('✓'), warn: yellow('!') },
  schemaMarkers = ['schema(', 'table(', 't.'],
  reducerPat = /reducer\(\s*['"](?<table>\w+)\.(?<endpoint>[\w.]+)['"]/gu,
  isSchemaFile = (content: string): boolean => {
    for (const marker of schemaMarkers) if (content.includes(marker)) return true
    return false
  },
  listTypeScriptFiles = (root: string): string[] => {
    const out: string[] = [],
      skip = new Set(['.git', '.next', '.turbo', 'build', 'dist', 'node_modules']),
      walk = (dir: string) => {
        if (!existsSync(dir)) return
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            if (!(skip.has(entry.name) || entry.name.startsWith('.'))) walk(full)
          } else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.') && !entry.name.includes('.config.'))
            out.push(full)
        }
      }
    walk(root)
    return out
  },
  findModuleDir = (root: string): string | undefined => {
    const candidates = [join(root, 'module'), join(root, 'src', 'module')]
    for (const candidate of candidates)
      if (existsSync(candidate)) {
        const files = listTypeScriptFiles(candidate)
        for (const file of files) {
          const content = readFileSync(file, 'utf8')
          if (isSchemaFile(content)) return candidate
        }
      }
    if (!existsSync(root)) return
    for (const sub of readdirSync(root, { withFileTypes: true }))
      if (sub.isDirectory()) {
        const nested = join(root, sub.name, 'module')
        if (existsSync(nested)) {
          const files = listTypeScriptFiles(nested)
          for (const file of files) {
            const content = readFileSync(file, 'utf8')
            if (isSchemaFile(content)) return nested
          }
        }
      }
  },
  findSchemaFile = (moduleDir: string): undefined | { content: string; path: string } => {
    const files = listTypeScriptFiles(moduleDir)
    for (const full of files) {
      const content = readFileSync(full, 'utf8')
      if (isSchemaFile(content) && content.includes('schema(') && content.includes('table('))
        return { content, path: full }
    }
  },
  extractFactoryCalls = (moduleDir: string): FactoryCall[] => {
    const files = listTypeScriptFiles(moduleDir),
      byTable = new Map<string, { endpoints: Set<string>; file: string }>()
    for (const full of files) {
      const content = readFileSync(full, 'utf8'),
        file = full.slice(moduleDir.length + 1)
      let m = reducerPat.exec(content)
      while (m) {
        const table = m.groups?.table ?? '',
          endpoint = m.groups?.endpoint ?? ''
        if (table && endpoint) {
          const entry = byTable.get(table) ?? { endpoints: new Set<string>(), file }
          entry.endpoints.add(endpoint)
          byTable.set(table, entry)
        }
        m = reducerPat.exec(content)
      }
      reducerPat.lastIndex = 0
    }
    const calls: FactoryCall[] = []
    for (const [table, entry] of byTable)
      calls.push({ factory: 'reducer', file: entry.file, options: `endpoints=${[...entry.endpoints].join(',')}`, table })
    return calls
  },
  checkSpacetimeCli = (): CheckResult => {
    const result = spawnSync('/Users/o/.local/bin/spacetime', ['--version'], { encoding: 'utf8' })
    if (result.status !== 0)
      return {
        details: ['spacetime CLI not found at /Users/o/.local/bin/spacetime'],
        status: 'fail',
        title: 'Spacetime CLI'
      }
    const version = (result.stdout || result.stderr || '').trim()
    return { details: [version || 'spacetime CLI available'], status: 'pass', title: 'Spacetime CLI' }
  },
  checkDocker = (): CheckResult => {
    const result = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' })
    if (result.status !== 0)
      return { details: ['Docker not running or not installed'], status: 'warn', title: 'Docker Health' }
    const names = result.stdout.trim().split('\n').filter(Boolean),
      spacetimeContainers: string[] = []
    for (const name of names) if (name.toLowerCase().includes('spacetime')) spacetimeContainers.push(name)
    if (spacetimeContainers.length === 0)
      return { details: ['No running containers matched "spacetime"'], status: 'warn', title: 'Docker Health' }
    return { details: [`Running: ${spacetimeContainers.join(', ')}`], status: 'pass', title: 'Docker Health' }
  },
  checkEslintContent = (content?: string): CheckResult => {
    if (content === undefined)
      return { details: ['No eslint.config.* file found'], status: 'warn', title: 'ESLint Configuration' }
    if (content.includes('@noboil/spacetimedb/eslint'))
      return {
        details: ['@noboil/spacetimedb/eslint plugin configured'],
        status: 'pass',
        title: 'ESLint Configuration'
      }
    return {
      details: ['eslint.config found but @noboil/spacetimedb/eslint not imported'],
      status: 'warn',
      title: 'ESLint Configuration'
    }
  },
  checkDeps = (pkg?: Record<string, unknown>): CheckResult => {
    if (!pkg) return { details: ['No package.json found'], status: 'fail', title: 'Dependencies' }
    const deps = (pkg.dependencies ?? {}) as Record<string, string>,
      devDeps = (pkg.devDependencies ?? {}) as Record<string, string>,
      all = { ...deps, ...devDeps },
      details: string[] = [],
      required = ['@noboil/spacetimedb', 'spacetimedb', 'zod']
    let missing = 0
    for (const name of required)
      if (all[name]) details.push(`${name}: ${all[name]}`)
      else {
        details.push(`${name}: not found`)
        missing += 1
      }
    return { details, status: missing ? 'fail' : 'pass', title: 'Dependencies' }
  },
  calcHealthScore = (results: CheckResult[]): number => {
    let score = HEALTH_MAX
    for (const r of results)
      if (r.status === 'fail') score -= HEALTH_ERROR_PENALTY
      else if (r.status === 'warn') score -= HEALTH_WARN_PENALTY
    return Math.max(0, score)
  },
  doctor = () => {
    const root = process.cwd()
    console.log(bold('\nnoboil-stdb doctor\n'))

    const moduleDir = findModuleDir(root)
    if (!moduleDir) {
      console.log(red('✗ Could not find module/ directory with SpacetimeDB schema'))
      console.log(dim('  Run from project root or a directory containing module/'))
      process.exit(1)
    }

    const schemaFile = findSchemaFile(moduleDir)
    if (!schemaFile) {
      console.log(red('✗ Could not find schema file with SpacetimeDB markers'))
      console.log(dim('  Expected a .ts file using schema()/table().'))
      process.exit(1)
    }

    const calls = extractFactoryCalls(moduleDir),
      tables = extractSchemaFields(schemaFile.content),
      results: CheckResult[] = [],
      schemaIssues = checkSchemaConsistency(moduleDir, schemaFile),
      schemaErrors = schemaIssues.filter(i => i.level === 'error'),
      schemaWarns = schemaIssues.filter(i => i.level === 'warn')
    if (schemaErrors.length > 0)
      results.push({ details: schemaErrors.map(e => e.message), status: 'fail', title: 'Schema Consistency' })
    else if (schemaWarns.length > 0)
      results.push({
        details: [`${tables.length} tables, ${calls.length} reducer groups, ${schemaWarns.length} warning(s)`],
        status: 'warn',
        title: 'Schema Consistency'
      })
    else
      results.push({
        details: [`${tables.length} tables, ${calls.length} reducer groups, all matched`],
        status: 'pass',
        title: 'Schema Consistency'
      })

    let totalEps = 0
    for (const c of calls) totalEps += endpointsForFactory(c).length
    results.push({
      details: [`${totalEps} reducers from ${calls.length} table groups`],
      status: 'pass',
      title: 'Reducer Coverage'
    })

    const indexIssues = checkIndexCoverage(moduleDir, calls)
    if (indexIssues.length > 0)
      results.push({
        details: [`${indexIssues.length} unindexed where clause(s)`, ...indexIssues.map(i => i.message)],
        status: 'warn',
        title: 'Index Coverage'
      })
    else results.push({ details: ['All where clauses have matching indexes'], status: 'pass', title: 'Index Coverage' })

    const levels = new Set<string>()
    for (const c of calls) for (const e of accessForFactory(c)) levels.add(e.level)
    results.push({
      details: [`Access levels: ${[...levels].join(', ') || 'none'}`],
      status: 'pass',
      title: 'Access Control'
    })

    results.push(checkSpacetimeCli())
    results.push(checkDocker())

    let eslintContent: string | undefined
    if (existsSync(root))
      for (const name of readdirSync(root))
        if (name.startsWith('eslint.config.')) {
          eslintContent = readFileSync(join(root, name), 'utf8')
          break
        }
    results.push(checkEslintContent(eslintContent))

    const pkgPath = join(root, 'package.json'),
      pkg = existsSync(pkgPath) ? (JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>) : undefined
    results.push(checkDeps(pkg))

    for (const r of results) {
      const icon = STATUS_ICON[r.status] ?? '?'
      console.log(`[${icon}] ${r.title}`)
      for (const d of r.details) console.log(`    • ${d}`)
      console.log('')
    }

    let passed = 0,
      warned = 0,
      failed = 0
    for (const r of results)
      if (r.status === 'pass') passed += 1
      else if (r.status === 'warn') warned += 1
      else failed += 1

    const score = calcHealthScore(results),
      scoreColor = score >= 90 ? green : score >= 70 ? yellow : red
    console.log(`Summary: ${passed} passed, ${warned} warning(s), ${failed} error(s)`)
    console.log(`Health Score: ${scoreColor(`${score}/${HEALTH_MAX}`)}\n`)
  }

if (import.meta.main) doctor()

export { calcHealthScore, checkDeps, checkDocker, checkEslintContent, checkSpacetimeCli, doctor }
export type { CheckResult }

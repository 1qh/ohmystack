#!/usr/bin/env bun
/* eslint-disable no-console */
import { createCliTheme } from '@a/shared/cli'
/* oxlint-disable eslint/max-statements, eslint/complexity */
/** biome-ignore-all lint/style/noProcessEnv: cli */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
const { bold, dim, green, red, yellow } = createCliTheme()
const STATUS_ICON: Record<string, string> = { fail: red('\u2717'), pass: green('\u2713'), warn: yellow('!') }
const schemaMarkers = ['makeOwned(', 'makeOrgScoped(', 'makeSingleton(', 'makeBase(', 'child(']
const factoryPat = /(?<factory>crud|orgCrud|childCrud|cacheCrud|singletonCrud)\(\s*['"](?<table>\w+)['"]/gu
const isSchemaFile = (content: string): boolean => {
  for (const marker of schemaMarkers) if (content.includes(marker)) return true
  return false
}
const hasGenerated = (dir: string): boolean => existsSync(join(dir, '_generated'))
const findConvexDir = (root: string): string | undefined => {
  const direct = join(root, 'convex')
  if (hasGenerated(direct)) return direct
  if (!existsSync(root)) return
  for (const sub of readdirSync(root, { withFileTypes: true }))
    if (sub.isDirectory()) {
      const nested = join(root, sub.name, 'convex')
      if (hasGenerated(nested)) return nested
    }
}
const findSchemaFile = (convexDir: string): undefined | { content: string; path: string } => {
  const searchDir = dirname(convexDir)
  if (!existsSync(searchDir)) return
  for (const entry of readdirSync(searchDir))
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.config.ts')) {
      const full = join(searchDir, entry)
      const content = readFileSync(full, 'utf8')
      if (isSchemaFile(content)) return { content, path: full }
    }
}
const extractRemainingOptions = (content: string, startPos: number): string => {
  let depth = 1
  let pos = startPos
  while (pos < content.length && depth > 0) {
    if (content[pos] === '(') depth += 1
    else if (content[pos] === ')') depth -= 1
    pos += 1
  }
  return content.slice(startPos, pos - 1)
}
const extractFactoryCalls = (convexDir: string): FactoryCall[] => {
  const calls: FactoryCall[] = []
  for (const entry of readdirSync(convexDir))
    if (entry.endsWith('.ts') && !entry.startsWith('_') && !entry.includes('.test.') && !entry.includes('.config.')) {
      const full = join(convexDir, entry)
      const content = readFileSync(full, 'utf8')
      let m = factoryPat.exec(content)
      while (m) {
        if (m.groups?.factory && m.groups.table) {
          const afterTable = content.indexOf(m.groups.table, m.index) + m.groups.table.length
          const rest = extractRemainingOptions(content, afterTable)
          calls.push({ factory: m.groups.factory, file: entry, options: rest, table: m.groups.table })
        }
        m = factoryPat.exec(content)
      }
      factoryPat.lastIndex = 0
    }
  return calls
}
const RATE_LIMIT_FACTORIES = new Set(['crud', 'orgCrud'])
const checkRateLimit = (calls: FactoryCall[]): CheckResult => {
  const relevant: FactoryCall[] = []
  const skipped: FactoryCall[] = []
  for (const c of calls)
    if (RATE_LIMIT_FACTORIES.has(c.factory)) relevant.push(c)
    else skipped.push(c)
  if (relevant.length === 0) {
    const details = ['No crud/orgCrud factories found']
    if (skipped.length > 0)
      details.push(`${skipped.map(c => `${c.table} (${c.factory})`).join(', ')} \u2014 typically optional`)
    return { details, status: 'pass', title: 'Rate Limiting' }
  }
  const withRL: string[] = []
  const withoutRL: string[] = []
  for (const c of relevant)
    if (c.options.includes('rateLimit')) withRL.push(c.table)
    else withoutRL.push(`${c.table} (${c.factory})`)
  const details = [`${withRL.length}/${relevant.length} write factories have rateLimit`]
  if (withoutRL.length > 0) for (const name of withoutRL) details.push(`${name} missing rateLimit`)
  if (skipped.length > 0)
    details.push(`${skipped.map(c => `${c.table} (${c.factory})`).join(', ')} \u2014 typically optional`)
  return { details, status: withoutRL.length > 0 ? 'warn' : 'pass', title: 'Rate Limiting' }
}
const checkEslintContent = (content?: string): CheckResult => {
  if (content === undefined)
    return { details: ['No lintmax.config.ts file found'], status: 'warn', title: 'ESLint Configuration' }
  if (content.includes('@noboil/convex/eslint'))
    return { details: ['@noboil/convex/eslint plugin configured'], status: 'pass', title: 'ESLint Configuration' }
  return {
    details: ['lintmax.config.ts found but @noboil/convex/eslint not referenced'],
    status: 'warn',
    title: 'ESLint Configuration'
  }
}
const checkDeps = (pkg?: Record<string, unknown>): CheckResult => {
  if (!pkg) return { details: ['No package.json found'], status: 'fail', title: 'Dependencies' }
  const deps = (pkg.dependencies ?? {}) as Record<string, string>
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>
  const all = { ...deps, ...devDeps }
  const details: string[] = []
  const required = ['convex', 'zod', '@noboil/convex']
  let missing = 0
  for (const name of required)
    if (all[name]) details.push(`${name}: ${all[name]}`)
    else {
      details.push(`${name}: not found`)
      missing += 1
    }
  return { details, status: missing ? 'fail' : 'pass', title: 'Dependencies' }
}
const calcHealthScore = (results: CheckResult[]): number => {
  let score = HEALTH_MAX
  for (const r of results)
    if (r.status === 'fail') score -= HEALTH_ERROR_PENALTY
    else if (r.status === 'warn') score -= HEALTH_WARN_PENALTY
  return Math.max(0, score)
}
const doctor = () => {
  const root = process.cwd()
  console.log(bold('\n@noboil/convex doctor\n'))
  const convexDir = findConvexDir(root)
  if (!convexDir) {
    console.log(red('\u2717 Could not find convex/ directory with _generated/'))
    console.log(dim('  Run from project root or a directory containing convex/'))
    process.exit(1)
  }
  const schemaFile = findSchemaFile(convexDir)
  if (!schemaFile) {
    console.log(red('\u2717 Could not find schema file with @noboil/convex markers'))
    console.log(dim('  Expected a .ts file importing makeOwned/makeOrgScoped/etc.'))
    process.exit(1)
  }
  const calls = extractFactoryCalls(convexDir)
  const tables = extractSchemaFields(schemaFile.content)
  const results: CheckResult[] = []
  const schemaIssues = checkSchemaConsistency(convexDir, schemaFile)
  const schemaErrors = schemaIssues.filter(i => i.level === 'error')
  const schemaWarns = schemaIssues.filter(i => i.level === 'warn')
  if (schemaErrors.length > 0)
    results.push({ details: schemaErrors.map(e => e.message), status: 'fail', title: 'Schema Consistency' })
  else if (schemaWarns.length > 0)
    results.push({
      details: [`${tables.length} tables, ${calls.length} factories, ${schemaWarns.length} warning(s)`],
      status: 'warn',
      title: 'Schema Consistency'
    })
  else
    results.push({
      details: [`${tables.length} tables, ${calls.length} factory calls, all matched`],
      status: 'pass',
      title: 'Schema Consistency'
    })
  let totalEps = 0
  for (const c of calls) totalEps += endpointsForFactory(c).length
  results.push({
    details: [`${totalEps} endpoints from ${calls.length} factories`],
    status: 'pass',
    title: 'Endpoint Coverage'
  })
  const indexIssues = checkIndexCoverage(convexDir, calls)
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
  results.push(checkRateLimit(calls))
  const lintmaxConfigPath = join(root, 'lintmax.config.ts')
  const eslintContent = existsSync(lintmaxConfigPath) ? readFileSync(lintmaxConfigPath, 'utf8') : undefined
  results.push(checkEslintContent(eslintContent))
  const pkgPath = join(root, 'package.json')
  const pkg = existsSync(pkgPath) ? (JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>) : undefined
  results.push(checkDeps(pkg))
  for (const r of results) {
    const icon = STATUS_ICON[r.status] ?? '?'
    console.log(`[${icon}] ${r.title}`)
    for (const d of r.details) console.log(`    \u2022 ${d}`)
    console.log('')
  }
  let passed = 0
  let warned = 0
  let failed = 0
  for (const r of results)
    if (r.status === 'pass') passed += 1
    else if (r.status === 'warn') warned += 1
    else failed += 1
  const score = calcHealthScore(results)
  const scoreColor = score >= 90 ? green : score >= 70 ? yellow : red
  console.log(`Summary: ${passed} passed, ${warned} warning(s), ${failed} error(s)`)
  console.log(`Health Score: ${scoreColor(`${score}/${HEALTH_MAX}`)}\n`)
}
if (import.meta.main) doctor()
export { calcHealthScore, checkDeps, checkEslintContent, checkRateLimit, doctor }
export type { CheckResult }

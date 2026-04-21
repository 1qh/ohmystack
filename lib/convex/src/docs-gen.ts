#!/usr/bin/env bun
/* eslint-disable no-console */
import { extractJSDoc, green, processEntryPoint, resolveReExports } from '@noboil/shared/docs-gen'
import { bold, dim, isSchemaFile, red } from '@noboil/shared/viz'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FactoryCall } from './check'
import { endpointsForFactory } from './check'
import { extractChildren, extractWrapperTables } from './viz'
const schemaMarkers = ['makeOwned(', 'makeOrgScoped(', 'makeSingleton(', 'makeBase(', 'child(']
const factoryPat = /(?<factory>crud|orgCrud|childCrud|cacheCrud|singletonCrud)\(\s*['"](?<table>\w+)['"]/gu
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
      if (isSchemaFile(content, schemaMarkers)) return { content, path: full }
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
const FACTORY_DESCRIPTIONS: Record<string, string> = {
  cacheCrud: 'External API cache with TTL, auto-refresh, and invalidation',
  childCrud: 'Nested child CRUD with parent ownership verification',
  crud: 'User-owned CRUD with auth, pagination, where-clauses, and file handling',
  orgCrud: 'Organization-scoped CRUD with role-based access and optional ACL',
  singletonCrud: 'Single document per user (profile, settings)'
}
const ENDPOINT_ARGS: Record<string, string> = {
  addEditor: '`{ orgId, [table]Id, editorId }`',
  all: '`{}`',
  create: 'Schema fields or `{ items: [...] }` for bulk (validated by Zod)',
  editors: '`{ orgId, [table]Id }`',
  get: '`{ id }`',
  invalidate: '`{ [key] }`',
  list: '`{ paginationOpts, where? }` or `{ orgId, paginationOpts }`',
  load: '`{ [key] }`',
  'pub.get': '`{ id }`',
  'pub.list': '`{ [foreignKey], limit? }`',
  'pub.read': '`{ id, own?, where? }`',
  'pub.search': '`{ query, where? }`',
  purge: '`{}`',
  read: '`{ id, own?, where? }` or `{ orgId, id }`',
  refresh: '`{ [key] }`',
  removeEditor: '`{ orgId, [table]Id, editorId }`',
  restore: '`{ id }` or `{ orgId, id }`',
  rm: '`{ id }` or `{ ids: [...] }` for bulk, or `{ orgId, id/ids }`',
  search: '`{ query, where? }`',
  setEditors: '`{ orgId, [table]Id, editorIds }`',
  update: '`{ id, ...partialFields }` or `{ items: [{ id, ...fields }] }` for bulk',
  upsert: 'Schema fields (validated by Zod)'
}
const ENDPOINT_RETURNS: Record<string, string> = {
  addEditor: 'Updated document',
  all: 'All cached documents',
  create: 'Document ID (string) or array of IDs for bulk',
  editors: 'Array of `{ userId, name, email }`',
  get: 'Document or null',
  invalidate: 'Deleted cache entry or null',
  list: '`{ page, isDone, continueCursor }`',
  load: 'Fetched document (with `cacheHit` flag)',
  'pub.get': 'Document or null',
  'pub.list': 'Array of documents',
  'pub.read': 'Enriched document or null',
  'pub.search': 'Array of enriched documents',
  purge: 'Count of purged entries',
  read: 'Enriched document or null',
  refresh: 'Refreshed document (with `cacheHit` flag)',
  removeEditor: 'Updated document',
  restore: 'Restored document',
  rm: 'Deleted document or count for bulk',
  search: 'Array of enriched documents',
  setEditors: 'Updated document',
  update: 'Updated document or array for bulk',
  upsert: 'Upserted document'
}
const ENDPOINT_TYPES: Record<string, string> = {
  addEditor: 'mutation',
  all: 'query',
  create: 'mutation',
  editors: 'query',
  get: 'query',
  invalidate: 'mutation',
  list: 'query',
  load: 'action',
  'pub.get': 'query',
  'pub.list': 'query',
  'pub.read': 'query',
  'pub.search': 'query',
  purge: 'mutation',
  read: 'query',
  refresh: 'action',
  removeEditor: 'mutation',
  restore: 'mutation',
  rm: 'mutation',
  search: 'query',
  setEditors: 'mutation',
  update: 'mutation',
  upsert: 'mutation'
}
const generateMarkdown = (calls: FactoryCall[], tableFields: Map<string, { name: string; type: string }[]>): string => {
  const lines: string[] = [
    '# API Reference',
    '',
    '*Auto-generated by `noboil-convex docs`*',
    '',
    `**${calls.length} factory calls** generating endpoints across your project.`,
    '',
    '## Tables',
    '',
    '| Table | Factory | File | Endpoints |',
    '|-------|---------|------|-----------|'
  ]
  for (const call of calls) {
    const eps = endpointsForFactory(call)
    lines.push(`| ${call.table} | \`${call.factory}\` | ${call.file} | ${eps.length} |`)
  }
  lines.push('')
  for (const call of calls) {
    const eps = endpointsForFactory(call)
    const desc = FACTORY_DESCRIPTIONS[call.factory] ?? ''
    const fields = tableFields.get(call.table)
    lines.push(`## ${call.table}`, '')
    lines.push(`**Factory:** \`${call.factory}\` · **File:** \`${call.file}\``)
    if (desc) lines.push('', desc)
    lines.push('')
    if (fields !== undefined && fields.length > 0) {
      lines.push('### Schema Fields', '')
      lines.push('| Field | Type |')
      lines.push('|-------|------|')
      for (const f of fields) lines.push(`| ${f.name} | \`${f.type}\` |`)
      lines.push('')
    }
    lines.push('### Endpoints', '')
    lines.push('| Endpoint | Type | Args | Returns |')
    lines.push('|----------|------|------|---------|')
    for (const ep of eps) {
      const epType = ENDPOINT_TYPES[ep] ?? 'query'
      const args = ENDPOINT_ARGS[ep] ?? ''
      const returns = ENDPOINT_RETURNS[ep] ?? ''
      lines.push(`| \`${call.table}.${ep}\` | ${epType} | ${args} | ${returns} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
const ENTRY_POINTS: { label: string; path: string }[] = [
  { label: '@noboil/convex', path: 'index.ts' },
  { label: '@noboil/convex/schema', path: 'schema.ts' },
  { label: '@noboil/convex/react', path: 'react/index.ts' },
  { label: '@noboil/convex/server', path: 'server/index.ts' },
  { label: '@noboil/convex/components', path: 'components/index.ts' },
  { label: '@noboil/convex/next', path: 'next/index.ts' },
  { label: '@noboil/convex/zod', path: 'zod.ts' },
  { label: '@noboil/convex/seed', path: 'seed.ts' },
  { label: '@noboil/convex/retry', path: 'retry.ts' },
  { label: '@noboil/convex/eslint', path: 'eslint.ts' },
  { label: '@noboil/convex/test', path: 'server/test.ts' }
]
const generateFullReference = (srcDir: string): string => {
  const lines: string[] = [
    '# @noboil/convex \u2014 Full API Reference',
    '',
    '*Auto-generated by `noboil-convex docs --full`*',
    ''
  ]
  let totalSymbols = 0
  for (const ep of ENTRY_POINTS) totalSymbols += processEntryPoint(ep, srcDir, lines)
  lines.push('---', '', `**${totalSymbols} exports** across ${ENTRY_POINTS.length} entry points.`)
  return lines.join('\n')
}
const run = () => {
  const root = process.cwd()
  const flags = new Set(process.argv.slice(2))
  console.log(bold('\n@noboil/convex docs\n'))
  if (flags.has('--full')) {
    const srcDir = join(root, 'src')
    if (!existsSync(srcDir)) {
      console.log(red('\u2717 Could not find src/ directory'))
      process.exit(1)
    }
    console.log(generateFullReference(srcDir))
    return
  }
  const convexDir = findConvexDir(root)
  if (!convexDir) {
    console.log(red('\u2717 Could not find convex/ directory with _generated/'))
    process.exit(1)
  }
  const schemaFile = findSchemaFile(convexDir)
  if (!schemaFile) {
    console.log(red('\u2717 Could not find schema file with @noboil/convex markers'))
    process.exit(1)
  }
  console.log(`${dim('schema:')} ${schemaFile.path}`)
  console.log(`${dim('convex:')} ${convexDir}\n`)
  const calls = extractFactoryCalls(convexDir)
  const tables = extractWrapperTables(schemaFile.content)
  const children = extractChildren(schemaFile.content)
  const tableFields = new Map<string, { name: string; type: string }[]>()
  for (const t of tables) tableFields.set(t.name, t.fields)
  for (const c of children) tableFields.set(c.name, c.fields)
  if (flags.has('--markdown') || flags.has('--md')) {
    console.log(generateMarkdown(calls, tableFields))
    return
  }
  let total = 0
  for (const call of calls) {
    const eps = endpointsForFactory(call)
    const fields = tableFields.get(call.table)
    total += eps.length
    console.log(`${bold(call.table)} ${dim(`(${call.factory})`)} ${dim(`\u2014 ${call.file}`)}`)
    if (fields !== undefined && fields.length > 0)
      console.log(`  ${dim('fields:')} ${fields.map(f => `${f.name}: ${f.type}`).join(', ')}`)
    console.log(`  ${dim('endpoints:')} ${eps.join(', ')}`)
    console.log('')
  }
  console.log(`${green('\u2713')} ${bold(String(total))} endpoints from ${bold(String(calls.length))} factories`)
  console.log(dim('\nRun with --markdown for full API reference output\n'))
}
if (import.meta.main) run()
export { extractJSDoc, generateFullReference, generateMarkdown, resolveReExports }

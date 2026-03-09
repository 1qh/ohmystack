#!/usr/bin/env bun
/* eslint-disable no-console */

/** biome-ignore-all lint/style/noProcessEnv: cli */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { FactoryCall } from './check'

import { endpointsForFactory } from './check'
import { extractChildren, extractWrapperTables } from './viz'

const dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  schemaMarkers = ['makeOwned(', 'makeOrgScoped(', 'makeSingleton(', 'makeBase(', 'child('],
  factoryPat = /(?<factory>crud|orgCrud|childCrud|cacheCrud|singletonCrud)\(\s*['"](?<table>\w+)['"]/gu,
  isSchemaFile = (content: string): boolean => {
    for (const marker of schemaMarkers) if (content.includes(marker)) return true
    return false
  },
  hasGenerated = (dir: string): boolean => existsSync(join(dir, '_generated')),
  findConvexDir = (root: string): string | undefined => {
    const direct = join(root, 'convex')
    if (hasGenerated(direct)) return direct
    if (!existsSync(root)) return
    for (const sub of readdirSync(root, { withFileTypes: true }))
      if (sub.isDirectory()) {
        const nested = join(root, sub.name, 'convex')
        if (hasGenerated(nested)) return nested
      }
  },
  findSchemaFile = (convexDir: string): undefined | { content: string; path: string } => {
    const searchDir = dirname(convexDir)
    if (!existsSync(searchDir)) return
    for (const entry of readdirSync(searchDir))
      if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.config.ts')) {
        const full = join(searchDir, entry),
          content = readFileSync(full, 'utf8')
        if (isSchemaFile(content)) return { content, path: full }
      }
  },
  extractRemainingOptions = (content: string, startPos: number): string => {
    let depth = 1,
      pos = startPos
    while (pos < content.length && depth > 0) {
      if (content[pos] === '(') depth += 1
      else if (content[pos] === ')') depth -= 1
      pos += 1
    }
    return content.slice(startPos, pos - 1)
  },
  extractFactoryCalls = (convexDir: string): FactoryCall[] => {
    const calls: FactoryCall[] = []
    for (const entry of readdirSync(convexDir))
      if (entry.endsWith('.ts') && !entry.startsWith('_') && !entry.includes('.test.') && !entry.includes('.config.')) {
        const full = join(convexDir, entry),
          content = readFileSync(full, 'utf8')
        let m = factoryPat.exec(content)
        while (m) {
          if (m.groups?.factory && m.groups.table) {
            const afterTable = content.indexOf(m.groups.table, m.index) + m.groups.table.length,
              rest = extractRemainingOptions(content, afterTable)
            calls.push({ factory: m.groups.factory, file: entry, options: rest, table: m.groups.table })
          }
          m = factoryPat.exec(content)
        }
        factoryPat.lastIndex = 0
      }
    return calls
  },
  FACTORY_DESCRIPTIONS: Record<string, string> = {
    cacheCrud: 'External API cache with TTL, auto-refresh, and invalidation',
    childCrud: 'Nested child CRUD with parent ownership verification',
    crud: 'User-owned CRUD with auth, pagination, where-clauses, and file handling',
    orgCrud: 'Organization-scoped CRUD with role-based access and optional ACL',
    singletonCrud: 'Single document per user (profile, settings)'
  },
  ENDPOINT_ARGS: Record<string, string> = {
    addEditor: '`{ orgId, [table]Id, editorId }`',
    all: '`{}`',
    bulkRm: '`{ ids }` or `{ orgId, ids }`',
    bulkUpdate: '`{ ids, data }` or `{ orgId, ids, data }`',
    create: 'Schema fields (validated by Zod)',
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
    rm: '`{ id }` or `{ orgId, id }`',
    search: '`{ query, where? }`',
    setEditors: '`{ orgId, [table]Id, editorIds }`',
    update: '`{ id, ...partialFields, expectedUpdatedAt? }`',
    upsert: 'Schema fields (validated by Zod)'
  },
  ENDPOINT_RETURNS: Record<string, string> = {
    addEditor: 'Updated document',
    all: 'All cached documents',
    bulkRm: 'Count of deleted items',
    bulkUpdate: 'Array of updated documents',
    create: 'Document ID (string)',
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
    rm: 'Deleted document',
    search: 'Array of enriched documents',
    setEditors: 'Updated document',
    update: 'Updated document',
    upsert: 'Upserted document'
  },
  ENDPOINT_TYPES: Record<string, string> = {
    addEditor: 'mutation',
    all: 'query',
    bulkRm: 'mutation',
    bulkUpdate: 'mutation',
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
  },
  generateMarkdown = (calls: FactoryCall[], tableFields: Map<string, { name: string; type: string }[]>): string => {
    const lines: string[] = [
      '# API Reference',
      '',
      '*Auto-generated by `ohmystack-convex docs`*',
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
      const eps = endpointsForFactory(call),
        desc = FACTORY_DESCRIPTIONS[call.factory] ?? '',
        fields = tableFields.get(call.table)
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
        const epType = ENDPOINT_TYPES[ep] ?? 'query',
          args = ENDPOINT_ARGS[ep] ?? '',
          returns = ENDPOINT_RETURNS[ep] ?? ''
        lines.push(`| \`${call.table}.${ep}\` | ${epType} | ${args} | ${returns} |`)
      }
      lines.push('')
    }
    return lines.join('\n')
  },
  reExportPat = /export\s+(?<typeKw>type\s+)?\{\s*(?<sym>(?:default\s+as\s+)?\w+)\s*\}\s*from\s*['"](?<src>[^'"]+)['"]/gu,
  tsExtPat = /\.ts$/u,
  leadingWsPat = /^\s+/u,
  trailingWsPat = /\s+$/u,
  jsdocStarPat = /^\s*\*\s?/gmu,
  resolveReExports = (
    indexContent: string
  ): { isDefault: boolean; isType: boolean; sourcePath: string; symbol: string }[] => {
    const results: { isDefault: boolean; isType: boolean; sourcePath: string; symbol: string }[] = []
    let m = reExportPat.exec(indexContent)
    while (m) {
      const raw = m.groups?.sym ?? '',
        src = m.groups?.src ?? '',
        isType = (m.groups?.typeKw ?? '').trim() === 'type',
        isDefault = raw.startsWith('default as'),
        symbol = isDefault ? raw.replace('default as ', '').trim() : raw.trim()
      if (symbol && src) results.push({ isDefault, isType, sourcePath: src, symbol })
      m = reExportPat.exec(indexContent)
    }
    reExportPat.lastIndex = 0
    return results
  },
  extractJSDoc = (fileContent: string, symbolName: string): string => {
    const escaped = symbolName.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`),
      patterns = [
        new RegExp(`/\\*\\*([\\s\\S]*?)\\*/\\s*(?:export\\s+)?const\\s+${escaped}\\b`, 'u'),
        new RegExp(`/\\*\\*([\\s\\S]*?)\\*/\\s*(?:export\\s+)?interface\\s+${escaped}\\b`, 'u'),
        new RegExp(`/\\*\\*([\\s\\S]*?)\\*/\\s*(?:export\\s+)?type\\s+${escaped}\\b`, 'u')
      ]
    for (const pat of patterns) {
      const match = pat.exec(fileContent)
      if (match?.[1]) {
        const raw = match[1].replace(jsdocStarPat, '').replace(leadingWsPat, '').replace(trailingWsPat, '')
        if (raw) return raw
      }
    }
    return ''
  },
  extractSignature = (fileContent: string, symbolName: string): string => {
    const escaped = symbolName.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`),
      constPat = new RegExp(`const\\s+${escaped}\\s*(?::\\s*([^=]+))?=\\s*(.+)`, 'u'),
      constMatch = constPat.exec(fileContent)
    if (constMatch !== null) {
      const annotation = constMatch[1]?.trim()
      if (annotation) return annotation
      const rhs = constMatch[2]?.trim() ?? '',
        arrowIdx = rhs.indexOf('=>')
      if (arrowIdx > 0) {
        const params = rhs.slice(0, arrowIdx).trim()
        if (params.startsWith('(')) return `${params} => ...`
      }
    }
    const ifacePat = new RegExp(`interface\\s+${escaped}\\s*\\{([^}]*)\\}`, 'u'),
      ifaceMatch = ifacePat.exec(fileContent)
    if (ifaceMatch?.[1]) {
      const keys: string[] = [],
        fieldPat = /^\s*(?<field>\w+)\s*[:(]/gmu
      let fm = fieldPat.exec(ifaceMatch[1])
      while (fm) {
        if (fm.groups?.field) keys.push(fm.groups.field)
        fm = fieldPat.exec(ifaceMatch[1])
      }
      if (keys.length > 0) return `{ ${keys.join(', ')} }`
    }
    return ''
  },
   ENTRY_POINTS: { label: string; path: string }[] = [
     { label: '@ohmystack/convex', path: 'index.ts' },
     { label: '@ohmystack/convex/schema', path: 'schema.ts' },
     { label: '@ohmystack/convex/react', path: 'react/index.ts' },
     { label: '@ohmystack/convex/server', path: 'server/index.ts' },
     { label: '@ohmystack/convex/components', path: 'components/index.ts' },
     { label: '@ohmystack/convex/next', path: 'next/index.ts' },
     { label: '@ohmystack/convex/zod', path: 'zod.ts' },
     { label: '@ohmystack/convex/seed', path: 'seed.ts' },
     { label: '@ohmystack/convex/retry', path: 'retry.ts' },
     { label: '@ohmystack/convex/eslint', path: 'eslint.ts' },
     { label: '@ohmystack/convex/test', path: 'server/test.ts' }
   ],
  processEntryPoint = (ep: { label: string; path: string }, srcDir: string, lines: string[]): number => {
    const indexPath = join(srcDir, ep.path)
    if (!existsSync(indexPath)) return 0
    const indexContent = readFileSync(indexPath, 'utf8'),
      reExports = resolveReExports(indexContent)
    if (reExports.length === 0) return 0
    lines.push(`## ${ep.label}`, '')
    lines.push('| Export | Kind | Description | Signature |')
    lines.push('|--------|------|-------------|-----------|')
    let count = 0
    for (const re of reExports) {
      const sourceFile = join(dirname(indexPath), `${re.sourcePath.replace(tsExtPat, '')}.ts`)
      let doc = '',
        sig = ''
      if (existsSync(sourceFile)) {
        const src = readFileSync(sourceFile, 'utf8')
        doc = extractJSDoc(src, re.symbol)
        sig = extractSignature(src, re.symbol)
      }
      if (!doc) doc = extractJSDoc(indexContent, re.symbol)
      if (!sig) sig = extractSignature(indexContent, re.symbol)
      const kind = re.isType ? 'type' : re.isDefault ? 'default' : 'named'
      lines.push(`| \`${re.symbol}\` | ${kind} | ${doc} | ${sig ? `\`${sig}\`` : ''} |`)
      count += 1
    }
    lines.push('')
    return count
  },
  generateFullReference = (srcDir: string): string => {
    const lines: string[] = [
     '# @ohmystack/convex \u2014 Full API Reference',
       '',
       '*Auto-generated by `ohmystack-convex docs --full`*',
      ''
    ]
    let totalSymbols = 0
    for (const ep of ENTRY_POINTS) totalSymbols += processEntryPoint(ep, srcDir, lines)
    lines.push('---', '', `**${totalSymbols} exports** across ${ENTRY_POINTS.length} entry points.`)
    return lines.join('\n')
  },
  run = () => {
    const root = process.cwd(),
      flags = new Set(process.argv.slice(2))

     console.log(bold('\n@ohmystack/convex docs\n'))

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
       console.log(red('\u2717 Could not find schema file with @ohmystack/convex markers'))
      process.exit(1)
    }
    console.log(`${dim('schema:')} ${schemaFile.path}`)
    console.log(`${dim('convex:')} ${convexDir}\n`)

    const calls = extractFactoryCalls(convexDir),
      tables = extractWrapperTables(schemaFile.content),
      children = extractChildren(schemaFile.content),
      tableFields = new Map<string, { name: string; type: string }[]>()
    for (const t of tables) tableFields.set(t.name, t.fields)
    for (const c of children) tableFields.set(c.name, c.fields)

    if (flags.has('--markdown') || flags.has('--md')) {
      console.log(generateMarkdown(calls, tableFields))
      return
    }

    let total = 0
    for (const call of calls) {
      const eps = endpointsForFactory(call),
        fields = tableFields.get(call.table)
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

#!/usr/bin/env bun
/* eslint-disable no-console, max-depth */
/** biome-ignore-all lint/style/noProcessEnv: cli */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential */
// biome-ignore-all lint/nursery/noUnnecessaryConditions: type narrowing
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { FactoryCall } from './check'

import { endpointsForFactory, extractSchemaFields } from './check'

const dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
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
    const byTable = new Map<string, { endpoints: Set<string>; file: string }>(),
      files = listTypeScriptFiles(moduleDir)
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
      calls.push({
        factory: 'reducer',
        file: entry.file,
        options: `endpoints=${[...entry.endpoints].toSorted().join(',')}`,
        table
      })
    return calls
  },
  FACTORY_DESCRIPTIONS: Record<string, string> = {
    reducer: 'SpacetimeDB reducers for table operations'
  },
  ENDPOINT_ARGS: Record<string, string> = {
    create: 'Table field payload',
    get: '`{ id }` or primary-key selector',
    list: 'Optional pagination/filter payload',
    read: '`{ id }`',
    rm: '`{ id }`',
    search: '`{ query, where? }`',
    update: '`{ id, ...partialFields }`',
    upsert: 'Table field payload'
  },
  ENDPOINT_RETURNS: Record<string, string> = {
    create: 'Inserted row or row id',
    get: 'Row or null',
    list: 'Rows list',
    read: 'Row or null',
    rm: 'Deleted row metadata',
    search: 'Rows list',
    update: 'Updated row',
    upsert: 'Upserted row'
  },
  ENDPOINT_TYPES: Record<string, string> = {
    create: 'reducer',
    get: 'reducer',
    list: 'reducer',
    read: 'reducer',
    rm: 'reducer',
    search: 'reducer',
    update: 'reducer',
    upsert: 'reducer'
  },
  generateMarkdown = (calls: FactoryCall[], tableFields: Map<string, { name: string; type: string }[]>): string => {
    const lines: string[] = [
      '# API Reference',
      '',
      '*Auto-generated by `noboil-stdb docs`*',
      '',
      `**${calls.length} table reducer groups** registered across your project.`,
      '',
      '## Tables',
      '',
      '| Table | Source | Reducers |',
      '|-------|--------|----------|'
    ]
    for (const call of calls) {
      const eps = endpointsForFactory(call)
      lines.push(`| ${call.table} | \`${call.file}\` | ${eps.length} |`)
    }
    lines.push('')
    for (const call of calls) {
      const eps = endpointsForFactory(call),
        desc = FACTORY_DESCRIPTIONS[call.factory] ?? '',
        fields = tableFields.get(call.table)
      lines.push(`## ${call.table}`, '')
      lines.push(`**Source:** \`${call.file}\``)
      if (desc) lines.push('', desc)
      lines.push('')
      if (fields && fields.length > 0) {
        lines.push('### Schema Fields', '')
        lines.push('| Field | Type |')
        lines.push('|-------|------|')
        for (const f of fields) lines.push(`| ${f.name} | \`${f.type}\` |`)
        lines.push('')
      }
      lines.push('### Reducers', '')
      lines.push('| Reducer | Type | Args | Returns |')
      lines.push('|---------|------|------|---------|')
      for (const ep of eps) {
        const rootName = ep.includes('.') ? ep.slice(ep.lastIndexOf('.') + 1) : ep,
          epType = ENDPOINT_TYPES[rootName] ?? 'reducer',
          args = ENDPOINT_ARGS[rootName] ?? 'Custom reducer payload',
          returns = ENDPOINT_RETURNS[rootName] ?? 'Custom reducer return value'
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
    if (constMatch) {
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
    { label: '@noboil/spacetimedb', path: 'index.ts' },
    { label: '@noboil/spacetimedb/schema', path: 'schema.ts' },
    { label: '@noboil/spacetimedb/react', path: 'react/index.ts' },
    { label: '@noboil/spacetimedb/server', path: 'server/index.ts' },
    { label: '@noboil/spacetimedb/components', path: 'components/index.ts' },
    { label: '@noboil/spacetimedb/next', path: 'next/index.ts' },
    { label: '@noboil/spacetimedb/zod', path: 'zod.ts' },
    { label: '@noboil/spacetimedb/seed', path: 'seed.ts' },
    { label: '@noboil/spacetimedb/retry', path: 'retry.ts' },
    { label: '@noboil/spacetimedb/eslint', path: 'eslint.ts' },
    { label: '@noboil/spacetimedb/test', path: 'server/test.ts' }
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
      '# @noboil/spacetimedb — Full API Reference',
      '',
      '*Auto-generated by `noboil-stdb docs --full`*',
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

    console.log(bold('\nnoboil-stdb docs\n'))

    if (flags.has('--full')) {
      const srcDir = join(root, 'src')
      if (!existsSync(srcDir)) {
        console.log(red('✗ Could not find src/ directory'))
        process.exit(1)
      }
      console.log(generateFullReference(srcDir))
      return
    }

    const moduleDir = findModuleDir(root)
    if (!moduleDir) {
      console.log(red('✗ Could not find module/ directory with SpacetimeDB schema'))
      process.exit(1)
    }

    const schemaFile = findSchemaFile(moduleDir)
    if (!schemaFile) {
      console.log(red('✗ Could not find schema file with SpacetimeDB markers'))
      process.exit(1)
    }
    console.log(`${dim('schema:')} ${schemaFile.path}`)
    console.log(`${dim('module:')} ${moduleDir}\n`)

    const calls = extractFactoryCalls(moduleDir),
      schemaTables = extractSchemaFields(schemaFile.content),
      tableFields = new Map<string, { name: string; type: string }[]>()
    for (const t of schemaTables)
      tableFields.set(
        t.table,
        t.fields.map(f => ({ name: f.field, type: f.type }))
      )

    if (flags.has('--markdown') || flags.has('--md')) {
      console.log(generateMarkdown(calls, tableFields))
      return
    }

    let total = 0
    for (const call of calls) {
      const eps = endpointsForFactory(call),
        fields = tableFields.get(call.table)
      total += eps.length
      console.log(`${bold(call.table)} ${dim(`(${call.factory})`)} ${dim(`— ${call.file}`)}`)
      if (fields && fields.length > 0)
        console.log(`  ${dim('fields:')} ${fields.map(f => `${f.name}: ${f.type}`).join(', ')}`)
      console.log(`  ${dim('reducers:')} ${eps.join(', ')}`)
      console.log('')
    }
    console.log(`${green('✓')} ${bold(String(total))} reducers from ${bold(String(calls.length))} tables`)
    console.log(dim('\nRun with --markdown for full API reference output\n'))
  }

if (import.meta.main) run()

export { extractJSDoc, generateFullReference, generateMarkdown, resolveReExports }

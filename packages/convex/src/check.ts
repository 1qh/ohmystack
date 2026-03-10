#!/usr/bin/env bun
/* eslint-disable complexity */
/* eslint-disable no-console */
/* oxlint-disable eslint/max-statements, eslint/complexity, max-depth */
/** biome-ignore-all lint/style/noProcessEnv: cli */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import type { FactoryCall, SchemaField, SchemaTable } from './schema-utils'

import {
  CACHE_BASE,
  CHILD_BASE,
  CRUD_PUB,
  endpointsForFactory,
  extractSchemaFields,
  hasOption,
  ORG_ACL,
  parseObjectFields,
  SINGLETON_BASE,
  wrapperFactories
} from './schema-utils'

const red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`

interface AccessEntry {
  endpoints: string[]
  level: string
}

interface Issue {
  file?: string
  level: 'error' | 'warn'
  message: string
}

interface TableIndex {
  fields: string[]
  name: string
  type: 'custom' | 'default' | 'search'
}

interface WhereField {
  field: string
  source: string
  table: string
}

const schemaMarkers = ['makeOwned(', 'makeOrgScoped(', 'makeSingleton(', 'makeBase(', 'child('],
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
  extractSchemaTableNames = (content: string): Set<string> => {
    const tables = new Set<string>()
    for (const factory of wrapperFactories) {
      const pat = new RegExp(`${factory}\\(\\{`, 'gu')
      let fm: null | RegExpExecArray = pat.exec(content)
      while (fm !== null) {
        let depth = 1,
          pos = fm.index + fm[0].length
        while (pos < content.length && depth > 0) {
          if (content[pos] === '{') depth += 1
          else if (content[pos] === '}') depth -= 1
          pos += 1
        }
        const block = content.slice(fm.index + fm[0].length, pos - 1),
          propPat = /(?<pname>\w+)\s*:\s*object\(/gu
        let pm = propPat.exec(block)
        while (pm) {
          if (pm.groups?.pname) tables.add(pm.groups.pname)
          pm = propPat.exec(block)
        }
        fm = pat.exec(content)
      }
    }
    const childPat = /(?<cname>\w+)\s*:\s*child\(/gu
    let cm = childPat.exec(content)
    while (cm) {
      if (cm.groups?.cname) tables.add(cm.groups.cname)
      cm = childPat.exec(content)
    }
    return tables
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
  extractFactoryCalls = (convexDir: string): { calls: FactoryCall[]; files: string[] } => {
    const calls: FactoryCall[] = [],
      files: string[] = []
    for (const entry of readdirSync(convexDir))
      if (entry.endsWith('.ts') && !entry.startsWith('_') && !entry.includes('.test.') && !entry.includes('.config.')) {
        const full = join(convexDir, entry),
          content = readFileSync(full, 'utf8')
        files.push(entry)
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
    return { calls, files }
  },
  printSchemaPreview = (content: string, calls: FactoryCall[]) => {
    const tables = extractSchemaFields(content)
    console.log(bold('Schema Preview\n'))
    if (tables.length === 0) {
      console.log(dim('  No tables found in schema file.\n'))
      return
    }
    for (const t of tables) {
      const call = calls.find(c => c.table === t.table),
        options: string[] = []
      if (call) {
        if (hasOption(call.options, 'search')) options.push('search')
        if (hasOption(call.options, 'softDelete')) options.push('softDelete')
        if (hasOption(call.options, 'acl')) options.push('acl')
        if (hasOption(call.options, 'rateLimit')) options.push('rateLimit')
        if (hasOption(call.options, 'pub')) options.push('pub')
      }
      const optStr = options.length > 0 ? ` ${dim(`[${options.join(', ')}]`)}` : ''
      console.log(`  ${bold(t.table)} ${dim(`(${t.factory})`)}${optStr}`)
      for (const f of t.fields) console.log(`    ${f.field.padEnd(20)} ${dim(f.type)}`)
      console.log('')
    }
    let totalFields = 0
    for (const t of tables) totalFields += t.fields.length
    console.log(`${bold(String(tables.length))} tables with ${bold(String(totalFields))} fields\n`)
  },
  printEndpoints = (calls: FactoryCall[]) => {
    let total = 0
    console.log(bold('Generated Endpoints\n'))
    for (const call of calls) {
      const eps = endpointsForFactory(call)
      total += eps.length
      console.log(`  ${bold(call.table)} ${dim(`(${call.factory})`)} ${dim(`\u2014 ${call.file}`)}`)
      const groups: Record<string, string[]> = {}
      for (const ep of eps) {
        const dot = ep.indexOf('.')
        if (dot > 0) {
          const prefix = ep.slice(0, dot),
            name = ep.slice(dot + 1)
          groups[prefix] ??= []
          groups[prefix].push(name)
        } else {
          groups[''] ??= []
          groups[''].push(ep)
        }
      }
      if (groups['']) console.log(`    ${groups[''].join(', ')}`)
      for (const [prefix, names] of Object.entries(groups))
        if (prefix) console.log(`    ${dim(`${prefix}.`)}${names.join(`, ${dim(`${prefix}.`)}`)}`)
      console.log('')
    }
    console.log(`${bold(String(total))} endpoints from ${bold(String(calls.length))} factory calls\n`)
  },
  runCheck = (convexDir: string, schemaFile: { content: string; path: string }) => {
    const issues: Issue[] = [],
      schemaTables = extractSchemaTableNames(schemaFile.content),
      { calls, files } = extractFactoryCalls(convexDir)

    console.log(`${dim('tables in schema:')} ${[...schemaTables].join(', ') || 'none'}`)
    console.log(`${dim('factory calls:')}    ${calls.length}\n`)

    const seen = new Map<string, string>()
    for (const call of calls) {
      if (seen.has(call.table))
        issues.push({
          file: call.file,
          level: 'error',
          message: `Duplicate factory for table "${call.table}" (also in ${seen.get(call.table)})`
        })
      else seen.set(call.table, call.file)

      if (!schemaTables.has(call.table))
        issues.push({
          file: call.file,
          level: 'error',
          message: `${call.factory}('${call.table}') but no "${call.table}" table found in schema`
        })
    }

    const factoryTables = new Set(calls.map(c => c.table))
    for (const table of schemaTables)
      if (!factoryTables.has(table))
        issues.push({
          file: basename(schemaFile.path),
          level: 'warn',
          message: `Table "${table}" defined in schema but no factory call found`
        })

    const convexFiles = new Set(files.map(f => f.replace('.ts', '')))
    for (const call of calls)
      if (call.table !== basename(call.file, '.ts') && !convexFiles.has(call.table))
        issues.push({
          file: call.file,
          level: 'warn',
          message: `${call.factory}('${call.table}') in ${call.file} — table name doesn't match filename`
        })

    if (issues.length === 0) {
      console.log(green('\u2713 All checks passed\n'))
      return
    }

    const errors = issues.filter(i => i.level === 'error'),
      warnings = issues.filter(i => i.level === 'warn')

    for (const issue of errors) console.log(`${red('\u2717')} ${issue.file ? `${dim(issue.file)} ` : ''}${issue.message}`)
    for (const issue of warnings)
      console.log(`${yellow('\u26A0')} ${issue.file ? `${dim(issue.file)} ` : ''}${issue.message}`)

    console.log(
      `\n${errors.length > 0 ? red(`${errors.length} error(s)`) : ''}${errors.length > 0 && warnings.length > 0 ? ', ' : ''}${warnings.length > 0 ? yellow(`${warnings.length} warning(s)`) : ''}\n`
    )

    if (errors.length > 0) process.exit(1)
  },
  FACTORY_DEFAULT_INDEXES: Record<string, TableIndex[]> = {
    cacheCrud: [],
    childCrud: [],
    crud: [{ fields: ['userId'], name: 'by_user', type: 'default' }],
    orgCrud: [
      { fields: ['orgId'], name: 'by_org', type: 'default' },
      { fields: ['orgId', 'userId'], name: 'by_org_user', type: 'default' }
    ],
    singletonCrud: [{ fields: ['userId'], name: 'by_user', type: 'default' }]
  },
  RESERVED_WHERE_KEYS = new Set(['$between', '$gt', '$gte', '$lt', '$lte', 'or', 'own']),
  TABLE_HELPER_SRC = [
    'ownedTable',
    'orgTable',
    'orgChildTable',
    'childTable',
    'baseTable',
    'singletonTable',
    'defineTable'
  ].join('|'),
  findSchemaDefFile = (convexDir: string): undefined | { content: string; path: string } => {
    for (const name of readdirSync(convexDir))
      if (name.endsWith('.ts') && !name.includes('.test.') && !name.startsWith('_')) {
        const full = join(convexDir, name),
          content = readFileSync(full, 'utf8')
        if (content.includes('defineSchema(')) return { content, path: full }
      }
  },
  extractCustomIndexes = (schemaContent: string): Map<string, TableIndex[]> => {
    const result = new Map<string, TableIndex[]>(),
      helperPat = new RegExp(`(\\w+)\\s*:\\s*(?:${TABLE_HELPER_SRC})\\s*\\(`, 'gu'),
      tables: { name: string; pos: number }[] = []
    let tm: null | RegExpExecArray = helperPat.exec(schemaContent)
    while (tm !== null) {
      const tName = tm[1] ?? ''
      tables.push({ name: tName, pos: tm.index })
      result.set(tName, [])
      tm = helperPat.exec(schemaContent)
    }
    for (let ti = 0; ti < tables.length; ti += 1) {
      const tEntry = tables[ti]
      if (!tEntry) break
      const nextEntry = tables[ti + 1],
        start = tEntry.pos,
        end = nextEntry ? nextEntry.pos : schemaContent.length,
        segment = schemaContent.slice(start, end),
        tableName = tEntry.name,
        indexes = result.get(tableName) ?? [],
        idxPat = /\.index\(\s*['"](?<iname>[^'"]+)['"]\s*,\s*\[(?<ifields>[^\]]*)\]\s*\)/gu
      let im = idxPat.exec(segment)
      while (im) {
        const idxName = im.groups?.iname ?? '',
          idxFieldsRaw = im.groups?.ifields ?? '',
          fields: string[] = [],
          fieldPat = /['"](?<fname>[^'"]+)['"]/gu
        let fm = fieldPat.exec(idxFieldsRaw)
        while (fm) {
          const fName = fm.groups?.fname ?? ''
          fields.push(fName)
          fm = fieldPat.exec(idxFieldsRaw)
        }
        indexes.push({ fields, name: idxName, type: 'custom' })
        im = idxPat.exec(segment)
      }
      const searchPat =
        /\.searchIndex\(\s*['"](?<sname>[^'"]+)['"]\s*,\s*\{[^}]*searchField:\s*['"](?<sfield>[^'"]+)['"]/gu
      let sm = searchPat.exec(segment)
      while (sm) {
        const sName = sm.groups?.sname ?? '',
          sField = sm.groups?.sfield ?? ''
        indexes.push({ fields: [sField], name: sName, type: 'search' })
        sm = searchPat.exec(segment)
      }
      result.set(tableName, indexes)
    }
    return result
  },
  extractWhereFromOptions = (opts: string): string[] => {
    const fields = new Set<string>(),
      whereIdx = opts.indexOf('where:')
    if (whereIdx === -1) return []
    const braceStart = opts.indexOf('{', whereIdx + 6)
    if (braceStart === -1) return []
    let depth = 1,
      pos = braceStart + 1
    while (pos < opts.length && depth > 0) {
      if (opts[pos] === '{') depth += 1
      else if (opts[pos] === '}') depth -= 1
      pos += 1
    }
    const block = opts.slice(braceStart + 1, pos - 1),
      fieldPat = /(?<wkey>\$?\w+)\s*:/gu
    let fm = fieldPat.exec(block)
    while (fm) {
      const fKey = fm.groups?.wkey ?? ''
      if (!RESERVED_WHERE_KEYS.has(fKey)) fields.add(fKey)
      fm = fieldPat.exec(block)
    }
    return [...fields]
  },
  scanWhereUsage = (root: string, cvxDir: string): WhereField[] => {
    const results: WhereField[] = [],
      schemaPath = join(cvxDir, 'schema.ts'),
      skip = new Set(['.cache', '.git', '.next', '.turbo', '_generated', 'build', 'dist', 'node_modules']),
      processFile = (filePath: string, fileName: string) => {
        const fileContent = readFileSync(filePath, 'utf8'),
          apiPat = /api\.(?<tbl>\w+)\.(?:list|search)\b/gu
        let am = apiPat.exec(fileContent)
        while (am) {
          const table = am.groups?.tbl ?? '',
            after = fileContent.slice(am.index, Math.min(am.index + 500, fileContent.length)),
            wIdx = after.indexOf('where:')
          if (wIdx !== -1 && wIdx < 200) {
            const wFields = extractWhereFromOptions(after.slice(Math.max(0, wIdx - 10)))
            for (const f of wFields) results.push({ field: f, source: fileName, table })
          }
          am = apiPat.exec(fileContent)
        }
      },
      scan = (dir: string) => {
        if (!existsSync(dir)) return
        for (const entry of readdirSync(dir, { withFileTypes: true }))
          if (entry.isDirectory()) {
            if (!(skip.has(entry.name) || entry.name.startsWith('.'))) scan(join(dir, entry.name))
          } else if (
            (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
            !entry.name.includes('.test.') &&
            !entry.name.includes('.config.') &&
            join(dir, entry.name) !== schemaPath
          )
            processFile(join(dir, entry.name), entry.name)
      }
    scan(root)
    return results
  },
  printIndexReport = (convexDir: string, calls: FactoryCall[]) => {
    const schemaDef = findSchemaDefFile(convexDir),
      customIndexes = schemaDef ? extractCustomIndexes(schemaDef.content) : new Map<string, TableIndex[]>(),
      root = dirname(convexDir),
      projectWhere = scanWhereUsage(root, convexDir),
      whereByTable = new Map<string, Set<string>>(),
      issues: Issue[] = []
    for (const w of projectWhere) {
      const set = whereByTable.get(w.table) ?? new Set()
      set.add(w.field)
      whereByTable.set(w.table, set)
    }
    for (const call of calls) {
      const wFields = extractWhereFromOptions(call.options)
      if (wFields.length > 0) {
        const set = whereByTable.get(call.table) ?? new Set()
        for (const f of wFields) set.add(f)
        whereByTable.set(call.table, set)
      }
    }
    console.log(bold('Index Analysis\n'))
    if (schemaDef) console.log(`${dim('schema def:')} ${schemaDef.path}\n`)
    let totalIndexes = 0
    for (const call of calls) {
      const defaults = FACTORY_DEFAULT_INDEXES[call.factory] ?? [],
        custom = customIndexes.get(call.table) ?? [],
        allIndexes = [...defaults, ...custom],
        allFields = new Set<string>()
      for (const idx of allIndexes) for (const f of idx.fields) allFields.add(f)
      totalIndexes += allIndexes.length
      console.log(`  ${bold(call.table)} ${dim(`(${call.factory})`)} ${dim(`\u2014 ${call.file}`)}`)
      for (const idx of allIndexes) {
        const symbol = idx.type === 'search' ? dim('\uD83D\uDD0D') : green('\u2713')
        console.log(`    ${symbol} ${idx.name} ${dim(`[${idx.fields.join(', ')}]`)} ${dim(`(${idx.type})`)}`)
      }
      if (allIndexes.length === 0) console.log(`    ${dim('(no indexes)')}`)
      const tableWhereFields = whereByTable.get(call.table)
      if (tableWhereFields)
        for (const field of tableWhereFields)
          if (!allFields.has(field)) {
            console.log(`    ${yellow('\u26A0')} where filter on '${field}' \u2014 no matching index`)
            issues.push({
              file: call.file,
              level: 'warn',
              message: `"${call.table}": where on '${field}' is runtime-filtered. Add .index('by_${field}', ['${field}']) for better performance`
            })
          }

      console.log('')
    }
    console.log(`${bold(String(totalIndexes))} indexes across ${bold(String(calls.length))} tables\n`)
    if (issues.length > 0) {
      console.log(bold('Performance Suggestions\n'))
      for (const issue of issues)
        console.log(`  ${yellow('\u26A0')} ${issue.file ? `${dim(issue.file)} ` : ''}${issue.message}`)
      console.log(`\n${yellow(`${issues.length} unindexed where clause(s)`)}\n`)
    } else console.log(green('\u2713 All detected where clauses have matching indexes\n'))
  },
  accessForFactory = (call: FactoryCall): AccessEntry[] => {
    const { factory, options: opts } = call,
      result: AccessEntry[] = []
    if (factory === 'cacheCrud') {
      result.push({ endpoints: [...CACHE_BASE], level: 'No Auth' })
      return result
    }
    if (factory === 'singletonCrud') {
      result.push({ endpoints: [...SINGLETON_BASE], level: 'Owner' })
      return result
    }
    if (factory === 'childCrud') {
      const ownerEps = [...CHILD_BASE]
      result.push({ endpoints: ownerEps, level: 'Parent Owner' })
      if (hasOption(opts, 'pub')) result.push({ endpoints: ['pub.list', 'pub.get'], level: 'Public' })
      return result
    }
    if (factory === 'orgCrud') {
      const memberEps = ['list', 'read']
      if (hasOption(opts, 'search')) memberEps.push('search')
      result.push({ endpoints: memberEps, level: 'Org Member' })
      result.push({ endpoints: ['create', 'update'], level: 'Org Member' })
      const adminEps = ['rm']
      if (hasOption(opts, 'softDelete')) adminEps.push('restore')
      result.push({ endpoints: adminEps, level: 'Org Admin' })
      if (hasOption(opts, 'acl')) result.push({ endpoints: [...ORG_ACL], level: 'Org Admin' })
      return result
    }
    const pubEps = [...CRUD_PUB]
    if (hasOption(opts, 'search')) pubEps.push('pub.search')
    result.push({ endpoints: pubEps, level: 'Public' })
    result.push({ endpoints: ['create'], level: 'Authenticated' })
    const ownerEps = ['update', 'rm']
    if (hasOption(opts, 'softDelete')) ownerEps.push('restore')
    result.push({ endpoints: ownerEps, level: 'Owner' })
    return result
  },
  ACCESS_ICONS: Record<string, string> = {
    Authenticated: '\u{1F511}',
    'No Auth': '\u{1F310}',
    'Org Admin': '\u{1F6E1}\uFE0F',
    'Org Member': '\u{1F465}',
    Owner: '\u{1F464}',
    'Parent Owner': '\u{1F517}',
    Public: '\u{1F310}'
  },
  printAccessReport = (calls: FactoryCall[]) => {
    console.log(bold('Access Control Matrix\n'))
    let totalEndpoints = 0
    for (const call of calls) {
      const entries = accessForFactory(call)
      console.log(`  ${bold(call.table)} ${dim(`(${call.factory})`)} ${dim(`\u2014 ${call.file}`)}`)
      for (const entry of entries) {
        const icon = ACCESS_ICONS[entry.level] ?? '\u2022'
        console.log(`    ${icon} ${yellow(entry.level)}: ${entry.endpoints.join(', ')}`)
        totalEndpoints += entry.endpoints.length
      }
      console.log('')
    }
    console.log(`${bold(String(totalEndpoints))} endpoints across ${bold(String(calls.length))} tables\n`)
  },
  checkSchemaConsistency = (convexDir: string, schemaFile: { content: string; path: string }): Issue[] => {
    const issues: Issue[] = [],
      schemaTables = extractSchemaTableNames(schemaFile.content),
      { calls, files } = extractFactoryCalls(convexDir),
      seen = new Map<string, string>()
    for (const call of calls) {
      if (seen.has(call.table))
        issues.push({
          file: call.file,
          level: 'error',
          message: `Duplicate factory for table "${call.table}" (also in ${seen.get(call.table)})`
        })
      else seen.set(call.table, call.file)
      if (!schemaTables.has(call.table))
        issues.push({
          file: call.file,
          level: 'error',
          message: `${call.factory}('${call.table}') but no "${call.table}" table found in schema`
        })
    }
    const factoryTables = new Set(calls.map(c => c.table))
    for (const table of schemaTables)
      if (!factoryTables.has(table))
        issues.push({
          file: basename(schemaFile.path),
          level: 'warn',
          message: `Table "${table}" defined in schema but no factory call found`
        })
    const convexFiles = new Set(files.map(f => f.replace('.ts', '')))
    for (const call of calls)
      if (call.table !== basename(call.file, '.ts') && !convexFiles.has(call.table))
        issues.push({
          file: call.file,
          level: 'warn',
          message: `${call.factory}('${call.table}') in ${call.file} — table name doesn't match filename`
        })
    return issues
  },
  checkIndexCoverage = (convexDir: string, calls: FactoryCall[]): Issue[] => {
    const schemaDef = findSchemaDefFile(convexDir),
      customIndexes = schemaDef ? extractCustomIndexes(schemaDef.content) : new Map<string, TableIndex[]>(),
      root = dirname(convexDir),
      projectWhere = scanWhereUsage(root, convexDir),
      whereByTable = new Map<string, Set<string>>(),
      issues: Issue[] = []
    for (const w of projectWhere) {
      const set = whereByTable.get(w.table) ?? new Set()
      set.add(w.field)
      whereByTable.set(w.table, set)
    }
    for (const call of calls) {
      const wFields = extractWhereFromOptions(call.options)
      if (wFields.length > 0) {
        const set = whereByTable.get(call.table) ?? new Set()
        for (const f of wFields) set.add(f)
        whereByTable.set(call.table, set)
      }
    }
    for (const call of calls) {
      const defaults = FACTORY_DEFAULT_INDEXES[call.factory] ?? [],
        custom = customIndexes.get(call.table) ?? [],
        allIndexes = [...defaults, ...custom],
        allFields = new Set<string>()
      for (const ix of allIndexes) for (const f of ix.fields) allFields.add(f)
      const tableWhereFields = whereByTable.get(call.table)
      if (tableWhereFields)
        for (const field of tableWhereFields)
          if (!allFields.has(field))
            issues.push({
              file: call.file,
              level: 'warn',
              message: `"${call.table}": where on '${field}' — no matching index`
            })
    }
    return issues
  },
  HEALTH_MAX = 100,
  HEALTH_ERROR_PENALTY = 15,
  HEALTH_WARN_PENALTY = 5,
  printHealthReport = (convexDir: string, schemaFile: { content: string; path: string }) => {
    const { calls } = extractFactoryCalls(convexDir),
      schemaIssues = checkSchemaConsistency(convexDir, schemaFile),
      indexIssues = checkIndexCoverage(convexDir, calls)
    let totalEndpoints = 0
    for (const call of calls) totalEndpoints += endpointsForFactory(call).length
    let totalIndexes = 0
    const schemaDef = findSchemaDefFile(convexDir),
      customIndexes = schemaDef ? extractCustomIndexes(schemaDef.content) : new Map<string, TableIndex[]>()
    for (const call of calls) {
      const defaults = FACTORY_DEFAULT_INDEXES[call.factory] ?? [],
        custom = customIndexes.get(call.table) ?? []
      totalIndexes += defaults.length + custom.length
    }
    const accessLevels = new Set<string>()
    for (const call of calls) for (const entry of accessForFactory(call)) accessLevels.add(entry.level)
    const allIssues = [...schemaIssues, ...indexIssues],
      errors = allIssues.filter(i => i.level === 'error'),
      warnings = allIssues.filter(i => i.level === 'warn'),
      rawScore = HEALTH_MAX - errors.length * HEALTH_ERROR_PENALTY - warnings.length * HEALTH_WARN_PENALTY,
      score = Math.max(0, Math.min(HEALTH_MAX, rawScore)),
      scoreColor = score >= 90 ? green : score >= 70 ? yellow : red
    console.log(bold('Project Health Report\n'))
    console.log(`  ${bold('Score:')} ${scoreColor(`${score}/100`)}\n`)
    console.log(`  ${dim('Tables:')}      ${calls.length}`)
    console.log(`  ${dim('Endpoints:')}   ${totalEndpoints}`)
    console.log(`  ${dim('Indexes:')}     ${totalIndexes}`)
    console.log(`  ${dim('Access:')}      ${[...accessLevels].join(', ')}\n`)
    if (errors.length > 0) {
      console.log(`  ${red('Errors')} ${dim(`(-${HEALTH_ERROR_PENALTY} pts each)`)}\n`)
      for (const issue of errors)
        console.log(`    ${red('\u2717')} ${issue.file ? `${dim(issue.file)} ` : ''}${issue.message}`)
      console.log('')
    }
    if (warnings.length > 0) {
      console.log(`  ${yellow('Warnings')} ${dim(`(-${HEALTH_WARN_PENALTY} pts each)`)}\n`)
      for (const issue of warnings)
        console.log(`    ${yellow('\u26A0')} ${issue.file ? `${dim(issue.file)} ` : ''}${issue.message}`)
      console.log('')
    }
    if (allIssues.length === 0) console.log(`  ${green('\u2713 No issues found')}\n`)
    console.log(
      `  ${dim('Run')} noboil-convex check --schema ${dim('for schema preview')}\n` +
        `  ${dim('Run')} noboil-convex check --endpoints ${dim('for endpoint list')}\n` +
        `  ${dim('Run')} noboil-convex check --indexes ${dim('for index analysis')}\n` +
        `  ${dim('Run')} noboil-convex check --access ${dim('for access matrix')}\n`
    )
  },
  run = () => {
    const root = process.cwd(),
      flags = new Set(process.argv.slice(2))

    console.log(bold('\n@noboil/convex check\n'))

    const convexDir = findConvexDir(root)
    if (!convexDir) {
      console.log(red('\u2717 Could not find convex/ directory with _generated/'))
      console.log(dim('  Run from project root or a directory containing convex/'))
      process.exit(1)
    }
    console.log(`${dim('convex dir:')} ${convexDir}`)

    const schemaFile = findSchemaFile(convexDir)
    if (!schemaFile) {
      console.log(red('\u2717 Could not find schema file with @noboil/convex markers'))
      console.log(dim('  Expected a .ts file importing makeOwned/makeOrgScoped/etc.'))
      process.exit(1)
    }
    console.log(`${dim('schema:')}    ${schemaFile.path}\n`)

    if (flags.has('--endpoints')) {
      const { calls } = extractFactoryCalls(convexDir)
      printEndpoints(calls)
      return
    }

    if (flags.has('--schema')) {
      const { calls } = extractFactoryCalls(convexDir)
      printSchemaPreview(schemaFile.content, calls)
      return
    }

    if (flags.has('--health')) {
      printHealthReport(convexDir, schemaFile)
      return
    }

    if (flags.has('--access')) {
      const { calls } = extractFactoryCalls(convexDir)
      printAccessReport(calls)
      return
    }

    if (flags.has('--indexes')) {
      const { calls } = extractFactoryCalls(convexDir)
      printIndexReport(convexDir, calls)
      return
    }

    runCheck(convexDir, schemaFile)
  }

if (import.meta.main) run()

export {
  accessForFactory,
  checkIndexCoverage,
  checkSchemaConsistency,
  endpointsForFactory,
  extractCustomIndexes,
  extractSchemaFields,
  extractWhereFromOptions,
  FACTORY_DEFAULT_INDEXES,
  HEALTH_ERROR_PENALTY,
  HEALTH_MAX,
  HEALTH_WARN_PENALTY,
  parseObjectFields,
  printAccessReport,
  printHealthReport,
  printIndexReport,
  printSchemaPreview,
  scanWhereUsage
}
export type { AccessEntry, FactoryCall, SchemaField, SchemaTable, TableIndex, WhereField }

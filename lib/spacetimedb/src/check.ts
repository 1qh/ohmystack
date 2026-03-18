#!/usr/bin/env bun
/* eslint-disable no-console, max-depth, complexity */
/* oxlint-disable eslint/max-statements, eslint/complexity, max-depth */
/** biome-ignore-all lint/style/noProcessEnv: cli */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`

interface AccessEntry {
  endpoints: string[]
  level: string
}

interface FactoryCall {
  factory: string
  file: string
  options: string
  table: string
}

interface Issue {
  file?: string
  level: 'error' | 'warn'
  message: string
}

interface SchemaField {
  field: string
  type: string
}

interface SchemaTable {
  factory: string
  fields: SchemaField[]
  table: string
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

const schemaMarkers = ['schema(', 'table(', 't.'],
  reducerPat = /reducer\(\s*['"](?<table>\w+)\.(?<endpoint>[\w.]+)['"]/gu,
  helperPat = /make(?<helper>Crud|Org|CacheCrud|ChildCrud)\(/u,
  tablePat = /(?<tname>\w+)\s*:\s*table\([^,]+,\s*\{/gu,
  fieldLinePat = /^\s*(?<fname>\w+)\s*:\s*(?<ftype>.+?)\s*,?$/u,
  trailingCommaPat = /,$/u,
  parenContentPat = /\([^)]*\)/gu,
  braceContentPat = /\{[^}]*\}/gu,
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
  parseObjectFields = (content: string, startPos: number): SchemaField[] => {
    const fields: SchemaField[] = []
    let depth = 1,
      pos = startPos
    while (pos < content.length && depth > 0) {
      const c = content[pos]
      if (c === '(' || c === '{' || c === '[') depth += 1
      else if (c === ')' || c === '}' || c === ']') depth -= 1
      pos += 1
    }
    const block = content.slice(startPos, pos - 1)
    for (const line of block.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.length > 0) {
        const m = fieldLinePat.exec(trimmed)
        if (m?.groups) {
          const name = m.groups.fname,
            raw = m.groups.ftype
          if (name && raw) {
            const t = raw
              .replace(trailingCommaPat, '')
              .trim()
              .replace(parenContentPat, '()')
              .replace(braceContentPat, '{}')
            fields.push({ field: name, type: t })
          }
        }
      }
    }
    return fields
  },
  extractSchemaFields = (content: string): SchemaTable[] => {
    const tables: SchemaTable[] = []
    let match = tablePat.exec(content)
    while (match) {
      const table = match.groups?.tname ?? '',
        start = match.index + match[0].length,
        fields = parseObjectFields(content, start)
      if (table) tables.push({ factory: 'spacetimedb', fields, table })
      match = tablePat.exec(content)
    }
    tablePat.lastIndex = 0
    return tables
  },
  extractFactoryCalls = (moduleDir: string): { calls: FactoryCall[]; files: string[] } => {
    const files = listTypeScriptFiles(moduleDir),
      byTable = new Map<string, { endpoints: Set<string>; factory: string; file: string }>()
    for (const full of files) {
      const file = basename(full),
        content = readFileSync(full, 'utf8'),
        helperMatch = helperPat.exec(content)
      let factory = 'reducer'
      if (helperMatch?.groups?.helper === 'Crud') factory = 'makeCrud'
      if (helperMatch?.groups?.helper === 'Org') factory = 'makeOrg'
      if (helperMatch?.groups?.helper === 'CacheCrud') factory = 'makeCacheCrud'
      if (helperMatch?.groups?.helper === 'ChildCrud') factory = 'makeChildCrud'
      let m = reducerPat.exec(content)
      while (m) {
        const table = m.groups?.table ?? '',
          endpoint = m.groups?.endpoint ?? ''
        if (table && endpoint) {
          const entry = byTable.get(table) ?? { endpoints: new Set<string>(), factory, file }
          entry.endpoints.add(endpoint)
          if (entry.factory === 'reducer') entry.factory = factory
          byTable.set(table, entry)
        }
        m = reducerPat.exec(content)
      }
      reducerPat.lastIndex = 0
    }
    const calls: FactoryCall[] = []
    for (const [table, entry] of byTable)
      calls.push({
        factory: entry.factory,
        file: entry.file,
        options: `endpoints=${[...entry.endpoints].toSorted().join(',')}`,
        table
      })
    return { calls, files: files.map(f => basename(f)) }
  },
  endpointsForFactory = (call: FactoryCall): string[] => {
    if (call.options.startsWith('endpoints=')) {
      const raw = call.options.slice('endpoints='.length)
      if (!raw) return []
      return raw.split(',').filter(Boolean)
    }
    return []
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
        eps = call ? endpointsForFactory(call) : []
      console.log(
        `  ${bold(t.table)} ${dim(`(${t.factory})`)}${eps.length > 0 ? ` ${dim(`[${eps.length} reducers]`)}` : ''}`
      )
      for (const f of t.fields) console.log(`    ${f.field.padEnd(20)} ${dim(f.type)}`)
      console.log('')
    }
    let totalFields = 0
    for (const t of tables) totalFields += t.fields.length
    console.log(`${bold(String(tables.length))} tables with ${bold(String(totalFields))} fields\n`)
  },
  printEndpoints = (calls: FactoryCall[]) => {
    let total = 0
    console.log(bold('Registered Reducers\n'))
    for (const call of calls) {
      const eps = endpointsForFactory(call)
      total += eps.length
      console.log(`  ${bold(call.table)} ${dim(`(${call.factory})`)} ${dim(`— ${call.file}`)}`)
      console.log(`    ${eps.join(', ') || dim('(none)')}`)
      console.log('')
    }
    console.log(`${bold(String(total))} reducers from ${bold(String(calls.length))} tables\n`)
  },
  runCheck = (moduleDir: string, schemaFile: { content: string; path: string }) => {
    const issues: Issue[] = [],
      schemaTables = new Set(extractSchemaFields(schemaFile.content).map(t => t.table)),
      { calls, files } = extractFactoryCalls(moduleDir)

    console.log(`${dim('tables in schema:')} ${[...schemaTables].join(', ') || 'none'}`)
    console.log(`${dim('table reducer groups:')} ${calls.length}\n`)

    const seen = new Map<string, string>()
    for (const call of calls) {
      if (seen.has(call.table))
        issues.push({
          file: call.file,
          level: 'error',
          message: `Duplicate reducer group for table "${call.table}" (also in ${seen.get(call.table)})`
        })
      else seen.set(call.table, call.file)
      if (!schemaTables.has(call.table))
        issues.push({
          file: call.file,
          level: 'error',
          message: `Reducer group for "${call.table}" but no table named "${call.table}" found in schema`
        })
      if (endpointsForFactory(call).length === 0)
        issues.push({ file: call.file, level: 'warn', message: `No reducer endpoints detected for table "${call.table}"` })
    }

    const factoryTables = new Set(calls.map(c => c.table))
    for (const table of schemaTables)
      if (!factoryTables.has(table))
        issues.push({
          file: basename(schemaFile.path),
          level: 'warn',
          message: `Table "${table}" defined in schema but no reducers found`
        })

    const moduleFiles = new Set(files.map(f => f.replace('.ts', '')))
    for (const call of calls)
      if (call.table !== basename(call.file, '.ts') && !moduleFiles.has(call.table))
        issues.push({
          file: call.file,
          level: 'warn',
          message: `Reducer group for "${call.table}" in ${call.file} — table name does not match filename`
        })

    if (issues.length === 0) {
      console.log(green('✓ All checks passed\n'))
      return
    }

    const errors = issues.filter(i => i.level === 'error'),
      warnings = issues.filter(i => i.level === 'warn')
    for (const issue of errors) console.log(`${red('✗')} ${issue.file ? `${dim(issue.file)} ` : ''}${issue.message}`)
    for (const issue of warnings) console.log(`${yellow('⚠')} ${issue.file ? `${dim(issue.file)} ` : ''}${issue.message}`)
    console.log(
      `\n${errors.length > 0 ? red(`${errors.length} error(s)`) : ''}${errors.length > 0 && warnings.length > 0 ? ', ' : ''}${warnings.length > 0 ? yellow(`${warnings.length} warning(s)`) : ''}\n`
    )
    if (errors.length > 0) process.exit(1)
  },
  FACTORY_DEFAULT_INDEXES: Record<string, TableIndex[]> = {
    makeCacheCrud: [],
    makeChildCrud: [],
    makeCrud: [{ fields: ['userId'], name: 'by_user', type: 'default' }],
    makeOrg: [
      { fields: ['orgId'], name: 'by_org', type: 'default' },
      { fields: ['orgId', 'userId'], name: 'by_org_user', type: 'default' }
    ],
    reducer: []
  },
  RESERVED_WHERE_KEYS = new Set(['$between', '$gt', '$gte', '$lt', '$lte', 'or', 'own']),
  findSchemaDefFile = (moduleDir: string): undefined | { content: string; path: string } => {
    const files = listTypeScriptFiles(moduleDir)
    for (const full of files) {
      const content = readFileSync(full, 'utf8')
      if (content.includes('schema(') && content.includes('table(')) return { content, path: full }
    }
  },
  extractCustomIndexes = (schemaContent: string): Map<string, TableIndex[]> => {
    const result = new Map<string, TableIndex[]>(),
      tableMatch = /(?<name>\w+)\s*:\s*table\([^,]+,\s*\{/gu
    let tm = tableMatch.exec(schemaContent)
    while (tm) {
      const tableName = tm.groups?.name ?? ''
      if (tableName) result.set(tableName, [])
      tm = tableMatch.exec(schemaContent)
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
  scanWhereUsage = (root: string, moduleDir: string): WhereField[] => {
    const results: WhereField[] = [],
      schemaPath = findSchemaDefFile(moduleDir)?.path ?? '',
      skip = new Set(['.cache', '.git', '.next', '.turbo', 'build', 'dist', 'node_modules']),
      processFile = (filePath: string, fileName: string) => {
        const fileContent = readFileSync(filePath, 'utf8'),
          apiPat = /['"](?<tbl>\w+)\.(?:list|search)['"]/gu
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
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            if (!(skip.has(entry.name) || entry.name.startsWith('.'))) scan(full)
          } else if (
            (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
            !entry.name.includes('.test.') &&
            !entry.name.includes('.config.') &&
            full !== schemaPath
          )
            processFile(full, entry.name)
        }
      }
    scan(root)
    return results
  },
  printIndexReport = (moduleDir: string, calls: FactoryCall[]) => {
    const schemaDef = findSchemaDefFile(moduleDir),
      customIndexes = schemaDef ? extractCustomIndexes(schemaDef.content) : new Map<string, TableIndex[]>(),
      root = moduleDir,
      projectWhere = scanWhereUsage(root, moduleDir),
      whereByTable = new Map<string, Set<string>>(),
      issues: Issue[] = []
    for (const w of projectWhere) {
      const set = whereByTable.get(w.table) ?? new Set<string>()
      set.add(w.field)
      whereByTable.set(w.table, set)
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
      console.log(`  ${bold(call.table)} ${dim(`(${call.factory})`)} ${dim(`— ${call.file}`)}`)
      for (const idx of allIndexes)
        console.log(`    ${green('✓')} ${idx.name} ${dim(`[${idx.fields.join(', ')}]`)} ${dim(`(${idx.type})`)}`)
      if (allIndexes.length === 0) console.log(`    ${dim('(no indexes detected)')}`)
      const tableWhereFields = whereByTable.get(call.table)
      if (tableWhereFields)
        for (const field of tableWhereFields)
          if (!allFields.has(field)) {
            console.log(`    ${yellow('⚠')} where filter on '${field}' — no matching index`)
            issues.push({
              file: call.file,
              level: 'warn',
              message: `"${call.table}": where on '${field}' is runtime-filtered. Add an index for better performance`
            })
          }
      console.log('')
    }
    console.log(`${bold(String(totalIndexes))} indexes across ${bold(String(calls.length))} tables\n`)
    if (issues.length > 0) {
      console.log(bold('Performance Suggestions\n'))
      for (const issue of issues)
        console.log(`  ${yellow('⚠')} ${issue.file ? `${dim(issue.file)} ` : ''}${issue.message}`)
      console.log(`\n${yellow(`${issues.length} unindexed where clause(s)`)}\n`)
    } else console.log(green('✓ No unindexed where clauses detected\n'))
  },
  accessForFactory = (call: FactoryCall): AccessEntry[] => {
    const eps = endpointsForFactory(call)
    if (call.factory === 'makeCacheCrud') return [{ endpoints: eps, level: 'Public' }]
    if (call.factory === 'makeOrg') return [{ endpoints: eps, level: 'Org Member' }]
    if (call.factory === 'makeChildCrud') return [{ endpoints: eps, level: 'Parent Owner' }]
    if (call.factory === 'makeCrud') return [{ endpoints: eps, level: 'Authenticated' }]
    return [{ endpoints: eps, level: 'Project Policy' }]
  },
  ACCESS_ICONS: Record<string, string> = {
    Authenticated: '🔑',
    'Org Member': '👥',
    'Parent Owner': '🔗',
    'Project Policy': '🛡️',
    Public: '🌐'
  },
  printAccessReport = (calls: FactoryCall[]) => {
    console.log(bold('Access Control Matrix\n'))
    let totalEndpoints = 0
    for (const call of calls) {
      const entries = accessForFactory(call)
      console.log(`  ${bold(call.table)} ${dim(`(${call.factory})`)} ${dim(`— ${call.file}`)}`)
      for (const entry of entries) {
        const icon = ACCESS_ICONS[entry.level] ?? '•'
        console.log(`    ${icon} ${yellow(entry.level)}: ${entry.endpoints.join(', ')}`)
        totalEndpoints += entry.endpoints.length
      }
      console.log('')
    }
    console.log(`${bold(String(totalEndpoints))} reducers across ${bold(String(calls.length))} tables\n`)
  },
  checkSchemaConsistency = (moduleDir: string, schemaFile: { content: string; path: string }): Issue[] => {
    const issues: Issue[] = [],
      schemaTables = new Set(extractSchemaFields(schemaFile.content).map(t => t.table)),
      { calls, files } = extractFactoryCalls(moduleDir),
      seen = new Map<string, string>()
    for (const call of calls) {
      if (seen.has(call.table))
        issues.push({
          file: call.file,
          level: 'error',
          message: `Duplicate reducer group for table "${call.table}" (also in ${seen.get(call.table)})`
        })
      else seen.set(call.table, call.file)
      if (!schemaTables.has(call.table))
        issues.push({
          file: call.file,
          level: 'error',
          message: `Reducer group for "${call.table}" but table is missing in schema`
        })
    }
    const reducerTables = new Set(calls.map(c => c.table))
    for (const table of schemaTables)
      if (!reducerTables.has(table))
        issues.push({ file: basename(schemaFile.path), level: 'warn', message: `Table "${table}" has no reducers` })
    const moduleFiles = new Set(files.map(f => f.replace('.ts', '')))
    for (const call of calls)
      if (call.table !== basename(call.file, '.ts') && !moduleFiles.has(call.table))
        issues.push({
          file: call.file,
          level: 'warn',
          message: `Reducer group for "${call.table}" in ${call.file} — table name does not match filename`
        })
    return issues
  },
  checkIndexCoverage = (moduleDir: string, calls: FactoryCall[]): Issue[] => {
    const schemaDef = findSchemaDefFile(moduleDir),
      customIndexes = schemaDef ? extractCustomIndexes(schemaDef.content) : new Map<string, TableIndex[]>(),
      projectWhere = scanWhereUsage(moduleDir, moduleDir),
      whereByTable = new Map<string, Set<string>>(),
      issues: Issue[] = []
    for (const w of projectWhere) {
      const set = whereByTable.get(w.table) ?? new Set<string>()
      set.add(w.field)
      whereByTable.set(w.table, set)
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
  printHealthReport = (moduleDir: string, schemaFile: { content: string; path: string }) => {
    const { calls } = extractFactoryCalls(moduleDir),
      schemaIssues = checkSchemaConsistency(moduleDir, schemaFile),
      indexIssues = checkIndexCoverage(moduleDir, calls)
    let totalEndpoints = 0
    for (const call of calls) totalEndpoints += endpointsForFactory(call).length
    let totalIndexes = 0
    const schemaDef = findSchemaDefFile(moduleDir),
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
    console.log(`  ${dim('Reducers:')}    ${totalEndpoints}`)
    console.log(`  ${dim('Indexes:')}     ${totalIndexes}`)
    console.log(`  ${dim('Access:')}      ${[...accessLevels].join(', ')}\n`)
    if (errors.length > 0) {
      console.log(`  ${red('Errors')} ${dim(`(-${HEALTH_ERROR_PENALTY} pts each)`)}\n`)
      for (const issue of errors) console.log(`    ${red('✗')} ${issue.file ? `${dim(issue.file)} ` : ''}${issue.message}`)
      console.log('')
    }
    if (warnings.length > 0) {
      console.log(`  ${yellow('Warnings')} ${dim(`(-${HEALTH_WARN_PENALTY} pts each)`)}\n`)
      for (const issue of warnings)
        console.log(`    ${yellow('⚠')} ${issue.file ? `${dim(issue.file)} ` : ''}${issue.message}`)
      console.log('')
    }
    if (allIssues.length === 0) console.log(`  ${green('✓ No issues found')}\n`)
    console.log(
      `  ${dim('Run')} noboil-stdb check --schema ${dim('for schema preview')}\n` +
        `  ${dim('Run')} noboil-stdb check --endpoints ${dim('for reducer list')}\n` +
        `  ${dim('Run')} noboil-stdb check --indexes ${dim('for index analysis')}\n` +
        `  ${dim('Run')} noboil-stdb check --access ${dim('for access matrix')}\n`
    )
  },
  run = () => {
    const root = process.cwd(),
      flags = new Set(process.argv.slice(2))

    console.log(bold('\nnoboil-stdb check\n'))

    const moduleDir = findModuleDir(root)
    if (!moduleDir) {
      console.log(red('✗ Could not find module/ directory with SpacetimeDB schema'))
      console.log(dim('  Run from project root or a directory containing module/'))
      process.exit(1)
    }
    console.log(`${dim('module dir:')} ${moduleDir}`)

    const schemaFile = findSchemaFile(moduleDir)
    if (!schemaFile) {
      console.log(red('✗ Could not find schema file with SpacetimeDB markers'))
      console.log(dim('  Expected a .ts file using schema() and table().'))
      process.exit(1)
    }
    console.log(`${dim('schema:')}     ${schemaFile.path}\n`)

    if (flags.has('--endpoints')) {
      const { calls } = extractFactoryCalls(moduleDir)
      printEndpoints(calls)
      return
    }

    if (flags.has('--schema')) {
      const { calls } = extractFactoryCalls(moduleDir)
      printSchemaPreview(schemaFile.content, calls)
      return
    }

    if (flags.has('--health')) {
      printHealthReport(moduleDir, schemaFile)
      return
    }

    if (flags.has('--access')) {
      const { calls } = extractFactoryCalls(moduleDir)
      printAccessReport(calls)
      return
    }

    if (flags.has('--indexes')) {
      const { calls } = extractFactoryCalls(moduleDir)
      printIndexReport(moduleDir, calls)
      return
    }

    runCheck(moduleDir, schemaFile)
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

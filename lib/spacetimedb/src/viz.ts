#!/usr/bin/env bun
/* eslint-disable no-console, max-depth */
/** biome-ignore-all lint/style/noProcessEnv: cli */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  schemaMarkers = ['schema(', 'table(', 't.'],
  tablePat = /(?<tname>\w+)\s*:\s*table\([^,]+,\s*\{/gu,
  fieldLinePat = /^\s*(?<fname>\w+)\s*:\s*(?<ftype>.+?)\s*,?$/u

interface ChildInfo extends TableInfo {
  foreignKey: string
  parent: string
}

interface TableInfo {
  fields: { name: string; type: string }[]
  name: string
  tableType: string
}

const isSchemaFile = (content: string): boolean => {
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
  extractFieldType = (raw: string): string => {
    const t = raw.trim()
    if (t.includes('t.bool(')) return 'boolean'
    if (t.includes('t.u') || t.includes('t.i') || t.includes('t.f')) return 'number'
    if (t.includes('t.string(')) return 'string'
    if (t.includes('t.bytes(')) return 'bytes'
    if (t.includes('t.array(')) return 'array'
    if (t.includes('t.map(')) return 'map'
    return 'unknown'
  },
  parseObjectFields = (content: string, startPos: number): { name: string; type: string }[] => {
    const fields: { name: string; type: string }[] = []
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
      const m = fieldLinePat.exec(line.trim())
      if (m?.groups?.fname && m.groups.ftype) fields.push({ name: m.groups.fname, type: extractFieldType(m.groups.ftype) })
    }
    return fields
  },
  extractWrapperTables = (content: string): TableInfo[] => {
    const tables: TableInfo[] = []
    let match = tablePat.exec(content)
    while (match) {
      const name = match.groups?.tname ?? '',
        start = match.index + match[0].length,
        fields = parseObjectFields(content, start)
      if (name) tables.push({ fields, name, tableType: 'table' })
      match = tablePat.exec(content)
    }
    tablePat.lastIndex = 0
    return tables
  },
  singularize = (s: string): string => (s.endsWith('s') ? s.slice(0, -1) : s),
  buildRelationships = (tables: TableInfo[]): ChildInfo[] => {
    const children: ChildInfo[] = [],
      names = new Set<string>()
    for (const table of tables) names.add(table.name)
    for (const table of tables)
      for (const field of table.fields)
        if (field.name.endsWith('Id')) {
          const base = singularize(field.name.slice(0, -2))
          if (names.has(base))
            children.push({ fields: [], foreignKey: field.name, name: table.name, parent: base, tableType: 'relation' })
        }
    return children
  },
  escapeField = (name: string) => name,
  generateMermaid = (tables: TableInfo[], children: ChildInfo[]): string => {
    const lines: string[] = ['erDiagram']
    for (const t of tables) {
      lines.push(`    ${t.name} {`)
      for (const f of t.fields) lines.push(`        ${f.type} ${escapeField(f.name)}`)
      lines.push('    }')
    }
    for (const c of children) if (c.parent) lines.push(`    ${c.parent} ||--o{ ${c.name} : "${c.foreignKey}"`)
    return lines.join('\n')
  },
  printSummary = (tables: TableInfo[], children: ChildInfo[]) => {
    console.log(bold('\nSchema Summary\n'))
    for (const t of tables) {
      const badge = dim(`[${t.tableType}]`)
      console.log(`  ${bold(t.name)} ${badge}`)
      for (const f of t.fields) console.log(`    ${dim('│')} ${f.name}: ${dim(f.type)}`)
      console.log('')
    }
    if (children.length > 0) {
      console.log(bold('Relationships\n'))
      for (const child of children)
        console.log(`  ${bold(child.parent)} -> ${bold(child.name)} ${dim(`(${child.foreignKey})`)}`)
      console.log('')
    }
  },
  run = () => {
    const root = process.cwd(),
      flags = new Set(process.argv.slice(2))

    console.log(bold('\nnoboil-stdb viz\n'))

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
    console.log(`${dim('schema:')} ${schemaFile.path}\n`)

    const tables = extractWrapperTables(schemaFile.content),
      children = buildRelationships(tables)

    if (tables.length === 0) {
      console.log(red('✗ No tables found in schema'))
      process.exit(1)
    }

    if (flags.has('--mermaid')) {
      console.log(generateMermaid(tables, children))
      return
    }

    printSummary(tables, children)
    console.log(dim('Run with --mermaid for ER diagram output\n'))
  }

if (import.meta.main) run()

const extractChildren = (content: string): ChildInfo[] => buildRelationships(extractWrapperTables(content))

export { extractChildren, extractFieldType, extractWrapperTables, generateMermaid }

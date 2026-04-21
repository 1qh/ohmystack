#!/usr/bin/env bun
/* eslint-disable no-console */
import type { ChildInfo, TableInfo } from '@noboil/shared/viz'
import { bold, dim, findBracketEnd, isSchemaFile, printSummary, red } from '@noboil/shared/viz'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
const schemaMarkers = ['makeOwned(', 'makeOrgScoped(', 'makeSingleton(', 'makeBase(', 'child(']
const wrapperFactories = ['makeOwned', 'makeOrgScoped', 'makeSingleton', 'makeBase'] as const
const TYPE_LABELS: Record<string, string> = {
  makeBase: 'cache',
  makeOrgScoped: 'org-scoped',
  makeOwned: 'owned',
  makeSingleton: 'singleton'
}
const ZID_PAT = /zid\(['"](?<zname>\w+)['"]\)/u
const FIELD_PAT = /^\s*(?<fname>\w+)\s*:/u
const FK_PAT = /foreignKey\s*:\s*['"](?<fk>\w+)['"]/u
const PARENT_PAT = /parent\s*:\s*['"](?<pn>\w+)['"]/u
const SCHEMA_OBJ_PAT = /schema\s*:\s*object\(\{/u
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
const extractFieldType = (raw: string): string => {
  const t = raw.trim()
  if (t.includes('file()')) return 'file'
  if (t.includes('files()')) return 'file[]'
  if (t.includes('zid(')) {
    const m = ZID_PAT.exec(t)
    return m ? `id<${m[1]}>` : 'id'
  }
  if (t.includes('array(')) return 'array'
  if (t.includes('boolean()') || t.startsWith('boolean')) return 'boolean'
  if (t.includes('number()') || t.startsWith('number')) return 'number'
  if (t.includes('zenum(') || t.includes('enum(')) return 'enum'
  if (t.includes('union(')) return 'union'
  if (t.includes('object(')) return 'object'
  return 'string'
}
const extractFieldsFromBlock = (block: string): { name: string; type: string }[] => {
  const fields: { name: string; type: string }[] = []
  const lines = block.split('\n')
  for (const line of lines) {
    const m = FIELD_PAT.exec(line)
    if (m) {
      const rest = line.slice(line.indexOf(':') + 1)
      fields.push({ name: m.groups?.fname ?? m[1] ?? '', type: extractFieldType(rest) })
    }
  }
  return fields
}
const extractWrapperTables = (content: string): TableInfo[] => {
  const tables: TableInfo[] = []
  const processFactory = (factory: string) => {
    const pat = new RegExp(`${factory}\\(\\{`, 'gu')
    let fm = pat.exec(content)
    while (fm !== null) {
      const endPos = findBracketEnd(content, fm.index + fm[0].length)
      const outerBlock = content.slice(fm.index + fm[0].length, endPos)
      const propPat = /(?<tname>\w+)\s*:\s*object\(\{/gu
      let pm = propPat.exec(outerBlock)
      while (pm !== null) {
        const start = pm.index + pm[0].length
        const fieldEnd = findBracketEnd(outerBlock, start)
        const fieldBlock = outerBlock.slice(start, fieldEnd)
        tables.push({
          fields: extractFieldsFromBlock(fieldBlock),
          name: pm.groups?.tname ?? pm[1] ?? '',
          tableType: TYPE_LABELS[factory] ?? factory
        })
        pm = propPat.exec(outerBlock)
      }
      fm = pat.exec(content)
    }
  }
  for (const factory of wrapperFactories) processFactory(factory)
  return tables
}
const extractChildren = (content: string): ChildInfo[] => {
  const children: ChildInfo[] = []
  const pat = /(?<cname>\w+)\s*:\s*child\(\{/gu
  let m = pat.exec(content)
  while (m) {
    const start = m.index + m[0].length
    let depth = 1
    let pos = start
    while (pos < content.length && depth > 0) {
      if (content[pos] === '{') depth += 1
      else if (content[pos] === '}') depth -= 1
      pos += 1
    }
    const block = content.slice(start, pos - 1)
    const fkMatch = FK_PAT.exec(block)
    const parentMatch = PARENT_PAT.exec(block)
    const schemaMatch = SCHEMA_OBJ_PAT.exec(block)
    let fields: { name: string; type: string }[] = []
    if (schemaMatch) {
      const sStart = block.indexOf('{', schemaMatch.index + schemaMatch[0].length - 1) + 1
      let d = 1
      let p = sStart
      while (p < block.length && d > 0) {
        if (block[p] === '{') d += 1
        else if (block[p] === '}') d -= 1
        p += 1
      }
      fields = extractFieldsFromBlock(block.slice(sStart, p - 1))
    }
    children.push({
      fields,
      foreignKey: fkMatch?.[1] ?? '',
      name: m.groups?.cname ?? m[1] ?? '',
      parent: parentMatch?.[1] ?? '',
      tableType: 'child'
    })
    m = pat.exec(content)
  }
  return children
}
const escapeField = (name: string) => name.replaceAll('_', '_')
const generateMermaid = (tables: TableInfo[], children: ChildInfo[]): string => {
  const lines: string[] = ['erDiagram']
  for (const t of tables) {
    lines.push(`    ${t.name} {`)
    for (const f of t.fields) lines.push(`        ${f.type} ${escapeField(f.name)}`)
    lines.push('    }')
  }
  for (const c of children) {
    lines.push(`    ${c.name} {`)
    for (const f of c.fields) lines.push(`        ${f.type} ${escapeField(f.name)}`)
    lines.push('    }')
    if (c.parent) lines.push(`    ${c.parent} ||--o{ ${c.name} : "${c.foreignKey}"`)
  }
  for (const t of tables)
    for (const f of t.fields)
      if (f.type.startsWith('id<') && f.type !== 'id<_storage>') {
        const target = f.type.slice(3, -1)
        const allNames = [...tables.map(x => x.name), ...children.map(x => x.name)]
        if (allNames.includes(target)) lines.push(`    ${target} ||--o{ ${t.name} : "${f.name}"`)
      }
  return lines.join('\n')
}
const run = () => {
  const root = process.cwd()
  const flags = new Set(process.argv.slice(2))
  console.log(bold('\n@noboil/convex viz\n'))
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
  console.log(`${dim('schema:')} ${schemaFile.path}\n`)
  const tables = extractWrapperTables(schemaFile.content)
  const children = extractChildren(schemaFile.content)
  if (tables.length === 0 && children.length === 0) {
    console.log(red('\u2717 No tables found in schema'))
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
export { extractChildren, extractFieldsFromBlock, extractFieldType, extractWrapperTables, generateMermaid }

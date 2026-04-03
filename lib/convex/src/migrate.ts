#!/usr/bin/env bun
/* eslint-disable no-console */
import { createCliTheme, hasFlag, readArgOrEqFlag } from '@a/shared/cli'
/* oxlint-disable eslint/max-statements, eslint/complexity */
/** biome-ignore-all lint/style/noProcessEnv: cli */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const { bold, cyan, dim, green, red, yellow } = createCliTheme()
interface FieldInfo {
  name: string
  optional: boolean
  type: string
}
type MigrationAction =
  | { field: string; from: string; table: string; to: string; type: 'field_type_changed' }
  | { field: string; table: string; type: 'field_added_optional' }
  | { field: string; table: string; type: 'field_added_required' }
  | { field: string; table: string; type: 'field_removed' }
  | { from: string; table: string; to: string; type: 'factory_changed' }
  | { table: string; type: 'table_added' }
  | { table: string; type: 'table_removed' }
interface SchemaSnapshot {
  tables: TableSnapshot[]
}
interface TableSnapshot {
  factory: string
  fields: FieldInfo[]
  name: string
}
const findBracketEnd = (text: string, startPos: number): number => {
  let depth = 1
  let pos = startPos
  while (pos < text.length && depth > 0) {
    if (text[pos] === '{') depth += 1
    else if (text[pos] === '}') depth -= 1
    pos += 1
  }
  return pos - 1
}
const WRAPPER_FACTORIES = ['makeOwned', 'makeOrgScoped', 'makeSingleton', 'makeBase'] as const
const FACTORY_MAP: Record<string, string> = {
  makeBase: 'cacheCrud',
  makeOrgScoped: 'orgCrud',
  makeOwned: 'crud',
  makeSingleton: 'singletonCrud'
}
const SCHEMA_MARKERS = ['makeOwned(', 'makeOrgScoped(', 'makeSingleton(', 'makeBase(', 'child(']
const FIELD_PAT = /^\s*(?<fname>\w+)\s*:/u
const CHILD_SCHEMA_PAT = /schema\s*:\s*object\(\{/u
const isSchemaFile = (content: string): boolean => {
  for (const marker of SCHEMA_MARKERS) if (content.includes(marker)) return true
  return false
}
const detectFieldType = (raw: string): string => {
  const t = raw.trim()
  if (t.includes('cvFile()')) return 'file'
  if (t.includes('cvFiles()')) return 'file[]'
  if (t.includes('zid(')) return 'id'
  if (t.includes('array(')) return 'array'
  if (t.includes('boolean()') || t.startsWith('boolean')) return 'boolean'
  if (t.includes('number()') || t.startsWith('number')) return 'number'
  if (t.includes('zenum(') || t.includes('enum(')) return 'enum'
  if (t.includes('union(')) return 'union'
  if (t.includes('object(')) return 'object'
  return 'string'
}
const isOptionalField = (raw: string): boolean => raw.includes('.optional()') || raw.includes('.nullable()')
const parseFieldsFromBlock = (block: string): FieldInfo[] => {
  const fields: FieldInfo[] = []
  const lines = block.split('\n')
  for (const line of lines) {
    const m = FIELD_PAT.exec(line)
    if (m) {
      const rest = line.slice(line.indexOf(':') + 1)
      fields.push({
        name: m.groups?.fname ?? '',
        optional: isOptionalField(rest),
        type: detectFieldType(rest)
      })
    }
  }
  return fields
}
const parseSchemaContent = (content: string): SchemaSnapshot => {
  const tables: TableSnapshot[] = []
  const processFactory = (factory: string) => {
    const pat = new RegExp(`${factory}\\(\\{`, 'gu')
    let fm = pat.exec(content)
    while (fm !== null) {
      const endPos = findBracketEnd(content, fm.index + fm[0].length)
      const outerBlock = content.slice(fm.index + fm[0].length, endPos)
      const propPat = /(?<tname>\w+)\s*:\s*object\(\{/gu
      let pm = propPat.exec(outerBlock)
      while (pm) {
        const start = pm.index + pm[0].length
        const fieldEnd = findBracketEnd(outerBlock, start)
        const fieldBlock = outerBlock.slice(start, fieldEnd)
        tables.push({
          factory: FACTORY_MAP[factory] ?? factory,
          fields: parseFieldsFromBlock(fieldBlock),
          name: pm.groups?.tname ?? ''
        })
        pm = propPat.exec(outerBlock)
      }
      fm = pat.exec(content)
    }
  }
  for (const factory of WRAPPER_FACTORIES) processFactory(factory)
  const childPat = /(?<cname>\w+)\s*:\s*child\(\{/gu
  let cm = childPat.exec(content)
  while (cm) {
    let depth = 1
    let pos = cm.index + cm[0].length
    while (pos < content.length && depth > 0) {
      if (content[pos] === '{') depth += 1
      else if (content[pos] === '}') depth -= 1
      pos += 1
    }
    const childBlock = content.slice(cm.index + cm[0].length, pos - 1)
    const sm = CHILD_SCHEMA_PAT.exec(childBlock)
    if (sm) {
      const schemaStart = sm.index + sm[0].length
      let d = 1
      let sp = schemaStart
      while (sp < childBlock.length && d > 0) {
        if (childBlock[sp] === '{') d += 1
        else if (childBlock[sp] === '}') d -= 1
        sp += 1
      }
      const fieldBlock = childBlock.slice(schemaStart, sp - 1)
      tables.push({
        factory: 'childCrud',
        fields: parseFieldsFromBlock(fieldBlock),
        name: cm.groups?.cname ?? ''
      })
    }
    cm = childPat.exec(content)
  }
  return { tables: tables.toSorted((a, b) => a.name.localeCompare(b.name)) }
}
const diffSnapshots = (before: SchemaSnapshot, after: SchemaSnapshot): MigrationAction[] => {
  const actions: MigrationAction[] = []
  const beforeMap = new Map<string, TableSnapshot>()
  const afterMap = new Map<string, TableSnapshot>()
  for (const t of before.tables) beforeMap.set(t.name, t)
  for (const t of after.tables) afterMap.set(t.name, t)
  for (const t of after.tables) if (!beforeMap.has(t.name)) actions.push({ table: t.name, type: 'table_added' })
  for (const t of before.tables) if (!afterMap.has(t.name)) actions.push({ table: t.name, type: 'table_removed' })
  for (const t of after.tables) {
    const prev = beforeMap.get(t.name)
    if (prev) {
      if (prev.factory !== t.factory)
        actions.push({ from: prev.factory, table: t.name, to: t.factory, type: 'factory_changed' })
      const prevFields = new Map<string, FieldInfo>()
      const nextFields = new Map<string, FieldInfo>()
      for (const f of prev.fields) prevFields.set(f.name, f)
      for (const f of t.fields) nextFields.set(f.name, f)
      for (const f of t.fields)
        if (!prevFields.has(f.name))
          actions.push({
            field: f.name,
            table: t.name,
            type: f.optional ? 'field_added_optional' : 'field_added_required'
          })
      for (const f of prev.fields)
        if (!nextFields.has(f.name)) actions.push({ field: f.name, table: t.name, type: 'field_removed' })
      for (const f of t.fields) {
        const pf = prevFields.get(f.name)
        if (pf && pf.type !== f.type)
          actions.push({ field: f.name, from: pf.type, table: t.name, to: f.type, type: 'field_type_changed' })
      }
    }
  }
  return actions
}
const findSchemaFile = (root: string): undefined | { content: string; path: string } => {
  const scanDir = (dir: string): undefined | { content: string; path: string } => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir))
      if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.config.ts')) {
        const full = join(dir, entry)
        const content = readFileSync(full, 'utf8')
        if (isSchemaFile(content)) return { content, path: full }
      }
  }
  const direct = scanDir(root)
  if (direct) return direct
  if (!existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true }))
    if (entry.isDirectory()) {
      const sub = scanDir(join(root, entry.name))
      if (sub) return sub
    }
}
const getSchemaFromGit = (ref: string, filePath: string): string | undefined => {
  try {
    return execSync(`git show ${ref}:${filePath}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  } catch {
    return ''
  }
}
const printMigrationPlan = (actions: MigrationAction[]) => {
  if (actions.length === 0) {
    console.log(green('\u2713 No schema changes detected\n'))
    return
  }
  console.log(bold(`\n${actions.length} change(s) detected:\n`))
  const tableAdded = actions.filter(a => a.type === 'table_added')
  const tableRemoved = actions.filter(a => a.type === 'table_removed')
  const factoryChanged = actions.filter(a => a.type === 'factory_changed')
  const fieldAddedReq = actions.filter(a => a.type === 'field_added_required')
  const fieldAddedOpt = actions.filter(a => a.type === 'field_added_optional')
  const fieldRemoved = actions.filter(a => a.type === 'field_removed')
  const fieldTypeChanged = actions.filter(a => a.type === 'field_type_changed')
  const dangerous = [...tableRemoved, ...factoryChanged, ...fieldAddedReq, ...fieldRemoved, ...fieldTypeChanged]
  const safe = [...tableAdded, ...fieldAddedOpt]
  if (safe.length > 0) {
    console.log(green(bold('Safe changes (no migration needed):')))
    for (const a of tableAdded) console.log(`  ${green('+')} Table ${cyan(a.table)} added`)
    for (const a of fieldAddedOpt) {
      const fa = a as MigrationAction & { field: string }
      console.log(`  ${green('+')} Field ${cyan(fa.field)} added to ${cyan(fa.table)} (optional)`)
    }
    console.log()
  }
  if (dangerous.length > 0) {
    console.log(yellow(bold('Requires migration:')))
    let step = 1
    for (const a of fieldAddedReq) {
      const fa = a as MigrationAction & { field: string }
      console.log(`\n  ${yellow(`Step ${step}:`)} Backfill ${cyan(fa.field)} on ${cyan(fa.table)}`)
      console.log(dim('    1. Add field as optional first'))
      console.log(dim('    2. Run backfill mutation to set default values'))
      console.log(dim('    3. Make field required after all docs have the value'))
      step += 1
    }
    for (const a of fieldRemoved) {
      const fa = a as MigrationAction & { field: string }
      console.log(`\n  ${yellow(`Step ${step}:`)} Remove ${cyan(fa.field)} from ${cyan(fa.table)}`)
      console.log(dim('    1. Remove field from schema'))
      console.log(
        dim(`    2. Run cleanup mutation: db.query("${fa.table}").collect() → patch each doc to unset ${fa.field}`)
      )
      step += 1
    }
    for (const a of fieldTypeChanged) {
      const fa = a as MigrationAction & { field: string; from: string; to: string }
      console.log(
        `\n  ${yellow(`Step ${step}:`)} Migrate ${cyan(fa.field)} on ${cyan(fa.table)}: ${red(fa.from)} → ${green(fa.to)}`
      )
      console.log(dim('    1. Add new field with target type (optional)'))
      console.log(dim('    2. Run transform mutation to convert existing values'))
      console.log(dim('    3. Remove old field, rename new field'))
      step += 1
    }
    for (const a of factoryChanged) {
      const fa = a as MigrationAction & { from: string; to: string }
      console.log(`\n  ${yellow(`Step ${step}:`)} Factory change on ${cyan(fa.table)}: ${red(fa.from)} → ${green(fa.to)}`)
      console.log(dim('    1. Update factory call and table helper'))
      console.log(dim('    2. Backfill new required system fields (e.g. orgId for orgCrud, userId for crud)'))
      console.log(dim('    3. Update all client-side API references'))
      step += 1
    }
    for (const a of tableRemoved) {
      console.log(`\n  ${red(`Step ${step}:`)} Remove table ${cyan(a.table)}`)
      console.log(dim('    1. Remove all references in client code'))
      console.log(dim('    2. Run cleanup mutation to delete all documents'))
      console.log(dim('    3. Remove table from schema'))
      step += 1
    }
    console.log()
  }
}
const run = () => {
  const root = process.cwd()
  const argv = process.argv.slice(2)
  const flags = new Set(argv)
  console.log(bold('\n@noboil/convex migrate\n'))
  if (hasFlag(argv, '--help', '-h')) {
    console.log(`Usage: noboil-convex migrate [options]
Compare schema versions and generate migration plans.
Options:
   --from <ref>    Git ref for the "before" schema (default: HEAD)
   --file <path>   Path to schema file (auto-detected if omitted)
   --snapshot      Print current schema snapshot (no diff)
   --help, -h      Show this help
Examples:
   noboil-convex migrate                    Compare HEAD vs working tree
   noboil-convex migrate --from HEAD~3      Compare 3 commits ago vs now
   noboil-convex migrate --snapshot         Print current schema tables & fields
 `)
    return
  }
  const schemaFile = findSchemaFile(root)
  if (!schemaFile) {
    console.log(red('\u2717 Could not find schema file with @noboil/convex markers'))
    console.log(dim('  Expected a .ts file using makeOwned/makeOrgScoped/etc.'))
    process.exit(1)
  }
  console.log(`${dim('schema:')} ${schemaFile.path}\n`)
  if (flags.has('--snapshot')) {
    const snapshot = parseSchemaContent(schemaFile.content)
    console.log(bold(`${snapshot.tables.length} table(s):\n`))
    for (const t of snapshot.tables) {
      console.log(`  ${cyan(t.name)} ${dim(`(${t.factory})`)}`)
      for (const f of t.fields) console.log(`    ${f.name}: ${f.type}${f.optional ? dim(' (optional)') : ''}`)
    }
    console.log()
    return
  }
  const fromRef = readArgOrEqFlag(argv, 'from', 'HEAD')
  const relativePath = schemaFile.path.startsWith(root) ? schemaFile.path.slice(root.length + 1) : schemaFile.path
  const oldContent = getSchemaFromGit(fromRef, relativePath)
  if (!oldContent) {
    console.log(yellow(`\u26A0 Could not read schema from ${fromRef}`))
    console.log(dim('  File may not exist at that commit'))
    console.log(dim(`  Tried: git show ${fromRef}:${relativePath}\n`))
    return
  }
  const before = parseSchemaContent(oldContent)
  const after = parseSchemaContent(schemaFile.content)
  const actions = diffSnapshots(before, after)
  console.log(`${dim('comparing:')} ${fromRef} → working tree\n`)
  printMigrationPlan(actions)
}
if (import.meta.main) run()
export { diffSnapshots, isOptionalField, parseFieldsFromBlock, parseSchemaContent }
export type { FieldInfo, MigrationAction, SchemaSnapshot, TableSnapshot }

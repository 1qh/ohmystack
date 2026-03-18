#!/usr/bin/env bun
/* eslint-disable no-console */
/* oxlint-disable eslint/max-statements, eslint/complexity */
/** biome-ignore-all lint/style/noProcessEnv: cli */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  cyan = (s: string) => `\u001B[36m${s}\u001B[0m`

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
  | { table: string; type: 'table_added' }
  | { table: string; type: 'table_removed' }

interface SchemaSnapshot {
  tables: TableSnapshot[]
}

interface TableSnapshot {
  fields: FieldInfo[]
  name: string
}

const schemaMarkers = ['schema(', 'table(', 't.'],
  tablePat = /(?<tname>\w+)\s*:\s*table\([^,]+,\s*\{/gu,
  fieldLinePat = /^\s*(?<fname>\w+)\s*:\s*(?<ftype>.+?)\s*,?$/u,
  isSchemaFile = (content: string): boolean => {
    for (const marker of schemaMarkers) if (content.includes(marker)) return true
    return false
  },
  detectFieldType = (raw: string): string => {
    const t = raw.trim()
    if (t.includes('t.bool(')) return 'boolean'
    if (t.includes('t.u') || t.includes('t.i') || t.includes('t.f')) return 'number'
    if (t.includes('t.string(')) return 'string'
    if (t.includes('t.bytes(')) return 'bytes'
    if (t.includes('t.array(')) return 'array'
    if (t.includes('t.map(')) return 'map'
    return 'unknown'
  },
  isOptionalField = (raw: string): boolean => raw.includes('t.option('),
  parseFieldsFromBlock = (block: string): FieldInfo[] => {
    const fields: FieldInfo[] = [],
      lines = block.split('\n')
    for (const line of lines) {
      const m = fieldLinePat.exec(line)
      if (m) {
        const rest = line.slice(line.indexOf(':') + 1)
        fields.push({ name: m.groups?.fname ?? '', optional: isOptionalField(rest), type: detectFieldType(rest) })
      }
    }
    return fields
  },
  parseSchemaContent = (content: string): SchemaSnapshot => {
    const tables: TableSnapshot[] = []
    let tm = tablePat.exec(content)
    while (tm) {
      const tableName = tm.groups?.tname ?? '',
        start = tm.index + tm[0].length
      let depth = 1,
        pos = start
      while (pos < content.length && depth > 0) {
        if (content[pos] === '{') depth += 1
        else if (content[pos] === '}') depth -= 1
        pos += 1
      }
      const fieldBlock = content.slice(start, pos - 1)
      tables.push({ fields: parseFieldsFromBlock(fieldBlock), name: tableName })
      tm = tablePat.exec(content)
    }
    tablePat.lastIndex = 0
    return { tables: tables.toSorted((a, b) => a.name.localeCompare(b.name)) }
  },
  diffSnapshots = (before: SchemaSnapshot, after: SchemaSnapshot): MigrationAction[] => {
    const actions: MigrationAction[] = [],
      beforeMap = new Map<string, TableSnapshot>(),
      afterMap = new Map<string, TableSnapshot>()
    for (const t of before.tables) beforeMap.set(t.name, t)
    for (const t of after.tables) afterMap.set(t.name, t)
    for (const t of after.tables) if (!beforeMap.has(t.name)) actions.push({ table: t.name, type: 'table_added' })
    for (const t of before.tables) if (!afterMap.has(t.name)) actions.push({ table: t.name, type: 'table_removed' })
    for (const t of after.tables) {
      const prev = beforeMap.get(t.name)
      if (prev) {
        const prevFields = new Map<string, FieldInfo>(),
          nextFields = new Map<string, FieldInfo>()
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
          } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.config.ts'))
            out.push(full)
        }
      }
    walk(root)
    return out
  },
  findSchemaFile = (root: string): undefined | { content: string; path: string } => {
    const candidates = [join(root, 'module'), join(root, 'src', 'module')]
    for (const dir of candidates)
      if (existsSync(dir)) {
        const files = listTypeScriptFiles(dir)
        for (const full of files) {
          const content = readFileSync(full, 'utf8')
          if (isSchemaFile(content) && content.includes('schema(') && content.includes('table('))
            return { content, path: full }
        }
      }
    for (const full of listTypeScriptFiles(root)) {
      const content = readFileSync(full, 'utf8')
      if (isSchemaFile(content) && content.includes('schema(') && content.includes('table('))
        return { content, path: full }
    }
  },
  getSchemaFromGit = (ref: string, filePath: string): string | undefined => {
    try {
      return execSync(`git show ${ref}:${filePath}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    } catch {
      return ''
    }
  },
  printMigrationPlan = (actions: MigrationAction[]) => {
    if (actions.length === 0) {
      console.log(green('✓ No schema changes detected\n'))
      return
    }
    console.log(bold(`\n${actions.length} change(s) detected:\n`))
    const tableAdded = actions.filter(a => a.type === 'table_added'),
      tableRemoved = actions.filter(a => a.type === 'table_removed'),
      fieldAddedReq = actions.filter(a => a.type === 'field_added_required'),
      fieldAddedOpt = actions.filter(a => a.type === 'field_added_optional'),
      fieldRemoved = actions.filter(a => a.type === 'field_removed'),
      fieldTypeChanged = actions.filter(a => a.type === 'field_type_changed'),
      dangerous = [...tableRemoved, ...fieldAddedReq, ...fieldRemoved, ...fieldTypeChanged],
      safe = [...tableAdded, ...fieldAddedOpt]
    if (safe.length > 0) {
      console.log(green(bold('Likely safe with republish:')))
      for (const a of tableAdded) console.log(`  ${green('+')} Table ${cyan(a.table)} added`)
      for (const a of fieldAddedOpt) {
        const fa = a as MigrationAction & { field: string }
        console.log(`  ${green('+')} Field ${cyan(fa.field)} added to ${cyan(fa.table)} (optional)`)
      }
      console.log()
    }
    if (dangerous.length > 0) {
      console.log(yellow(bold('Requires staged publish plan:')))
      let step = 1
      for (const a of fieldAddedReq) {
        const fa = a as MigrationAction & { field: string }
        console.log(`\n  ${yellow(`Step ${step}:`)} Backfill ${cyan(fa.field)} on ${cyan(fa.table)}`)
        console.log(dim('    1. Publish with field optional first'))
        console.log(dim('    2. Backfill existing rows with reducer/script'))
        console.log(dim('    3. Publish again with field required'))
        step += 1
      }
      for (const a of fieldRemoved) {
        const fa = a as MigrationAction & { field: string }
        console.log(`\n  ${yellow(`Step ${step}:`)} Remove ${cyan(fa.field)} from ${cyan(fa.table)}`)
        console.log(dim('    1. Stop writing the field in reducers'))
        console.log(dim('    2. Publish schema without the field'))
        step += 1
      }
      for (const a of fieldTypeChanged) {
        const fa = a as MigrationAction & { field: string; from: string; to: string }
        console.log(
          `\n  ${yellow(`Step ${step}:`)} Migrate ${cyan(fa.field)} on ${cyan(fa.table)}: ${red(fa.from)} → ${green(fa.to)}`
        )
        console.log(dim('    1. Add parallel field with target type'))
        console.log(dim('    2. Backfill and swap reducer usage'))
        console.log(dim('    3. Publish cleanup schema'))
        step += 1
      }
      for (const a of tableRemoved) {
        console.log(`\n  ${red(`Step ${step}:`)} Remove table ${cyan(a.table)}`)
        console.log(dim('    1. Remove reducer references in app code'))
        console.log(dim('    2. Publish schema without the table'))
        step += 1
      }
      console.log()
    }
    console.log(
      dim('SpacetimeDB applies schema updates on publish. Use this plan to stage risky changes before final publish.')
    )
    console.log('')
  },
  run = () => {
    const root = process.cwd(),
      flags = new Set(process.argv.slice(2)),
      args = process.argv.slice(2).filter(a => !a.startsWith('--'))

    console.log(bold('\nnoboil-stdb migrate\n'))

    if (flags.has('--help') || flags.has('-h')) {
      console.log(`Usage: noboil-stdb migrate [options]

Compare SpacetimeDB schema versions and generate publish plans.

Options:
   --from <ref>    Git ref for the "before" schema (default: HEAD)
   --file <path>   Path to schema file (auto-detected if omitted)
   --snapshot      Print current schema snapshot (no diff)
   --help, -h      Show this help

Examples:
   noboil-stdb migrate                    Compare HEAD vs working tree
   noboil-stdb migrate --from HEAD~3      Compare 3 commits ago vs now
   noboil-stdb migrate --snapshot         Print current schema tables & fields
`)
      return
    }

    const schemaFile = findSchemaFile(root)
    if (!schemaFile) {
      console.log(red('✗ Could not find schema file with SpacetimeDB markers'))
      console.log(dim('  Expected a .ts file using schema()/table().'))
      process.exit(1)
    }
    console.log(`${dim('schema:')} ${schemaFile.path}\n`)

    if (flags.has('--snapshot')) {
      const snapshot = parseSchemaContent(schemaFile.content)
      console.log(bold(`${snapshot.tables.length} table(s):\n`))
      for (const t of snapshot.tables) {
        console.log(`  ${cyan(t.name)}`)
        for (const f of t.fields) console.log(`    ${f.name}: ${f.type}${f.optional ? dim(' (optional)') : ''}`)
      }
      console.log('')
      return
    }

    let fromRef = 'HEAD'
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i]
      if (arg === '--from' && i + 1 < args.length) {
        const nextArg = args[i + 1]
        if (nextArg) fromRef = nextArg
      }
    }
    for (const flag of flags) if (flag.startsWith('--from=')) fromRef = flag.slice(7)

    const relativePath = schemaFile.path.startsWith(root) ? schemaFile.path.slice(root.length + 1) : schemaFile.path,
      oldContent = getSchemaFromGit(fromRef, relativePath)
    if (!oldContent) {
      console.log(yellow(`⚠ Could not read schema from ${fromRef}`))
      console.log(dim('  File may not exist at that commit'))
      console.log(dim(`  Tried: git show ${fromRef}:${relativePath}\n`))
      return
    }

    const before = parseSchemaContent(oldContent),
      after = parseSchemaContent(schemaFile.content),
      actions = diffSnapshots(before, after)

    console.log(`${dim('comparing:')} ${fromRef} → working tree\n`)
    printMigrationPlan(actions)
  }

if (import.meta.main) run()

export { diffSnapshots, isOptionalField, parseFieldsFromBlock, parseSchemaContent }
export type { FieldInfo, MigrationAction, SchemaSnapshot, TableSnapshot }

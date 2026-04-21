#!/usr/bin/env bun
/* eslint-disable no-console */
// oxlint-disable no-await-expression-member
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { camelToTitle, createCliTheme, hasFlag, parseEnumFieldDef, readEqFlag, writeIfNotExists } from '../shared/cli'
interface AddFlags {
  appDir: string
  fields: ParsedField[]
  help: boolean
  moduleDir: string
  name: string
  parent: string
  type: TableType
}
type FieldType = 'boolean' | 'number' | 'string'
interface ParsedField {
  name: string
  optional: boolean
  type: FieldType | { enum: string[] }
}
type TableType = 'cache' | 'child' | 'org' | 'owned' | 'singleton'
const TABLE_TYPES = new Set<TableType>(['cache', 'child', 'org', 'owned', 'singleton'])
const FIELD_TYPES = new Set<FieldType>(['boolean', 'number', 'string'])
const { bold, dim, green, red, yellow } = createCliTheme()
const parseFieldDef = (raw: string): null | ParsedField => parseEnumFieldDef(raw, FIELD_TYPES)
const parseAddFlags = (args: string[]): AddFlags => {
  let type: TableType = 'owned'
  let moduleDir = 'module'
  let appDir = 'src/app'
  let name = ''
  let parent = ''
  let fieldsRaw = ''
  const help = hasFlag(args, '--help', '-h')
  for (const arg of args)
    if (arg.startsWith('--type=')) {
      const val = arg.slice('--type='.length)
      if (TABLE_TYPES.has(val as TableType)) type = val as TableType
      else {
        console.log(`${red('Invalid type:')} ${val}. Valid: ${[...TABLE_TYPES].join(', ')}`)
        process.exit(1)
      }
    } else if (arg.startsWith('--fields=')) fieldsRaw = arg.slice('--fields='.length)
    else if (!(arg.startsWith('-') || name)) name = arg
  moduleDir = readEqFlag(args, 'module-dir', moduleDir)
  appDir = readEqFlag(args, 'app-dir', appDir)
  parent = readEqFlag(args, 'parent', parent)
  const fields: ParsedField[] = []
  if (fieldsRaw)
    for (const f of fieldsRaw.split(',')) {
      const parsed = parseFieldDef(f)
      if (parsed) fields.push(parsed)
      else console.log(`${yellow('warn')} Skipping invalid field: ${f}`)
    }
  return { appDir, fields, help, moduleDir, name, parent, type }
}
const printAddHelp = () => {
  console.log(`${bold('noboil-stdb add')} — add a new table/reducer to your project\n`)
  console.log(bold('Usage:'))
  console.log('  noboil-stdb add <table-name> [options]\n')
  console.log(bold('Options:'))
  console.log(`  --type=TYPE           Table type: owned, org, singleton, cache, child ${dim('(default: owned)')}`)
  console.log(
    `  --fields=FIELDS       Field definitions ${dim('(e.g. "title:string,done:boolean,priority:enum(low,medium,high)")')}`
  )
  console.log(`  --parent=TABLE        Parent table name ${dim('(required for child type)')}`)
  console.log(`  --module-dir=DIR      SpacetimeDB module directory ${dim('(default: module)')}`)
  console.log(`  --app-dir=DIR         App directory ${dim('(default: src/app)')}`)
  console.log('  --help, -h            Show this help\n')
  console.log(bold('Examples:'))
  console.log(`  ${dim('$')} noboil-stdb add todo --fields="title:string,done:boolean"`)
  console.log(
    `  ${dim('$')} noboil-stdb add wiki --type=org --fields="title:string,content:string,status:enum(draft,published)"`
  )
  console.log(`  ${dim('$')} noboil-stdb add message --type=child --parent=chat --fields="text:string"`)
  console.log(`  ${dim('$')} noboil-stdb add profile --type=singleton --fields="displayName:string,bio:string?"`)
  console.log(`  ${dim('$')} noboil-stdb add movie --type=cache --fields="title:string,externalId:string"\n`)
}
const fieldToTypeExpr = (f: ParsedField): string => {
  if (typeof f.type === 'object') return 't.string()'
  if (f.type === 'boolean') return 't.bool()'
  if (f.type === 'number') return 't.f64()'
  return 't.string()'
}
const fieldToInputType = (f: ParsedField): string => {
  if (typeof f.type === 'object') {
    const vals = f.type.enum.map(v => `'${v}'`).join(' | ')
    return f.optional ? `${vals} | undefined` : vals
  }
  const base = f.type === 'boolean' ? 'boolean' : f.type === 'number' ? 'number' : 'string'
  return f.optional ? `${base} | undefined` : base
}
const defaultFields = (type: TableType): ParsedField[] => {
  const base: ParsedField[] = [
    { name: 'title', optional: false, type: 'string' },
    { name: 'content', optional: false, type: 'string' }
  ]
  if (type === 'child') return [{ name: 'text', optional: false, type: 'string' }]
  if (type === 'singleton')
    return [
      { name: 'displayName', optional: false, type: 'string' },
      { name: 'bio', optional: true, type: 'string' }
    ]
  if (type === 'cache')
    return [
      { name: 'title', optional: false, type: 'string' },
      { name: 'externalId', optional: false, type: 'string' }
    ]
  return base
}
const tableVisibility = (type: TableType): string => (type === 'cache' ? 'public: true' : 'public: false')
const genTableContent = (name: string, type: TableType, fields: ParsedField[]): string => {
  const lines: string[] = []
  for (const f of fields) lines.push(`  ${f.name}: ${fieldToTypeExpr(f)},`)
  if (type === 'child') lines.unshift('  parentId: t.string(),')
  if (type === 'org') lines.unshift('  orgId: t.string(),')
  if (type === 'owned' || type === 'singleton') lines.unshift('  userId: t.string(),')
  return `import { table, t } from 'spacetimedb'
const ${name}Table = table({ ${tableVisibility(type)} }, {
${lines.join('\n')}
})
export { ${name}Table }
`
}
const pickFields = (fields: ParsedField[]): string => {
  const lines: string[] = []
  for (const f of fields) lines.push(`${f.name}: input.${f.name}`)
  return lines.join(', ')
}
const genReducerContent = ({
  fields,
  name,
  parent,
  type
}: {
  fields: ParsedField[]
  name: string
  parent: string
  type: TableType
}): string => {
  const createFields: string[] = []
  for (const f of fields) createFields.push(`  ${f.name}${f.optional ? '?' : ''}: ${fieldToInputType(f)}`)
  if (type === 'child') createFields.unshift('  parentId: string')
  if (type === 'org') createFields.unshift('  orgId: string')
  if (type === 'owned' || type === 'singleton') createFields.unshift('  userId: string')
  const updateFields: string[] = []
  for (const f of fields) updateFields.push(`  ${f.name}?: ${fieldToInputType({ ...f, optional: true })}`)
  const idType = type === 'singleton' ? 'userId: string' : 'id: number'
  const parentLabel = type === 'child' ? `, parent: '${parent || name}'` : ''
  return `import { reducer } from 'spacetimedb'
import { make${
    type === 'cache'
      ? 'CacheCrud'
      : type === 'child'
        ? 'ChildCrud'
        : type === 'org'
          ? 'Org'
          : type === 'singleton'
            ? 'Crud'
            : 'Crud'
  } } from './server'
const model = make${
    type === 'cache'
      ? 'CacheCrud'
      : type === 'child'
        ? 'ChildCrud'
        : type === 'org'
          ? 'Org'
          : type === 'singleton'
            ? 'Crud'
            : 'Crud'
  }({ table: '${name}'${parentLabel} })
const create${camelToTitle(name).replaceAll(/\s/gu, '')} = reducer(
  '${name}.create',
  (ctx, input: {
${createFields.join('\n')}
  }) => model.create(ctx, { ${pickFields(fields)} })
)
const update${camelToTitle(name).replaceAll(/\s/gu, '')} = reducer(
  '${name}.update',
  (ctx, input: {
  ${idType}
${updateFields.join('\n')}
  }) => model.update(ctx, input)
)
const remove${camelToTitle(name).replaceAll(/\s/gu, '')} = reducer('${name}.rm', (ctx, input: { ${idType} }) => model.rm(ctx, input))
export { create${camelToTitle(name).replaceAll(/\s/gu, '')}, remove${camelToTitle(name).replaceAll(/\s/gu, '')}, update${camelToTitle(
    name
  ).replaceAll(/\s/gu, '')} }
`
}
const genPageContent = (name: string, type: TableType): string => {
  const title = camelToTitle(name)
  const component = title.replaceAll(/\s/gu, '')
  if (type === 'singleton')
    return `'use client'
import { useState } from 'react'
import { useSpacetime } from '../../spacetime-client'
const ${component}Page = () => {
  const spacetime = useSpacetime()
  const [loading, setLoading] = useState(false)
  const refresh = async () => {
    setLoading(true)
    await spacetime.callReducer('${name}.get', {})
    setLoading(false)
  }
  return (
    <main className='mx-auto max-w-2xl p-8'>
      <h1 className='mb-6 text-2xl font-bold'>${title}</h1>
      <button className='rounded bg-background px-4 py-2 text-foreground hover:bg-muted' onClick={refresh} type='button'>
        {loading ? 'Loading...' : 'Refresh'}
      </button>
    </main>
  )
}
export default ${component}Page
`
  return `'use client'
import { useState } from 'react'
import { useSpacetime } from '../../spacetime-client'
const ${component}Page = () => {
  const spacetime = useSpacetime()
  const [loading, setLoading] = useState(false)
  const refresh = async () => {
    setLoading(true)
    await spacetime.callReducer('${name}.list', {})
    setLoading(false)
  }
  return (
    <main className='mx-auto max-w-2xl p-8'>
      <h1 className='mb-6 text-2xl font-bold'>${title}</h1>
      <button className='rounded bg-background px-4 py-2 text-foreground hover:bg-muted' onClick={refresh} type='button'>
        {loading ? 'Loading...' : 'Load ${title}'}
      </button>
    </main>
  )
}
export default ${component}Page
`
}
const isInteractive = () => typeof process.stdin.isTTY === 'boolean' && process.stdin.isTTY
const promptInteractive = async (): Promise<AddFlags> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log(`\n${bold('noboil-stdb add')} ${dim('— interactive mode')}\n`)
    const name = (await rl.question(`${bold('Table name:')} `)).trim()
    if (!name) {
      console.log(`${red('Error:')} table name is required.`)
      process.exit(1)
    }
    const typeStr =
      (await rl.question(`${bold('Type')} ${dim('(owned, org, singleton, cache, child)')} [owned]: `)).trim() || 'owned'
    if (!TABLE_TYPES.has(typeStr as TableType)) {
      console.log(`${red('Invalid type:')} ${typeStr}`)
      process.exit(1)
    }
    const type = typeStr as TableType
    let parent = ''
    if (type === 'child') {
      parent = (await rl.question(`${bold('Parent table:')} `)).trim()
      if (!parent) {
        console.log(`${red('Error:')} parent table is required for child type.`)
        process.exit(1)
      }
    }
    const fieldsRaw = (
      await rl.question(`${bold('Fields')} ${dim('(e.g. title:string,done:boolean,bio:string?)')} [defaults]: `)
    ).trim()
    const fields: ParsedField[] = []
    if (fieldsRaw)
      for (const f of fieldsRaw.split(',')) {
        const parsed = parseFieldDef(f)
        if (parsed) fields.push(parsed)
        else console.log(`${yellow('warn')} Skipping invalid field: ${f}`)
      }
    return { appDir: 'src/app', fields, help: false, moduleDir: 'module', name, parent, type }
  } finally {
    rl.close()
  }
}
const addSync = (flags: AddFlags) => {
  const fields = flags.fields.length > 0 ? flags.fields : defaultFields(flags.type)
  const modulePath = join(process.cwd(), flags.moduleDir)
  const appPath = join(process.cwd(), flags.appDir)
  console.log(`\n${bold(`Adding ${flags.type} table: ${flags.name}`)}\n`)
  let created = 0
  let skipped = 0
  const tableFile = join(modulePath, `tables/${flags.name}.ts`)
  if (
    writeIfNotExists({
      content: genTableContent(flags.name, flags.type, fields),
      label: `${flags.moduleDir}/tables/${flags.name}.ts`,
      path: tableFile,
      theme: { dim, green, yellow }
    })
  )
    created += 1
  else skipped += 1
  const reducerFile = join(modulePath, `reducers/${flags.name}.ts`)
  if (
    writeIfNotExists({
      content: genReducerContent({ fields, name: flags.name, parent: flags.parent, type: flags.type }),
      label: `${flags.moduleDir}/reducers/${flags.name}.ts`,
      path: reducerFile,
      theme: { dim, green, yellow }
    })
  )
    created += 1
  else skipped += 1
  const pageDir = join(appPath, flags.name)
  const pageFile = join(pageDir, 'page.tsx')
  if (
    writeIfNotExists({
      content: genPageContent(flags.name, flags.type),
      label: `${flags.appDir}/${flags.name}/page.tsx`,
      path: pageFile,
      theme: { dim, green, yellow }
    })
  )
    created += 1
  else skipped += 1
  console.log('')
  if (created > 0) console.log(`${green('✓')} Created ${created} file${created > 1 ? 's' : ''}.`)
  if (skipped > 0) console.log(`${yellow('⚠')} Skipped ${skipped} existing file${skipped > 1 ? 's' : ''}.`)
  console.log(`\n${bold('Next steps:')}`)
  console.log(`  ${dim('1.')} Register table in your module schema()`)
  console.log(`  ${dim('2.')} Export reducer from your module entrypoint`)
  console.log(`  ${dim('3.')} Run spacetime publish and spacetime generate\n`)
  return { created, skipped }
}
const add = async (args: string[] = []) => {
  const flags = parseAddFlags(args)
  if (flags.help) {
    printAddHelp()
    return { created: 0, skipped: 0 }
  }
  if (!flags.name && isInteractive()) {
    const interactiveFlags = await promptInteractive()
    return addSync(interactiveFlags)
  }
  if (!flags.name) {
    console.log(`${red('Error:')} table name is required.\n`)
    printAddHelp()
    process.exit(1)
  }
  if (flags.type === 'child' && !flags.parent) {
    console.log(`${red('Error:')} --parent is required for child type.\n`)
    process.exit(1)
  }
  return addSync(flags)
}
if (process.argv[1]?.endsWith('add.ts')) await add(process.argv.slice(2))
export {
  add,
  defaultFields,
  fieldToInputType,
  fieldToTypeExpr,
  genPageContent,
  genReducerContent,
  genTableContent,
  parseAddFlags,
  parseFieldDef
}
export type { AddFlags, FieldType, ParsedField, TableType }

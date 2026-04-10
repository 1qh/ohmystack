#!/usr/bin/env bun
/* eslint-disable no-console */
import { camelToTitle, createCliTheme, hasFlag, parseEnumFieldDef, readEqFlag, writeIfNotExists } from '@a/shared/cli'
/** biome-ignore-all lint/style/noProcessEnv: cli */
import { join } from 'node:path'
interface AddFlags {
  appDir: string
  convexDir: string
  fields: ParsedField[]
  help: boolean
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
  let convexDir = 'convex'
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
  convexDir = readEqFlag(args, 'convex-dir', convexDir)
  appDir = readEqFlag(args, 'app-dir', appDir)
  parent = readEqFlag(args, 'parent', parent)
  const fields: ParsedField[] = []
  if (fieldsRaw)
    for (const f of fieldsRaw.split(',')) {
      const parsed = parseFieldDef(f)
      if (parsed) fields.push(parsed)
      else console.log(`${yellow('warn')} Skipping invalid field: ${f}`)
    }
  return { appDir, convexDir, fields, help, name, parent, type }
}
const printAddHelp = () => {
  console.log(`${bold('noboil-convex add')} — add a new table/endpoint to your project\n`)
  console.log(bold('Usage:'))
  console.log('  noboil-convex add <table-name> [options]\n')
  console.log(bold('Options:'))
  console.log(`  --type=TYPE           Table type: owned, org, singleton, cache, child ${dim('(default: owned)')}`)
  console.log(
    `  --fields=FIELDS       Field definitions ${dim('(e.g. "title:string,done:boolean,priority:enum(low,medium,high)")')}`
  )
  console.log(`  --parent=TABLE        Parent table name ${dim('(required for child type)')}`)
  console.log(`  --convex-dir=DIR      Convex directory ${dim('(default: convex)')}`)
  console.log(`  --app-dir=DIR         App directory ${dim('(default: src/app)')}`)
  console.log('  --help, -h            Show this help\n')
  console.log(bold('Examples:'))
  console.log(`  ${dim('$')} noboil-convex add todo --fields="title:string,done:boolean"`)
  console.log(
    `  ${dim('$')} noboil-convex add wiki --type=org --fields="title:string,content:string,status:enum(draft,published)"`
  )
  console.log(`  ${dim('$')} noboil-convex add message --type=child --parent=chat --fields="text:string"`)
  console.log(`  ${dim('$')} noboil-convex add profile --type=singleton --fields="displayName:string,bio:string?"`)
  console.log(`  ${dim('$')} noboil-convex add movie --type=cache --fields="title:string,tmdb_id:number"\n`)
}
const fieldToZod = (f: ParsedField): string => {
  const base = typeof f.type === 'object' ? `zenum([${f.type.enum.map(v => `'${v}'`).join(', ')}])` : `${f.type}()`
  return f.optional ? `${base}.optional()` : base
}
const schemaImport = (type: TableType): string => {
  const map: Record<TableType, string> = {
    cache: 'makeBase',
    child: 'child',
    org: 'makeOrgScoped',
    owned: 'makeOwned',
    singleton: 'makeSingleton'
  }
  return map[type]
}
const schemaWrapper = (type: TableType): string => {
  const map: Record<TableType, string> = {
    cache: 'base',
    child: '',
    org: 'orgScoped',
    owned: 'owned',
    singleton: 'singletons'
  }
  return map[type]
}
const factoryFn = (type: TableType): string => {
  const map: Record<TableType, string> = {
    cache: 'cacheCrud',
    child: 'childCrud',
    org: 'orgCrud',
    owned: 'crud',
    singleton: 'singletonCrud'
  }
  return map[type]
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
const genSchemaContent = (name: string, type: TableType, fields: ParsedField[]): string => {
  const wrapper = schemaWrapper(type)
  const fieldLines = fields.map(f => `    ${f.name}: ${fieldToZod(f)}`).join(',\n')
  const zodImports = new Set<string>(['object'])
  for (const f of fields)
    if (typeof f.type === 'string') zodImports.add(f.type)
    else zodImports.add('enum as zenum')
  if (fields.some(f => f.optional)) zodImports.add('optional')
  const sortedImports = [...zodImports].toSorted()
  if (type === 'child')
    return `import { child } from '@noboil/convex/schema'
import { ${sortedImports.join(', ')} } from 'zod/v4'
const ${name}Child = child({
  foreignKey: '${fields[0]?.name ?? 'parentId'}',
  parent: '${name}',
  schema: object({
${fieldLines}
  })
})
export { ${name}Child }
`
  const importFn = schemaImport(type)
  return `import { ${importFn} } from '@noboil/convex/schema'
import { ${sortedImports.join(', ')} } from 'zod/v4'
const ${wrapper} = ${importFn}({
  ${name}: object({
${fieldLines}
  })
})
export { ${wrapper} }
`
}
const genEndpointContent = (name: string, type: TableType): string => {
  const factory = factoryFn(type)
  const wrapper = schemaWrapper(type)
  if (type === 'child')
    return `import { ${factory} } from './lazy'
import { ${name}Child } from './s'
export const {
  create, get, list, rm, update
} = ${factory}('${name}', ${name}Child)
`
  if (type === 'singleton')
    return `import { ${factory} } from './lazy'
import { ${wrapper} } from './s'
export const { get, upsert } = ${factory}('${name}', ${wrapper}.${name})
`
  if (type === 'cache')
    return `import { ${factory} } from './lazy'
import { ${wrapper} } from './s'
export const {
  create, get, list, rm, update, invalidate, purge, load, refresh
} = ${factory}({ key: '${name}', schema: ${wrapper}.${name}, table: '${name}' })
`
  if (type === 'org')
    return `import { ${factory} } from './lazy'
import { ${wrapper} } from './s'
export const {
  addEditor, create, editors, list, read,
  removeEditor, rm, setEditors, update
} = ${factory}('${name}', ${wrapper}.${name})
`
  return `import { ${factory} } from './lazy'
import { ${wrapper} } from './s'
export const {
  create,
  pub: { list, read },
  rm, update
} = ${factory}('${name}', ${wrapper}.${name})
`
}
const genPageContent = (name: string, type: TableType): string => {
  const title = camelToTitle(name)
  if (type === 'singleton')
    return `'use client'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../guarded-api'
const ${title.replaceAll(/\s/gu, '')}Page = () => {
  const data = useQuery(api.${name}.get)
  const upsert = useMutation(api.${name}.upsert)
  const [editing, setEditing] = useState(false)
  return (
    <main className='mx-auto max-w-2xl p-8'>
      <h1 className='mb-6 text-2xl font-bold'>${title}</h1>
      {data ? (
        <pre className='rounded bg-zinc-100 p-4 text-sm'>{JSON.stringify(data, null, 2)}</pre>
      ) : (
        <p className='text-zinc-400'>No data yet.</p>
      )}
    </main>
  )
}
export default ${title.replaceAll(/\s/gu, '')}Page
`
  return `'use client'
import { useList } from '@noboil/convex/react'
import { api } from '../../../guarded-api'
const ${title.replaceAll(/\s/gu, '')}Page = () => {
  const { items, loadMore, status } = useList(api.${name}.list)
  return (
    <main className='mx-auto max-w-2xl p-8'>
      <h1 className='mb-6 text-2xl font-bold'>${title}</h1>
      <ul className='divide-y'>
        {items.map(i => (
          <li className='py-3' key={i._id}>
            <span className='font-medium'>{JSON.stringify(i)}</span>
          </li>
        ))}
      </ul>
      {status === 'CanLoadMore' ? (
        <button className='mt-4 text-sm text-zinc-500 hover:text-zinc-900' onClick={loadMore} type='button'>
          Load more
        </button>
      ) : null}
      {items.length === 0 ? <p className='text-zinc-400'>No items yet.</p> : null}
    </main>
  )
}
export default ${title.replaceAll(/\s/gu, '')}Page
`
}
const add = (args: string[] = []) => {
  const flags = parseAddFlags(args)
  if (flags.help) {
    printAddHelp()
    return { created: 0, skipped: 0 }
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
  const fields = flags.fields.length > 0 ? flags.fields : defaultFields(flags.type)
  const convexPath = join(process.cwd(), flags.convexDir)
  const appPath = join(process.cwd(), flags.appDir)
  console.log(`\n${bold(`Adding ${flags.type} table: ${flags.name}`)}\n`)
  let created = 0
  let skipped = 0
  const schemaFile = join(convexPath, `${flags.name}-schema.ts`)
  if (
    writeIfNotExists({
      content: genSchemaContent(flags.name, flags.type, fields),
      label: `${flags.convexDir}/${flags.name}-schema.ts`,
      path: schemaFile,
      theme: { dim, green, yellow }
    })
  )
    created += 1
  else skipped += 1
  const endpointFile = join(convexPath, `${flags.name}.ts`)
  if (
    writeIfNotExists({
      content: genEndpointContent(flags.name, flags.type),
      label: `${flags.convexDir}/${flags.name}.ts`,
      path: endpointFile,
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
  console.log(`  ${dim('1.')} Import and register in your schema.ts`)
  console.log(`  ${dim('2.')} Add ${flags.type === 'child' ? 'childCrud' : factoryFn(flags.type)} import to your lazy.ts`)
  console.log(`  ${dim('3.')} Update guarded-api.ts to include '${flags.name}'\n`)
  return { created, skipped }
}
if (process.argv[1]?.endsWith('add.ts')) add(process.argv.slice(2))
export {
  add,
  defaultFields,
  fieldToZod,
  genEndpointContent,
  genPageContent,
  genSchemaContent,
  parseAddFlags,
  parseFieldDef
}
export type { AddFlags, FieldType, ParsedField, TableType }

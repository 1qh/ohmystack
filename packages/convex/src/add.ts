#!/usr/bin/env bun
/* eslint-disable no-console */

/** biome-ignore-all lint/style/noProcessEnv: cli */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
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

const TABLE_TYPES = new Set<TableType>(['cache', 'child', 'org', 'owned', 'singleton']),
  FIELD_TYPES = new Set<FieldType>(['boolean', 'number', 'string']),
  ENUM_PAT = /^enum\((?<values>[^)]+)\)$/u,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  CAMEL_PAT = /(?<upper>[A-Z])/gu,
  FIRST_CHAR_PAT = /^./u,
  camelToTitle = (s: string) => s.replace(CAMEL_PAT, ' $1').replace(FIRST_CHAR_PAT, c => c.toUpperCase()),
  parseFieldDef = (raw: string): null | ParsedField => {
    const parts = raw.split(':')
    if (parts.length !== 2) return null
    const name = (parts[0] ?? '').trim()
    let typePart = (parts[1] ?? '').trim(),
      optional = false
    if (typePart.endsWith('?')) {
      optional = true
      typePart = typePart.slice(0, -1)
    }
    const enumMatch = ENUM_PAT.exec(typePart)
    if (enumMatch?.groups?.values) {
      const values = enumMatch.groups.values.split(',').map(v => v.trim())
      return { name, optional, type: { enum: values } }
    }
    if (!FIELD_TYPES.has(typePart as FieldType)) return null
    return { name, optional, type: typePart as FieldType }
  },
  parseAddFlags = (args: string[]): AddFlags => {
    let type: TableType = 'owned',
      convexDir = 'convex',
      appDir = 'src/app',
      help = false,
      name = '',
      parent = '',
      fieldsRaw = ''
    for (const arg of args)
      if (arg === '--help' || arg === '-h') help = true
      else if (arg.startsWith('--type=')) {
        const val = arg.slice('--type='.length)
        if (TABLE_TYPES.has(val as TableType)) type = val as TableType
        else {
          console.log(`${red('Invalid type:')} ${val}. Valid: ${[...TABLE_TYPES].join(', ')}`)
          process.exit(1)
        }
      } else if (arg.startsWith('--fields=')) fieldsRaw = arg.slice('--fields='.length)
      else if (arg.startsWith('--convex-dir=')) convexDir = arg.slice('--convex-dir='.length)
      else if (arg.startsWith('--app-dir=')) appDir = arg.slice('--app-dir='.length)
      else if (arg.startsWith('--parent=')) parent = arg.slice('--parent='.length)
      else if (!(arg.startsWith('-') || name)) name = arg

    const fields: ParsedField[] = []
    if (fieldsRaw)
      for (const f of fieldsRaw.split(',')) {
        const parsed = parseFieldDef(f)
        if (parsed) fields.push(parsed)
        else console.log(`${yellow('warn')} Skipping invalid field: ${f}`)
      }

    return { appDir, convexDir, fields, help, name, parent, type }
  },
  printAddHelp = () => {
    console.log(`${bold('ohmystack-convex add')} — add a new table/endpoint to your project\n`)
    console.log(bold('Usage:'))
    console.log('  ohmystack-convex add <table-name> [options]\n')
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
    console.log(`  ${dim('$')} ohmystack-convex add todo --fields="title:string,done:boolean"`)
    console.log(
      `  ${dim('$')} ohmystack-convex add wiki --type=org --fields="title:string,content:string,status:enum(draft,published)"`
    )
    console.log(`  ${dim('$')} ohmystack-convex add message --type=child --parent=chat --fields="text:string"`)
    console.log(`  ${dim('$')} ohmystack-convex add profile --type=singleton --fields="displayName:string,bio:string?"`)
    console.log(`  ${dim('$')} ohmystack-convex add movie --type=cache --fields="title:string,tmdb_id:number"\n`)
  },
  fieldToZod = (f: ParsedField): string => {
    const base = typeof f.type === 'object' ? `zenum([${f.type.enum.map(v => `'${v}'`).join(', ')}])` : `${f.type}()`
    return f.optional ? `${base}.optional()` : base
  },
  schemaImport = (type: TableType): string => {
    const map: Record<TableType, string> = {
      cache: 'makeBase',
      child: 'child',
      org: 'makeOrgScoped',
      owned: 'makeOwned',
      singleton: 'makeSingleton'
    }
    return map[type]
  },
  schemaWrapper = (type: TableType): string => {
    const map: Record<TableType, string> = {
      cache: 'base',
      child: '',
      org: 'orgScoped',
      owned: 'owned',
      singleton: 'singletons'
    }
    return map[type]
  },
  factoryFn = (type: TableType): string => {
    const map: Record<TableType, string> = {
      cache: 'cacheCrud',
      child: 'childCrud',
      org: 'orgCrud',
      owned: 'crud',
      singleton: 'singletonCrud'
    }
    return map[type]
  },
  defaultFields = (type: TableType): ParsedField[] => {
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
  },
  genSchemaContent = (name: string, type: TableType, fields: ParsedField[]): string => {
    const wrapper = schemaWrapper(type),
      fieldLines = fields.map(f => `    ${f.name}: ${fieldToZod(f)}`).join(',\n'),
      zodImports = new Set<string>(['object'])
    for (const f of fields)
      if (typeof f.type === 'string') zodImports.add(f.type)
      else zodImports.add('enum as zenum')
    if (fields.some(f => f.optional)) zodImports.add('optional')
    const sortedImports = [...zodImports].toSorted()

    if (type === 'child')
      return `import { child } from '@ohmystack/convex/schema'
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
    return `import { ${importFn} } from '@ohmystack/convex/schema'
import { ${sortedImports.join(', ')} } from 'zod/v4'

const ${wrapper} = ${importFn}({
  ${name}: object({
${fieldLines}
  })
})

export { ${wrapper} }
`
  },
  genEndpointContent = (name: string, type: TableType): string => {
    const factory = factoryFn(type),
      wrapper = schemaWrapper(type)

    if (type === 'child')
      return `import { ${factory} } from './lazy'
import { ${name}Child } from './t'

export const {
  create, get, list, rm, update
} = ${factory}('${name}', ${name}Child)
`

    if (type === 'singleton')
      return `import { ${factory} } from './lazy'
import { ${wrapper} } from './t'

export const { get, upsert } = ${factory}('${name}', ${wrapper}.${name})
`

    if (type === 'cache')
      return `import { ${factory} } from './lazy'
import { ${wrapper} } from './t'

export const {
  create, get, list, rm, update, invalidate, purge, load, refresh
} = ${factory}({ key: '${name}', schema: ${wrapper}.${name}, table: '${name}' })
`

    if (type === 'org')
      return `import { ${factory} } from './lazy'
import { ${wrapper} } from './t'

export const {
  addEditor, bulkRm, create, editors, list, read,
  removeEditor, rm, setEditors, update
} = ${factory}('${name}', ${wrapper}.${name})
`

    return `import { ${factory} } from './lazy'
import { ${wrapper} } from './t'

export const {
  bulkRm, bulkUpdate, create,
  pub: { list, read },
  rm, update
} = ${factory}('${name}', ${wrapper}.${name})
`
  },
  genPageContent = (name: string, type: TableType): string => {
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
import { useList } from '@ohmystack/convex/react'

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
  },
  writeIfNotExists = (path: string, content: string, label: string): boolean => {
    if (existsSync(path)) {
      console.log(`  ${yellow('skip')} ${label} ${dim('(exists)')}`)
      return false
    }
    const dir = path.slice(0, path.lastIndexOf('/'))
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, content)
    console.log(`  ${green('✓')} ${label}`)
    return true
  },
  add = (args: string[] = []) => {
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

    const fields = flags.fields.length > 0 ? flags.fields : defaultFields(flags.type),
      convexPath = join(process.cwd(), flags.convexDir),
      appPath = join(process.cwd(), flags.appDir)

    console.log(`\n${bold(`Adding ${flags.type} table: ${flags.name}`)}\n`)

    let created = 0,
      skipped = 0

    const schemaFile = join(convexPath, `${flags.name}-schema.ts`)
    if (
      writeIfNotExists(
        schemaFile,
        genSchemaContent(flags.name, flags.type, fields),
        `${flags.convexDir}/${flags.name}-schema.ts`
      )
    )
      created += 1
    else skipped += 1

    const endpointFile = join(convexPath, `${flags.name}.ts`)
    if (writeIfNotExists(endpointFile, genEndpointContent(flags.name, flags.type), `${flags.convexDir}/${flags.name}.ts`))
      created += 1
    else skipped += 1

    const pageDir = join(appPath, flags.name),
      pageFile = join(pageDir, 'page.tsx')
    if (writeIfNotExists(pageFile, genPageContent(flags.name, flags.type), `${flags.appDir}/${flags.name}/page.tsx`))
      created += 1
    else skipped += 1

    console.log('')
    if (created > 0) console.log(`${green('✓')} Created ${created} file${created > 1 ? 's' : ''}.`)
    if (skipped > 0) console.log(`${yellow('⚠')} Skipped ${skipped} existing file${skipped > 1 ? 's' : ''}.`)
    console.log(`\n${bold('Next steps:')}`)
    console.log(`  ${dim('1.')} Import and register in your schema.ts`)
    console.log(
      `  ${dim('2.')} Add ${flags.type === 'child' ? 'childCrud' : factoryFn(flags.type)} import to your lazy.ts`
    )
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

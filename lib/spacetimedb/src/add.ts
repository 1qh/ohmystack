#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/style/noProcessEnv: cli */
// biome-ignore-all lint/nursery/noFloatingPromises: event handler
// oxlint-disable no-await-expression-member

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

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
      moduleDir = 'module',
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
      else if (arg.startsWith('--module-dir=')) moduleDir = arg.slice('--module-dir='.length)
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

    return { appDir, fields, help, moduleDir, name, parent, type }
  },
  printAddHelp = () => {
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
  },
  fieldToTypeExpr = (f: ParsedField): string => {
    if (typeof f.type === 'object') return 't.string()'
    if (f.type === 'boolean') return 't.bool()'
    if (f.type === 'number') return 't.f64()'
    return 't.string()'
  },
  fieldToInputType = (f: ParsedField): string => {
    if (typeof f.type === 'object') {
      const vals = f.type.enum.map(v => `'${v}'`).join(' | ')
      return f.optional ? `${vals} | undefined` : vals
    }
    const base = f.type === 'boolean' ? 'boolean' : f.type === 'number' ? 'number' : 'string'
    return f.optional ? `${base} | undefined` : base
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
  tableVisibility = (type: TableType): string => (type === 'cache' ? 'public: true' : 'public: false'),
  genTableContent = (name: string, type: TableType, fields: ParsedField[]): string => {
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
  },
  pickFields = (fields: ParsedField[]): string => {
    const lines: string[] = []
    for (const f of fields) lines.push(`${f.name}: input.${f.name}`)
    return lines.join(', ')
  },
  genReducerContent = ({
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
    const idType = type === 'singleton' ? 'userId: string' : 'id: number',
      parentLabel = type === 'child' ? `, parent: '${parent || name}'` : ''
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
    } } from '@noboil/spacetimedb/server'

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
  },
  genPageContent = (name: string, type: TableType): string => {
    const title = camelToTitle(name),
      component = title.replaceAll(/\s/gu, '')
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
      <button className='rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700' onClick={refresh} type='button'>
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
      <button className='rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700' onClick={refresh} type='button'>
        {loading ? 'Loading...' : 'Load ${title}'}
      </button>
    </main>
  )
}

export default ${component}Page
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
  isInteractive = () => typeof process.stdin.isTTY === 'boolean' && process.stdin.isTTY,
  promptInteractive = async (): Promise<AddFlags> => {
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
        ).trim(),
        fields: ParsedField[] = []
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
  },
  addSync = (flags: AddFlags) => {
    const fields = flags.fields.length > 0 ? flags.fields : defaultFields(flags.type),
      modulePath = join(process.cwd(), flags.moduleDir),
      appPath = join(process.cwd(), flags.appDir)

    console.log(`\n${bold(`Adding ${flags.type} table: ${flags.name}`)}\n`)

    let created = 0,
      skipped = 0

    const tableFile = join(modulePath, `tables/${flags.name}.ts`)
    if (
      writeIfNotExists(
        tableFile,
        genTableContent(flags.name, flags.type, fields),
        `${flags.moduleDir}/tables/${flags.name}.ts`
      )
    )
      created += 1
    else skipped += 1

    const reducerFile = join(modulePath, `reducers/${flags.name}.ts`)
    if (
      writeIfNotExists(
        reducerFile,
        genReducerContent({ fields, name: flags.name, parent: flags.parent, type: flags.type }),
        `${flags.moduleDir}/reducers/${flags.name}.ts`
      )
    )
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
    console.log(`  ${dim('1.')} Register table in your module schema()`)
    console.log(`  ${dim('2.')} Export reducer from your module entrypoint`)
    console.log(`  ${dim('3.')} Run spacetime publish and spacetime generate\n`)

    return { created, skipped }
  },
  add = async (args: string[] = []) => {
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

if (process.argv[1]?.endsWith('add.ts')) add(process.argv.slice(2))

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

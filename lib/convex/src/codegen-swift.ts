#!/usr/bin/env bun
/* eslint-disable complexity */
/* eslint-disable max-depth */
/* oxlint-disable eslint/max-statements, eslint/complexity */
import type { ZodType } from 'zod/v4'

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { swiftEnumCase } from './codegen-swift-utils'

interface FieldEntry {
  isOptional: boolean
  swiftType: string
}

interface SchemaModule {
  base?: Record<string, ZodType>
  children?: Record<string, { foreignKey?: string; schema: ZodType }>
  orgScoped?: Record<string, ZodType>
  owned?: Record<string, ZodType>
  singleton?: Record<string, ZodType>
}

interface ZodDef {
  element?: { _zod: { def: ZodDef } }
  entries?: Record<string, string>
  innerType?: { _zod: { def: ZodDef } }
  options?: { _zod: { def: ZodDef } }[]
  properties?: Record<string, { _zod: { def: ZodDef } }>
  shape?: Record<string, { _zod: { def: ZodDef } }>
  type: string
  values?: string[]
}

const parseArgs = (): { convex: string; mobileOutput: string; output: string; schema: string } => {
    const args = process.argv.slice(2),
      r = { convex: '', mobileOutput: '', output: '', schema: '' }
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i] ?? ''
      if (arg === '--schema' && args[i + 1]) {
        i += 1
        r.schema = args[i] ?? ''
      } else if (arg === '--convex' && args[i + 1]) {
        i += 1
        r.convex = args[i] ?? ''
      } else if (arg === '--output' && args[i + 1]) {
        i += 1
        r.output = args[i] ?? ''
      } else if (arg === '--mobile-output' && args[i + 1]) {
        i += 1
        r.mobileOutput = args[i] ?? ''
      }
    }
    if (!(r.schema && r.convex && r.output)) {
      process.stderr.write(
        'Usage: noboil-convex codegen-swift --schema <path> --convex <path> --output <path> [--mobile-output <path>]\n'
      )
      process.exit(1)
    }
    return {
      convex: resolve(r.convex),
      mobileOutput: r.mobileOutput ? resolve(r.mobileOutput) : '',
      output: resolve(r.output),
      schema: resolve(r.schema)
    }
  },
  { convex: CONVEX_DIR, mobileOutput: MOBILE_OUTPUT_PATH, output: OUTPUT_PATH, schema: SCHEMA_PATH } = parseArgs(),
  mod = (await import(SCHEMA_PATH)) as SchemaModule,
  owned = mod.owned ?? {},
  orgScoped = mod.orgScoped ?? {},
  base = mod.base ?? {},
  singleton = mod.singleton ?? {},
  children = (mod.children ?? {}) as Record<string, { foreignKey?: string; schema: ZodType }>,
  getDef = (schema: ZodType): ZodDef => (schema as unknown as { _zod: { def: ZodDef } })._zod.def,
  indent = (n: number) => '    '.repeat(n),
  capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1),
  SPLIT_RE = /[_-]/u,
  pascalCase = (s: string): string => {
    const parts = s.split(SPLIT_RE)
    let result = ''
    for (const p of parts) result += capitalize(p)
    return result
  },
  SWIFT_NAME_MAP: Record<string, string> = {
    Task: 'TaskItem'
  },
  safeSwiftName = (name: string): string => SWIFT_NAME_MAP[name] ?? name,
  enumName = (modelName: string, fieldName: string): string =>
    `${safeSwiftName(capitalize(modelName))}${capitalize(fieldName)}`,
  enumRegistry = new Map<string, string[]>(),
  pendingLines: string[][] = [],
  nestedEmitted = new Set<string>(),
  unionStructFieldsMap: Record<string, Map<string, { isOptional: boolean; swiftType: string }>> = {},
  unionDiscriminantEnums = new Set<string>(),
  childForeignKeys: Record<string, string> = {},
  detectFileKind = (def: ZodDef): 'file' | 'files' | null => {
    const { type } = def
    if (type === 'optional' || type === 'nullable') return detectFileKind(def.innerType?._zod.def ?? def)
    if (type === 'custom') return 'file'
    if (type === 'array') {
      const elDef = def.element?._zod.def
      if (elDef && detectFileKind(elDef) === 'file') return 'files'
    }
    return null
  },
  resolveSimpleType = (type: string): null | { isOptional: boolean; swiftType: string } => {
    if (type === 'string') return { isOptional: false, swiftType: 'String' }
    if (type === 'number' || type === 'float' || type === 'int') return { isOptional: false, swiftType: 'Double' }
    if (type === 'boolean') return { isOptional: false, swiftType: 'Bool' }
    if (type === 'custom') return { isOptional: false, swiftType: 'String' }
    return null
  },
  resolveType = (def: ZodDef, modelName: string, fieldName: string): { isOptional: boolean; swiftType: string } => {
    const { type } = def
    if (type === 'optional' || type === 'nullable') {
      const inner = resolveType(def.innerType?._zod.def ?? def, modelName, fieldName)
      return { isOptional: true, swiftType: inner.swiftType }
    }

    const simple = resolveSimpleType(type)
    if (simple) return simple

    if (type === 'enum') {
      const values = def.values ?? (def.entries ? Object.keys(def.entries) : []),
        name = enumName(modelName, fieldName)
      enumRegistry.set(name, values)
      return { isOptional: false, swiftType: name }
    }

    if (type === 'array') {
      const elDef = def.element?._zod.def ?? def
      if (elDef.type === 'custom') return { isOptional: false, swiftType: '[String]' }
      const singularField = fieldName.endsWith('s') ? fieldName.slice(0, -1) : fieldName,
        inner = resolveType(elDef, modelName, singularField)
      return { isOptional: false, swiftType: `[${inner.swiftType}${inner.isOptional ? '?' : ''}]` }
    }

    if (type === 'union' && def.options) {
      const name = enumName(modelName, fieldName)
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      collectUnionStruct(name, def.options)
      return { isOptional: false, swiftType: name }
    }

    if (type === 'object' && (def.shape ?? def.properties)) {
      const shape = def.shape ?? def.properties ?? {},
        name = `${capitalize(modelName)}${capitalize(fieldName)}`
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      collectNestedStruct(name, shape)
      return { isOptional: false, swiftType: name }
    }

    throw new Error(`codegen-swift: unsupported Zod type '${type}' for ${modelName}.${fieldName}`)
  },
  resolveFields = (block: string[], shape: Record<string, { _zod: { def: ZodDef } }>, ctx: string) => {
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      const resolved = resolveType(fieldSchema._zod.def, ctx, fieldName),
        swiftType = resolved.isOptional ? `${resolved.swiftType}?` : resolved.swiftType
      block.push(`${indent(1)}public let ${fieldName}: ${swiftType}`)
    }
  },
  collectNestedStruct = (name: string, shape: Record<string, { _zod: { def: ZodDef } }>) => {
    if (nestedEmitted.has(name)) return
    nestedEmitted.add(name)

    const block = [`public struct ${name}: Codable, Sendable {`]
    resolveFields(block, shape, name.toLowerCase())
    block.push('}', '')
    pendingLines.push(block)
  },
  extractEnumValues = (optDef: ZodDef): string[] => {
    const shape = optDef.shape ?? optDef.properties ?? {},
      result: string[] = []
    for (const [k, v] of Object.entries(shape))
      if (k === 'type') {
        const tDef = v._zod.def
        if (tDef.type === 'enum') {
          const vals = tDef.values ?? (tDef.entries ? Object.keys(tDef.entries) : [])
          for (const val of vals) result.push(val)
        }
      }

    return result
  },
  collectUnionTypeValues = (options: { _zod: { def: ZodDef } }[]): string[] => {
    const typeValues: string[] = []
    for (const opt of options) for (const val of extractEnumValues(opt._zod.def)) typeValues.push(val)

    return typeValues
  },
  collectUnionFieldTypes = (
    options: { _zod: { def: ZodDef } }[],
    name: string,
    typEnumName: string
  ): Map<string, { isOptional: boolean; swiftType: string }> => {
    const fieldTypes = new Map<string, { isOptional: boolean; swiftType: string }>([
      ['type', { isOptional: false, swiftType: typEnumName }]
    ])
    for (const opt of options) {
      const optDef = opt._zod.def,
        shape = optDef.shape ?? optDef.properties ?? {}
      for (const [k, v] of Object.entries(shape))
        if (k !== 'type' && !fieldTypes.has(k)) {
          const resolved = resolveType(v._zod.def, name, k)
          fieldTypes.set(k, { isOptional: true, swiftType: resolved.swiftType })
        }
    }
    return fieldTypes
  },
  registerUnionEnum = (typEnumName: string, typeValues: string[]) => {
    if (typeValues.length > 0) {
      enumRegistry.set(typEnumName, typeValues)
      unionDiscriminantEnums.add(typEnumName)
    }
  },
  emitUnionBlock = (fieldTypes: Map<string, { isOptional: boolean; swiftType: string }>, name: string) => {
    const block = [`public struct ${name}: Codable, Sendable {`],
      initParams: string[] = []
    for (const [fieldName, field] of fieldTypes) {
      const swiftType = field.isOptional ? `${field.swiftType}?` : field.swiftType
      block.push(`${indent(1)}public let ${fieldName}: ${swiftType}`)
      const defaultVal = field.isOptional ? ' = nil' : ''
      initParams.push(`${fieldName}: ${swiftType}${defaultVal}`)
    }
    block.push('')
    block.push(`${indent(1)}public init(`)
    block.push(`${indent(2)}${initParams.join(`,\n${indent(2)}`)}`)
    block.push(`${indent(1)}) {`)
    for (const [fieldName] of fieldTypes) block.push(`${indent(2)}self.${fieldName} = ${fieldName}`)
    block.push(`${indent(1)}}`)
    block.push('}', '')
    pendingLines.push(block)
  },
  collectUnionStruct = (name: string, options: { _zod: { def: ZodDef } }[]) => {
    if (nestedEmitted.has(name)) return
    nestedEmitted.add(name)

    const typeValues = collectUnionTypeValues(options),
      typEnumName = `${name}Type`
    registerUnionEnum(typEnumName, typeValues)
    const fieldTypes = collectUnionFieldTypes(options, name, typEnumName)
    unionStructFieldsMap[name] = fieldTypes
    emitUnionBlock(fieldTypes, name)
  },
  factoryFields: Record<string, Map<string, FieldEntry>> = {},
  userSchemaFields: Record<string, Map<string, FieldEntry>> = {},
  tableFactoryType: Record<string, 'base' | 'child' | 'orgScoped' | 'owned' | 'singleton'> = {},
  addAutoFileUrlFields = (fields: Map<string, FieldEntry>, shape: Record<string, { _zod: { def: ZodDef } }>) => {
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      const kind = detectFileKind(fieldSchema._zod.def)
      if (kind === 'files') fields.set(`${fieldName}Urls`, { isOptional: true, swiftType: '[String]' })
      else if (kind === 'file') fields.set(`${fieldName}Url`, { isOptional: true, swiftType: 'String' })
    }
  },
  resolveSchemaFields = (
    shape: Record<string, { _zod: { def: ZodDef } }>,
    tableName: string,
    extraFields: Map<string, FieldEntry>
  ): Map<string, FieldEntry> => {
    const fields = new Map<string, FieldEntry>(extraFields)
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      const resolved = resolveType(fieldSchema._zod.def, tableName, fieldName)
      fields.set(fieldName, resolved)
    }
    addAutoFileUrlFields(fields, shape)
    return fields
  },
  collectSchemas = (
    schemas: Record<string, ZodType>,
    extraFields: Map<string, FieldEntry>,
    factoryType: 'base' | 'orgScoped' | 'owned' | 'singleton'
  ) => {
    for (const [tableName, schema] of Object.entries(schemas)) {
      const def = getDef(schema),
        shape = def.shape ?? def.properties
      if (shape) {
        factoryFields[tableName] = resolveSchemaFields(shape, tableName, extraFields)
        tableFactoryType[tableName] = factoryType
        const uFields = new Map<string, FieldEntry>()
        for (const [fieldName, fieldSchema] of Object.entries(shape)) {
          const resolved = resolveType(fieldSchema._zod.def, tableName, fieldName)
          uFields.set(fieldName, resolved)
        }
        userSchemaFields[tableName] = uFields
      }
    }
  },
  extractBalancedBlock = (content: string, startIdx: number): null | string => {
    let depth = 0,
      i = startIdx
    while (i < content.length) {
      if (content[i] === '{') depth += 1
      else if (content[i] === '}') {
        depth -= 1
        if (depth === 0) return content.slice(startIdx + 1, i)
      }
      i += 1
    }
    return null
  },
  isContinuationLine = (rest: string): boolean =>
    rest.startsWith(',') || rest.startsWith('{') || rest.startsWith('//') || rest.startsWith('/*'),
  extractStatement = (content: string, startIdx: number): string => {
    let i = startIdx,
      depth = 0
    while (i < content.length) {
      const ch = content[i] ?? ''
      if (ch === '(' || ch === '{' || ch === '[') depth += 1
      else if (ch === ')' || ch === '}' || ch === ']') depth -= 1
      if (depth < 0) break
      if (depth === 0 && ch === '\n') {
        const rest = content.slice(i + 1).trimStart()
        if (!isContinuationLine(rest)) break
      }
      i += 1
    }
    return content.slice(startIdx, i)
  },
  ALPHA_RE = /[a-zA-Z_]/u,
  WORD_RE = /[\w]/u,
  AS_RE = /\s+as\s+/u,
  IDENT_RE = /^[a-zA-Z_]\w*$/u,
  parseName = (s: string, results: string[]) => {
    const colonIdx = s.indexOf(':')
    if (colonIdx === -1) {
      const name = (s.split(AS_RE)[0] ?? '').trim()
      if (IDENT_RE.test(name)) results.push(name)
    } else {
      const renamed = s.slice(colonIdx + 1).trim()
      if (IDENT_RE.test(renamed)) results.push(renamed)
    }
  },
  parseNameList = (text: string, results: string[]) => {
    for (const sub of text.split(',')) {
      const s = sub.trim()
      if (s) parseName(s, results)
    }
  },
  extractNames = (block: string): string[] => {
    const results: string[] = []
    let depth = 0,
      current = ''

    for (const ch of block)
      if (ch === '{') {
        if (depth === 0) current = ''
        else if (depth > 0) current += ch
        depth += 1
      } else if (ch === '}') {
        depth -= 1
        if (depth > 0) current += ch
        else if (depth === 0) {
          const trimmed = current.trim()
          if (trimmed) parseNameList(trimmed, results)
          current = ''
        }
      } else if (depth >= 1) current += ch
      else if (ch === ',' || ch === '\n') {
        const trimmed = current.trim()
        if (trimmed) parseName(trimmed, results)
        current = ''
      } else current += ch

    const trimmed = current.trim()
    if (trimmed) parseName(trimmed, results)
    return results
  },
  skipToNextBinding = (stmt: string, i: number): number => {
    let depth = 0,
      pos = i
    while (pos < stmt.length) {
      if (stmt[pos] === '(' || stmt[pos] === '{' || stmt[pos] === '[') depth += 1
      else if (stmt[pos] === ')' || stmt[pos] === '}' || stmt[pos] === ']') depth -= 1
      if (depth === 0 && stmt[pos] === ',') break
      pos += 1
    }
    return pos
  },
  readIdentifier = (stmt: string, start: number): { end: number; name: string } => {
    let i = start,
      name = ''
    while (i < stmt.length && WORD_RE.test(stmt[i] ?? '')) {
      name += stmt[i]
      i += 1
    }
    return { end: i, name }
  },
  extractAllBindings = (stmt: string): string[] => {
    const results: string[] = []
    let i = 0
    while (i < stmt.length)
      if (stmt[i] === '{') {
        const block = extractBalancedBlock(stmt, i)
        if (block) {
          const afterClose = i + block.length + 2,
            afterBlock = stmt.slice(afterClose).trimStart()

          if (afterBlock.startsWith('=')) for (const name of extractNames(block)) results.push(name)

          i = afterClose
        } else i += 1
      } else if (ALPHA_RE.test(stmt[i] ?? '')) {
        const id = readIdentifier(stmt, i)
        i = id.end
        const afterName = stmt.slice(i).trimStart()
        if (afterName.startsWith('=') && !afterName.startsWith('==')) {
          results.push(id.name)
          i = skipToNextBinding(stmt, i)
        }
      } else i += 1

    return results
  },
  extractSimpleNames = (block: string): string[] => {
    const results: string[] = [],
      parts = block.split(',')
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed) {
        const name = (trimmed.split(AS_RE)[0] ?? '').trim()
        if (IDENT_RE.test(name)) results.push(name)
      }
    }
    return results
  },
  parseExportConsts = (content: string, fns: Set<string>) => {
    const exportConsts = content.matchAll(/export\s+(?:const|let)\s/gu)
    for (const m of exportConsts) {
      const idx = m.index,
        stmtStart = idx + m[0].length,
        stmt = extractStatement(content, stmtStart)
      for (const name of extractAllBindings(stmt)) fns.add(name)
    }
  },
  parseTrailingExports = (content: string, fns: Set<string>) => {
    const trailingExport = content.matchAll(/export\s+\{(?<names>[^}]+)\}/gu)
    for (const tm of trailingExport) {
      const block = tm.groups?.names ?? ''
      for (const name of extractSimpleNames(block)) fns.add(name)
    }
  },
  getExportedFunctions = (filePath: string): string[] => {
    try {
      const content = readFileSync(filePath, 'utf8'),
        fns = new Set<string>()
      parseExportConsts(content, fns)
      parseTrailingExports(content, fns)
      return [...fns]
    } catch {
      return []
    }
  },
  SKIP_MODULES = new Set(['_generated', 'auth', 'auth.config', 'http', 'schema', 'testauth']),
  collectModules = (): Record<string, string[]> => {
    const modules: Record<string, string[]> = {},
      files = readdirSync(CONVEX_DIR)

    for (const file of files)
      if (file.endsWith('.ts') && !file.includes('.test.')) {
        const modName = file.replace('.ts', '')
        if (!SKIP_MODULES.has(modName)) {
          const fns = getExportedFunctions(join(CONVEX_DIR, file))
          if (fns.length > 0) modules[modName] = fns
        }
      }

    return modules
  },
  ownedExtra = new Map<string, FieldEntry>([
    ['_creationTime', { isOptional: false, swiftType: 'Double' }],
    ['_id', { isOptional: false, swiftType: 'String' }],
    ['author', { isOptional: true, swiftType: 'Author' }],
    ['updatedAt', { isOptional: false, swiftType: 'Double' }],
    ['userId', { isOptional: false, swiftType: 'String' }]
  ]),
  orgScopedExtra = new Map<string, FieldEntry>([
    ['_creationTime', { isOptional: false, swiftType: 'Double' }],
    ['_id', { isOptional: false, swiftType: 'String' }],
    ['orgId', { isOptional: false, swiftType: 'String' }],
    ['updatedAt', { isOptional: false, swiftType: 'Double' }],
    ['userId', { isOptional: false, swiftType: 'String' }]
  ]),
  baseExtra = new Map<string, FieldEntry>([
    ['_creationTime', { isOptional: true, swiftType: 'Double' }],
    ['_id', { isOptional: true, swiftType: 'String' }],
    ['cacheHit', { isOptional: true, swiftType: 'Bool' }]
  ]),
  singletonExtra = new Map<string, FieldEntry>([['_id', { isOptional: true, swiftType: 'String' }]]),
  childExtra = new Map<string, FieldEntry>([
    ['_creationTime', { isOptional: false, swiftType: 'Double' }],
    ['_id', { isOptional: false, swiftType: 'String' }],
    ['updatedAt', { isOptional: true, swiftType: 'Double' }],
    ['userId', { isOptional: true, swiftType: 'String' }]
  ])

collectSchemas(owned, ownedExtra, 'owned')
collectSchemas(orgScoped, orgScopedExtra, 'orgScoped')
collectSchemas(base, baseExtra, 'base')
collectSchemas(singleton, singletonExtra, 'singleton')

for (const [childName, childDef] of Object.entries(children)) {
  const def = getDef(childDef.schema),
    shape = def.shape ?? def.properties
  if (shape) {
    childForeignKeys[childName] = childDef.foreignKey ?? `${childName}Id`
    factoryFields[childName] = resolveSchemaFields(shape, childName, childExtra)
    tableFactoryType[childName] = 'child'
    const uFields = new Map<string, FieldEntry>()
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      const resolved = resolveType(fieldSchema._zod.def, childName, fieldName)
      uFields.set(fieldName, resolved)
    }
    userSchemaFields[childName] = uFields
  }
}

interface ParsedArg {
  isNullable: boolean
  isOptional: boolean
  name: string
  swiftType: string
}

interface ParsedCustomFn {
  args: ParsedArg[]
  callKind: 'action' | 'mutation' | 'query'
  kind: 'action' | 'm' | 'mutation' | 'pq' | 'q' | 'query'
  source: string
}

const splitTopLevel = (input: string, delimiter: string): string[] => {
    const parts: string[] = []
    let cur = '',
      depthBrace = 0,
      depthBracket = 0,
      depthParen = 0,
      quote: "'" | '"' | '' | '`' = '',
      escaped = false
    for (const ch of input)
      if (quote) {
        cur += ch
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === quote) quote = ''
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch
        cur += ch
      } else {
        if (ch === '{') depthBrace += 1
        else if (ch === '}') depthBrace -= 1
        else if (ch === '(') depthParen += 1
        else if (ch === ')') depthParen -= 1
        else if (ch === '[') depthBracket += 1
        else if (ch === ']') depthBracket -= 1
        if (ch === delimiter && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
          const t = cur.trim()
          if (t) parts.push(t)
          cur = ''
        } else cur += ch
      }

    const t = cur.trim()
    if (t) parts.push(t)
    return parts
  },
  unwrapCall = (expr: string, fnName: string): null | string => {
    const prefix = `${fnName}(`
    if (!expr.startsWith(prefix)) return null
    const body = extractBalancedBlock(expr, fnName.length)
    if (body === null) return null
    return body.trim()
  },
  parseValidatorExpr = (
    rawExpr: string,
    ctx: { filePath: string; fnName: string; paramName: string }
  ): { isNullable: boolean; isOptional: boolean; swiftType: string } => {
    let expr = rawExpr.trim(),
      isOptional = false,
      isNullable = false
    for (;;)
      if (expr.endsWith('.optional()')) {
        expr = expr.slice(0, -'.optional()'.length).trim()
        isOptional = true
      } else if (expr.endsWith('.nullable()')) {
        expr = expr.slice(0, -'.nullable()'.length).trim()
        isNullable = true
        isOptional = true
      } else break

    const convexOptional = unwrapCall(expr, 'v.optional'),
      convexNullable = unwrapCall(expr, 'v.nullable'),
      zodOptional = unwrapCall(expr, 'z.optional'),
      zodNullable = unwrapCall(expr, 'z.nullable')
    if (convexOptional !== null)
      return {
        ...parseValidatorExpr(convexOptional, ctx),
        isOptional: true
      }
    if (convexNullable !== null)
      return {
        ...parseValidatorExpr(convexNullable, ctx),
        isNullable: true,
        isOptional: true
      }
    if (zodOptional !== null)
      return {
        ...parseValidatorExpr(zodOptional, ctx),
        isOptional: true
      }
    if (zodNullable !== null)
      return {
        ...parseValidatorExpr(zodNullable, ctx),
        isNullable: true,
        isOptional: true
      }

    const convexArray = unwrapCall(expr, 'v.array'),
      zodArray = unwrapCall(expr, 'z.array')
    if (convexArray !== null) {
      const inner = parseValidatorExpr(convexArray, ctx)
      return { isNullable, isOptional, swiftType: `[${inner.swiftType}]` }
    }
    if (zodArray !== null) {
      const inner = parseValidatorExpr(zodArray, ctx)
      return { isNullable, isOptional, swiftType: `[${inner.swiftType}]` }
    }

    if (expr.startsWith('v.id(') || expr.startsWith('zid(')) return { isNullable, isOptional, swiftType: 'String' }
    if (expr.startsWith('v.string(') || expr.includes('z.string(')) return { isNullable, isOptional, swiftType: 'String' }
    if (
      expr.startsWith('v.number(') ||
      expr.startsWith('v.float64(') ||
      expr.startsWith('v.int64(') ||
      expr.includes('z.number(') ||
      expr.includes('z.int(') ||
      expr.includes('z.float(')
    )
      return { isNullable, isOptional, swiftType: 'Double' }
    if (expr.startsWith('v.boolean(') || expr.includes('z.boolean(')) return { isNullable, isOptional, swiftType: 'Bool' }
    if (expr.startsWith('v.literal(') || expr.startsWith('v.union(') || expr.includes('z.enum('))
      return { isNullable, isOptional, swiftType: 'String' }

    throw new Error(`codegen-swift: unsupported validator '${expr}' at ${ctx.filePath} ${ctx.fnName}.${ctx.paramName}`)
  },
  findTopLevelColon = (entry: string): number => {
    let depthBrace = 0,
      depthBracket = 0,
      depthParen = 0,
      quote: "'" | '"' | '' | '`' = '',
      escaped = false
    for (let i = 0; i < entry.length; i += 1) {
      const ch = entry[i] ?? ''
      if (quote) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === quote) quote = ''
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch
      else if (ch === '{') depthBrace += 1
      else if (ch === '}') depthBrace -= 1
      else if (ch === '(') depthParen += 1
      else if (ch === ')') depthParen -= 1
      else if (ch === '[') depthBracket += 1
      else if (ch === ']') depthBracket -= 1
      else if (ch === ':' && depthBrace === 0 && depthBracket === 0 && depthParen === 0) return i
    }
    return -1
  },
  parseSourceArgsBlock = (argsBlock: string, ctx: { filePath: string; fnName: string }): ParsedArg[] => {
    const parsed: ParsedArg[] = []
    for (const entry of splitTopLevel(argsBlock, ',')) {
      const idx = findTopLevelColon(entry)
      if (idx !== -1) {
        const name = entry.slice(0, idx).trim(),
          rawExpr = entry.slice(idx + 1).trim()
        if (name && rawExpr) {
          const resolved = parseValidatorExpr(rawExpr, { filePath: ctx.filePath, fnName: ctx.fnName, paramName: name })
          parsed.push({
            isNullable: resolved.isNullable,
            isOptional: resolved.isOptional,
            name,
            swiftType: resolved.swiftType
          })
        }
      }
    }
    return parsed
  },
  CUSTOM_FN_RE = /(?<name>\w+)\s*=\s*(?<kind>pq|q|m|action|mutation|query)\s*\(\s*\{/gu,
  UNIQUE_CHECK_RE = /(?<name>\w+)\s*=\s*uniqueCheck\s*\(/gu,
  ARGS_BLOCK_RE = /args\s*:\s*\{/u,
  CACHE_KEY_RE = /key\s*:\s*['"`](?<key>\w+)['"`]/u,
  extractParsedArgsFromBlock = (block: string, filePath: string, fnName: string): ParsedArg[] => {
    const argsStartMatch = ARGS_BLOCK_RE.exec(block)
    if (!argsStartMatch) return []
    const start = argsStartMatch.index + argsStartMatch[0].length - 1,
      argsBlock = extractBalancedBlock(block, start)
    if (argsBlock === null) return []
    return parseSourceArgsBlock(argsBlock, { filePath, fnName })
  },
  parseCustomFnsFromFile = (filePath: string): { cacheCrudKey: null | string; fns: Record<string, ParsedCustomFn> } => {
    const content = readFileSync(filePath, 'utf8'),
      parsed: Record<string, ParsedCustomFn> = {}
    let cacheCrudKey: null | string = null
    const cacheIdx = content.indexOf('cacheCrud(')
    if (cacheIdx !== -1) {
      const openIdx = content.indexOf('{', cacheIdx),
        block = openIdx === -1 ? null : extractBalancedBlock(content, openIdx)
      if (block) {
        const km = CACHE_KEY_RE.exec(block),
          key = km?.groups?.key
        if (key) cacheCrudKey = key
      }
    }
    for (const m of content.matchAll(CUSTOM_FN_RE)) {
      const { groups, index: matchIndex } = m,
        [full] = m,
        fnName = groups?.name,
        kind = groups?.kind as 'action' | 'm' | 'mutation' | 'pq' | 'q' | 'query' | undefined
      if (fnName && kind) {
        const openIdx = matchIndex + full.length - 1,
          block = extractBalancedBlock(content, openIdx)
        if (block) {
          const args = extractParsedArgsFromBlock(block, filePath, fnName),
            callKind =
              kind === 'pq' || kind === 'q' || kind === 'query' ? 'query' : kind === 'action' ? 'action' : 'mutation'
          parsed[fnName] = { args, callKind, kind, source: block }
        }
      }
    }
    for (const m of content.matchAll(UNIQUE_CHECK_RE)) {
      const [, fnNameRaw] = m,
        fnName = fnNameRaw ?? ''
      if (fnName && !parsed[fnName])
        parsed[fnName] = {
          args: [
            { isNullable: false, isOptional: false, name: 'value', swiftType: 'String' },
            { isNullable: false, isOptional: true, name: 'exclude', swiftType: 'String' }
          ],
          callKind: 'query',
          kind: 'query',
          source: ''
        }
    }
    return { cacheCrudKey, fns: parsed }
  },
  isFilterableDef = (def: ZodDef): boolean => {
    const { type } = def
    if (type === 'optional' || type === 'nullable') return isFilterableDef(def.innerType?._zod.def ?? def)
    return (
      type === 'string' || type === 'boolean' || type === 'number' || type === 'float' || type === 'int' || type === 'enum'
    )
  },
  whereFieldsMap: Record<string, Map<string, FieldEntry>> = {},
  extractFilterableFields = (
    shape: Record<string, ZodType>,
    uFields: Map<string, FieldEntry>
  ): Map<string, FieldEntry> => {
    const fields = new Map<string, FieldEntry>()
    for (const [fieldName, fieldSchema] of Object.entries(shape))
      if (isFilterableDef(fieldSchema._zod.def)) {
        const entry = uFields.get(fieldName)
        if (entry) fields.set(fieldName, { isOptional: true, swiftType: entry.swiftType })
      }
    return fields
  },
  collectWhereFieldsFromSchema = (schemas: Record<string, ZodType>) => {
    for (const [tableName, schema] of Object.entries(schemas)) {
      const def = getDef(schema),
        shape = def.shape ?? def.properties,
        uFields = shape ? userSchemaFields[tableName] : undefined
      if (shape && uFields) {
        const fields = extractFilterableFields(shape as Record<string, ZodType>, uFields)
        if (fields.size > 0) whereFieldsMap[tableName] = fields
      }
    }
  }

collectWhereFieldsFromSchema(owned)
collectWhereFieldsFromSchema(orgScoped)

const lines: string[] = [],
  emit = (s: string) => {
    lines.push(s)
  }

emit('// Auto-generated by @noboil/convex-codegen-swift. DO NOT EDIT.')
emit('// swiftlint:disable file_types_order file_length')
emit('import Foundation')
emit('')

for (const block of pendingLines) for (const line of block) emit(line)

for (const [name, values] of enumRegistry) {
  const sorted = [...values].toSorted()
  emit(`public enum ${name}: String, CaseIterable, Codable, Sendable {`)
  for (const v of sorted) emit(`${indent(1)}${swiftEnumCase(v)}`)

  emit('')
  emit(`${indent(1)}public var displayName: String { rawValue.capitalized }`)
  emit('}')
  emit('')
}

const emittedStructs = new Set<string>(),
  emitIdAccessor = (fields: Map<string, FieldEntry>) => {
    const idField = fields.get('_id')
    emit('')
    if (idField?.isOptional) emit(`${indent(1)}public var id: String { _id ?? "" }`)
    else emit(`${indent(1)}public var id: String { _id }`)
  }

for (const [tableName, fields] of Object.entries(factoryFields)) {
  const rawName = pascalCase(tableName),
    structName = safeSwiftName(rawName)
  if (!emittedStructs.has(structName)) {
    emittedStructs.add(structName)

    const hasId = fields.has('_id'),
      protocols = hasId ? 'Codable, Identifiable, Sendable' : 'Codable, Sendable'
    emit(`public struct ${structName}: ${protocols} {`)

    for (const [fieldName, field] of fields) {
      const swiftType = field.isOptional ? `${field.swiftType}?` : field.swiftType
      emit(`${indent(1)}public let ${fieldName}: ${swiftType}`)
    }

    if (hasId) emitIdAccessor(fields)

    emit('}')
    emit('')
  }
}

emit('public struct Author: Codable, Sendable {')
emit(`${indent(1)}public let name: String?`)
emit(`${indent(1)}public let email: String?`)
emit(`${indent(1)}public let imageUrl: String?`)
emit('}')
emit('')

emit('#if !SKIP')
emit('public struct PaginatedResult<T: Codable & Sendable>: Codable, Sendable {')
emit(`${indent(1)}public let page: [T]`)
emit(`${indent(1)}public let continueCursor: String`)
emit(`${indent(1)}public let isDone: Bool`)
emit('')
emit(`${indent(1)}public init(page: [T], continueCursor: String, isDone: Bool) {`)
emit(`${indent(2)}self.page = page`)
emit(`${indent(2)}self.continueCursor = continueCursor`)
emit(`${indent(2)}self.isDone = isDone`)
emit(`${indent(1)}}`)
emit('}')
emit('#else')
emit('public struct PaginatedResult<T: Codable & Sendable>: Sendable {')
emit(`${indent(1)}public let page: [T]`)
emit(`${indent(1)}public let continueCursor: String`)
emit(`${indent(1)}public let isDone: Bool`)
emit('')
emit(`${indent(1)}public init(page: [T], continueCursor: String, isDone: Bool) {`)
emit(`${indent(2)}self.page = page`)
emit(`${indent(2)}self.continueCursor = continueCursor`)
emit(`${indent(2)}self.isDone = isDone`)
emit(`${indent(1)}}`)
emit('}')
emit('#endif')
emit('')

emit('public struct Org: Codable, Identifiable, Sendable {')
emit(`${indent(1)}public let _id: String`)
emit(`${indent(1)}public let _creationTime: Double`)
emit(`${indent(1)}public let name: String`)
emit(`${indent(1)}public let slug: String`)
emit(`${indent(1)}public let userId: String`)
emit(`${indent(1)}public let updatedAt: Double`)
emit('')
emit(`${indent(1)}public var id: String { _id }`)
emit('}')
emit('')

emit('public struct OrgMember: Codable, Identifiable, Sendable {')
emit(`${indent(1)}public let _id: String`)
emit(`${indent(1)}public let orgId: String`)
emit(`${indent(1)}public let userId: String`)
emit(`${indent(1)}public let isAdmin: Bool`)
emit(`${indent(1)}public let updatedAt: Double`)
emit('')
emit(`${indent(1)}public var id: String { _id }`)
emit('}')
emit('')
emit('')

emit('public enum OrgRole: String, CaseIterable, Codable, Sendable {')
emit(`${indent(1)}case admin`)
emit(`${indent(1)}case member`)
emit(`${indent(1)}case owner`)
emit('')
emit(`${indent(1)}public var displayName: String { rawValue.capitalized }`)
emit(`${indent(1)}public var isOwner: Bool { self == .owner }`)
emit(`${indent(1)}public var isAdmin: Bool { self == .owner || self == .admin }`)
emit('}')
emit('')

emit('public enum JoinRequestStatus: String, CaseIterable, Codable, Sendable {')
emit(`${indent(1)}case approved`)
emit(`${indent(1)}case pending`)
emit(`${indent(1)}case rejected`)
emit('')
emit(`${indent(1)}public var displayName: String { rawValue.capitalized }`)
emit('}')
emit('')

emit('public struct OrgMemberEntry: Codable, Identifiable, Sendable {')
emit(`${indent(1)}public let memberId: String?`)
emit(`${indent(1)}public let userId: String`)
emit(`${indent(1)}public let role: OrgRole`)
emit(`${indent(1)}public let name: String?`)
emit(`${indent(1)}public let email: String?`)
emit(`${indent(1)}public let imageUrl: String?`)
emit('')
emit(`${indent(1)}public var id: String { userId }`)
emit('}')
emit('')

emit('public struct OrgWithRole: Codable, Identifiable, Sendable {')
emit(`${indent(1)}public let org: Org`)
emit(`${indent(1)}public let role: OrgRole`)
emit('')
emit(`${indent(1)}public var id: String { org._id }`)
emit('}')
emit('')

emit('public struct OrgMembership: Codable, Sendable {')
emit(`${indent(1)}public let _id: String?`)
emit(`${indent(1)}public let orgId: String?`)
emit(`${indent(1)}public let userId: String?`)
emit(`${indent(1)}public let isAdmin: Bool?`)
emit(`${indent(1)}public let role: OrgRole?`)
emit('}')
emit('')

emit('public struct OrgInvite: Codable, Identifiable, Sendable {')
emit(`${indent(1)}public let _id: String`)
emit(`${indent(1)}public let _creationTime: Double?`)
emit(`${indent(1)}public let orgId: String`)
emit(`${indent(1)}public let email: String`)
emit(`${indent(1)}public let expiresAt: Double`)
emit(`${indent(1)}public let token: String?`)
emit(`${indent(1)}public let isAdmin: Bool?`)
emit('')
emit(`${indent(1)}public var id: String { _id }`)
emit('}')
emit('')
emit('public struct OrgJoinRequest: Codable, Identifiable, Sendable {')
emit(`${indent(1)}public let _id: String`)
emit(`${indent(1)}public let _creationTime: Double?`)
emit(`${indent(1)}public let orgId: String`)
emit(`${indent(1)}public let userId: String`)
emit(`${indent(1)}public let status: JoinRequestStatus`)
emit(`${indent(1)}public let message: String?`)
emit('')
emit(`${indent(1)}public var id: String { _id }`)
emit('}')
emit('')

emit('public struct JoinRequestUser: Codable, Sendable {')
emit(`${indent(1)}public let name: String?`)
emit(`${indent(1)}public let image: String?`)
emit('}')
emit('')

emit('public struct JoinRequestEntry: Codable, Identifiable, Sendable {')
emit(`${indent(1)}public let request: OrgJoinRequest`)
emit(`${indent(1)}public let user: JoinRequestUser?`)
emit('')
emit(`${indent(1)}public var id: String { request._id }`)
emit('}')
emit('')

emit('public struct EditorEntry: Codable, Identifiable, Sendable {')
emit(`${indent(1)}public let userId: String`)
emit(`${indent(1)}public let name: String?`)
emit(`${indent(1)}public let email: String?`)
emit('')
emit(`${indent(1)}public var id: String { userId }`)
emit('}')
emit('')

emit('public struct SlugAvailability: Codable, Sendable {')
emit(`${indent(1)}public let available: Bool`)
emit('}')
emit('')

emit('public struct OrgGetOrCreateResult: Codable, Sendable {')
emit(`${indent(1)}public let created: Bool`)
emit(`${indent(1)}public let orgId: String`)
emit('}')
emit('')

const emitWhereStruct = (tableName: string, fields: Map<string, FieldEntry>, factoryType: string) => {
  const structName = `${pascalCase(tableName)}Where`
  emit(`public struct ${structName}: Sendable {`)
  for (const [fname, field] of fields) emit(`${indent(1)}public var ${fname}: ${field.swiftType}?`)
  if (factoryType === 'owned') emit(`${indent(1)}public var own: Bool?`)
  emit(`${indent(1)}public var or: [Self]?`)
  emit('')
  const initParams: string[] = []
  for (const [fname, field] of fields) initParams.push(`${fname}: ${field.swiftType}? = nil`)
  if (factoryType === 'owned') initParams.push('own: Bool? = nil')
  initParams.push('or: [Self]? = nil')
  emit(`${indent(1)}public init(`)
  emit(`${indent(2)}${initParams.join(`,\n${indent(2)}`)}`)
  emit(`${indent(1)}) {`)
  for (const [fname] of fields) emit(`${indent(2)}self.${fname} = ${fname}`)
  if (factoryType === 'owned') emit(`${indent(2)}self.own = own`)
  emit(`${indent(2)}self.or = or`)
  emit(`${indent(1)}}`)
  emit('')
  emit(`${indent(1)}public func toDict() -> [String: Any] {`)
  emit(`${indent(2)}var d = [String: Any]()`)
  for (const [fname, field] of fields) {
    const value = enumRegistry.has(field.swiftType) ? `${fname}.rawValue` : fname
    emit(`${indent(2)}if let ${fname} { d["${fname}"] = ${value} }`)
  }
  if (factoryType === 'owned') emit(`${indent(2)}if let own { d["own"] = own }`)
  emit(`${indent(2)}if let or {`)
  emit(`${indent(3)}var arr = [[String: Any]]()`)
  emit(`${indent(3)}for w in or { arr.append(w.toDict()) }`)
  emit(`${indent(3)}d["or"] = arr`)
  emit(`${indent(2)}}`)
  emit(`${indent(2)}return d`)
  emit(`${indent(1)}}`)
  emit('}')
  emit('')
}

for (const [tableName, fields] of Object.entries(whereFieldsMap)) {
  const factoryType = tableFactoryType[tableName] ?? ''
  emitWhereStruct(tableName, fields, factoryType)
}

const SAFE_ARG_TYPES = new Set(['[Bool]', '[Double]', '[String]', 'Bool', 'Double', 'String']),
  modules = collectModules(),
  isArgSafe = (field: FieldEntry): boolean => {
    const t = field.swiftType
    return SAFE_ARG_TYPES.has(t) || enumRegistry.has(t)
  },
  allFieldsArgSafe = (fields: Map<string, FieldEntry>): boolean => {
    for (const [, field] of fields) if (!isArgSafe(field)) return false
    return true
  },
  isEnumField = (swiftType: string): boolean => enumRegistry.has(swiftType),
  emitParam = (name: string, field: FieldEntry, forceOptional: boolean): string => {
    const t = forceOptional || field.isOptional ? `${field.swiftType}?` : field.swiftType,
      defaultVal = forceOptional || field.isOptional ? ' = nil' : ''
    return `${name}: ${t}${defaultVal}`
  },
  emitArgAssignment = (name: string, field: FieldEntry, forceOptional: boolean): null | string => {
    const isOpt = forceOptional || field.isOptional,
      value = isEnumField(field.swiftType) ? `${name}.rawValue` : name
    if (isOpt) return null
    return `"${name}": ${value}`
  },
  emitOptionalGuard = (name: string, field: FieldEntry): string => {
    const value = isEnumField(field.swiftType) ? `${name}.rawValue` : name
    return `${indent(2)}if let ${name} { args["${name}"] = ${value} }`
  },
  emitCreateWrapper = (modName: string, fields: Map<string, FieldEntry>, factoryType: string) => {
    const params: string[] = ['_ client: ConvexClientProtocol'],
      required: string[] = [],
      optional: string[] = []
    if (factoryType === 'orgScoped') params.push('orgId: String')
    for (const [fname, field] of fields) {
      params.push(emitParam(fname, field, false))
      const assign = emitArgAssignment(fname, field, false)
      if (assign) required.push(assign)
      else optional.push(fname)
    }
    if (factoryType === 'orgScoped') required.unshift('"orgId": orgId')
    emit(`${indent(1)}public static func create(`)
    emit(`${indent(2)}${params.join(`,\n${indent(2)}`)}`)
    emit(`${indent(1)}) async throws {`)
    const binding = optional.length > 0 ? 'var' : 'let'
    emit(`${indent(2)}${binding} args: [String: Any] = [${required.join(', ')}]`)
    for (const fname of optional) {
      const field = fields.get(fname)
      if (field) emit(emitOptionalGuard(fname, field))
    }
    emit(`${indent(2)}try await client.mutation("${modName}:create", args: args)`)
    emit(`${indent(1)}}`)
  },
  emitUpdateWrapper = (modName: string, fields: Map<string, FieldEntry>, factoryType: string) => {
    const params: string[] = ['_ client: ConvexClientProtocol'],
      required: string[] = ['"id": id'],
      optional: string[] = []
    if (factoryType === 'orgScoped') {
      params.push('orgId: String')
      required.push('"orgId": orgId')
    }
    params.push('id: String')
    for (const [fname, field] of fields) {
      params.push(emitParam(fname, field, true))
      optional.push(fname)
    }
    params.push('expectedUpdatedAt: Double? = nil')
    optional.push('expectedUpdatedAt')
    emit(`${indent(1)}public static func update(`)
    emit(`${indent(2)}${params.join(`,\n${indent(2)}`)}`)
    emit(`${indent(1)}) async throws {`)
    emit(`${indent(2)}var args: [String: Any] = [${required.join(', ')}]`)
    for (const fname of optional) {
      const field =
        fname === 'expectedUpdatedAt' ? ({ isOptional: true, swiftType: 'Double' } as FieldEntry) : fields.get(fname)
      if (field) emit(emitOptionalGuard(fname, field))
    }
    emit(`${indent(2)}try await client.mutation("${modName}:update", args: args)`)
    emit(`${indent(1)}}`)
  },
  emitRmWrapper = (modName: string, factoryType: string) => {
    const params = ['_ client: ConvexClientProtocol'],
      argParts = ['"id": id']
    if (factoryType === 'orgScoped') {
      params.push('orgId: String')
      argParts.push('"orgId": orgId')
    }
    params.push('id: String')
    emit(`${indent(1)}public static func rm(${params.join(', ')}) async throws {`)
    emit(`${indent(2)}try await client.mutation("${modName}:rm", args: [${argParts.join(', ')}])`)
    emit(`${indent(1)}}`)
    const bulkParams = ['_ client: ConvexClientProtocol'],
      bulkArgParts = ['"ids": ids']
    if (factoryType === 'orgScoped') {
      bulkParams.push('orgId: String')
      bulkArgParts.push('"orgId": orgId')
    }
    bulkParams.push('ids: [String]')
    emit(`${indent(1)}public static func rm(${bulkParams.join(', ')}) async throws {`)
    emit(`${indent(2)}try await client.mutation("${modName}:rm", args: [${bulkArgParts.join(', ')}])`)
    emit(`${indent(1)}}`)
  },
  emitReadWrapper = (modName: string, structName: string, factoryType: string) => {
    const params = ['_ client: ConvexClientProtocol'],
      argParts = ['"id": id']
    if (factoryType === 'orgScoped') {
      params.push('orgId: String')
      argParts.push('"orgId": orgId')
    }
    params.push('id: String')
    emit(`${indent(1)}public static func read(${params.join(', ')}) async throws -> ${structName} {`)
    emit(`${indent(2)}try await client.query("${modName}:read", args: [${argParts.join(', ')}])`)
    emit(`${indent(1)}}`)
  },
  emitUpsertWrapper = (modName: string, fields: Map<string, FieldEntry>) => {
    const params: string[] = ['_ client: ConvexClientProtocol'],
      optional: string[] = []
    for (const [fname, field] of fields) {
      params.push(emitParam(fname, field, true))
      optional.push(fname)
    }
    emit(`${indent(1)}public static func upsert(`)
    emit(`${indent(2)}${params.join(`,\n${indent(2)}`)}`)
    emit(`${indent(1)}) async throws {`)
    emit(`${indent(2)}var args: [String: Any] = [:]`)
    for (const fname of optional) {
      const field = fields.get(fname)
      if (field) emit(emitOptionalGuard(fname, field))
    }
    emit(`${indent(2)}try await client.mutation("${modName}:upsert", args: args)`)
    emit(`${indent(1)}}`)
  },
  emitGetWrapper = (modName: string, structName: string) => {
    emit(`${indent(1)}public static func get(_ client: ConvexClientProtocol) async throws -> ${structName}? {`)
    emit(`${indent(2)}try await client.query("${modName}:get", args: [:])`)
    emit(`${indent(1)}}`)
  },
  emitChildCreateWrapper = (modName: string, fields: Map<string, FieldEntry>) => {
    const params: string[] = ['_ client: ConvexClientProtocol'],
      required: string[] = [],
      optional: string[] = []
    for (const [fname, field] of fields) {
      params.push(emitParam(fname, field, false))
      const assign = emitArgAssignment(fname, field, false)
      if (assign) required.push(assign)
      else optional.push(fname)
    }
    const binding = optional.length > 0 ? 'var' : 'let'
    emit(`${indent(1)}public static func create(`)
    emit(`${indent(2)}${params.join(`,\n${indent(2)}`)}`)
    emit(`${indent(1)}) async throws {`)
    emit(`${indent(2)}${binding} args: [String: Any] = [${required.join(', ')}]`)
    for (const fname of optional) {
      const field = fields.get(fname)
      if (field) emit(emitOptionalGuard(fname, field))
    }
    emit(`${indent(2)}try await client.mutation("${modName}:create", args: args)`)
    emit(`${indent(1)}}`)
  },
  emitListArgs = (_modName: string, tableName: string, factoryType: string) => {
    const whereStructName = `${pascalCase(tableName)}Where`,
      params: string[] = []
    if (factoryType === 'orgScoped') params.push('orgId: String')
    params.push('numItems: Int = 50')
    params.push('cursor: String? = nil')
    params.push(`\`where\`: ${whereStructName}? = nil`)
    emit(`${indent(1)}public static func listArgs(`)
    emit(`${indent(2)}${params.join(`,\n${indent(2)}`)}`)
    emit(`${indent(1)}) -> [String: Any] {`)
    emit(`${indent(2)}var paginationOpts: [String: Any] = ["numItems": numItems]`)
    emit(`${indent(2)}if let cursor { paginationOpts["cursor"] = cursor } else { paginationOpts["cursor"] = NSNull() }`)
    if (factoryType === 'orgScoped')
      emit(`${indent(2)}var args: [String: Any] = ["orgId": orgId, "paginationOpts": paginationOpts]`)
    else emit(`${indent(2)}var args: [String: Any] = ["paginationOpts": paginationOpts]`)
    emit(`${indent(2)}if let w = \`where\` { args["where"] = w.toDict() }`)
    emit(`${indent(2)}return args`)
    emit(`${indent(1)}}`)
  },
  // eslint-disable-next-line @typescript-eslint/max-params
  emitListWrapper = (modName: string, tableName: string, structName: string, factoryType: string) => {
    const whereStructName = `${pascalCase(tableName)}Where`,
      params: string[] = ['_ client: ConvexClientProtocol'],
      callParams: string[] = []
    if (factoryType === 'orgScoped') {
      params.push('orgId: String')
      callParams.push('orgId: orgId')
    }
    params.push('numItems: Int = 50')
    params.push('cursor: String? = nil')
    params.push(`\`where\`: ${whereStructName}? = nil`)
    callParams.push('numItems: numItems')
    callParams.push('cursor: cursor')
    callParams.push('where: `where`')
    emit(`${indent(1)}public static func list(`)
    emit(`${indent(2)}${params.join(`,\n${indent(2)}`)}`)
    emit(`${indent(1)}) async throws -> PaginatedResult<${structName}> {`)
    emit(`${indent(2)}try await client.query("${modName}:list", args: listArgs(${callParams.join(', ')}))`)
    emit(`${indent(1)}}`)
  },
  emitSearchWrapper = (modName: string, structName: string, factoryType: string) => {
    const params: string[] = ['_ client: ConvexClientProtocol']
    if (factoryType === 'orgScoped') params.push('orgId: String')
    params.push('query searchQuery: String')
    params.push('numItems: Int = 20')
    params.push('cursor: String? = nil')
    emit(`${indent(1)}public static func search(`)
    emit(`${indent(2)}${params.join(`,\n${indent(2)}`)}`)
    emit(`${indent(1)}) async throws -> PaginatedResult<${structName}> {`)
    emit(`${indent(2)}var paginationOpts: [String: Any] = ["numItems": numItems]`)
    emit(`${indent(2)}if let cursor { paginationOpts["cursor"] = cursor } else { paginationOpts["cursor"] = NSNull() }`)
    if (factoryType === 'orgScoped')
      emit(
        `${indent(2)}return try await client.query("${modName}:search", args: ["orgId": orgId, "paginationOpts": paginationOpts, "query": searchQuery])`
      )
    else
      emit(
        `${indent(2)}return try await client.query("${modName}:search", args: ["paginationOpts": paginationOpts, "query": searchQuery])`
      )
    emit(`${indent(1)}}`)
  },
  emitRestoreWrapper = (modName: string, factoryType: string) => {
    const params = ['_ client: ConvexClientProtocol'],
      argParts = ['"id": id']
    if (factoryType === 'orgScoped') {
      params.push('orgId: String')
      argParts.push('"orgId": orgId')
    }
    params.push('id: String')
    emit(`${indent(1)}public static func restore(${params.join(', ')}) async throws {`)
    emit(`${indent(2)}try await client.mutation("${modName}:restore", args: [${argParts.join(', ')}])`)
    emit(`${indent(1)}}`)
  },
  // eslint-disable-next-line @typescript-eslint/max-params
  emitCustomDesktopFn = (e: (s: string) => void, modName: string, fn: CustomFnDescriptor, fnName: string): void => {
    const params = [
        '_ client: ConvexClientProtocol',
        ...fn.params.map(p => `${p.name}: ${p.type}${p.default === undefined ? '' : ` = ${p.default}`}`)
      ],
      sig = fn.returnType ? `-> ${fn.returnType} ` : ''
    e(`${indent(1)}public static func ${fnName}(${params.join(', ')}) async throws ${sig}{`)
    if (fn.optionalArgs && fn.optionalArgs.length > 0) {
      const requiredParts = fn.args
        .filter(a => !fn.optionalArgs?.includes(a.argName))
        .map(a => `"${a.argName}": ${a.value}`)
      e(`${indent(2)}var args: [String: Any] = [${requiredParts.join(', ')}]`)
      for (const optName of fn.optionalArgs) {
        const arg = fn.args.find(a => a.argName === optName)
        if (arg)
          if (fn.nullableArgs?.includes(optName))
            e(
              `${indent(2)}if let ${optName} { args["${arg.argName}"] = ${arg.value} } else { args["${arg.argName}"] = NSNull() }`
            )
          else e(`${indent(2)}if let ${optName} { args["${arg.argName}"] = ${arg.value} }`)
      }
      const callKind = fn.callKind ?? 'mutation'
      if (fn.voidDummy)
        e(`${indent(2)}let _: [String: String] = try await client.${callKind}("${modName}:${fnName}", args: args)`)
      else e(`${indent(2)}try await client.${callKind}("${modName}:${fnName}", args: args)`)
    } else if (fn.nestedData) {
      const nd = fn.nestedData,
        dataInit = nd.required.length > 0 ? nd.required.map(r => `"${r}": ${r}`).join(', ') : ':'
      e(`${indent(2)}var data: [String: Any] = [${dataInit}]`)
      for (const opt of nd.optional) e(`${indent(2)}if let ${opt} { data["${opt}"] = ${opt} }`)
      const outerArgs = nd.outerArgs ? `${nd.outerArgs.map(a => `"${a}": ${a}`).join(', ')}, ` : ''
      e(
        `${indent(2)}try await client.${fn.callKind ?? 'mutation'}("${modName}:${fnName}", args: [${outerArgs}"data": data])`
      )
    } else if (fn.structArraySerialization) {
      const s = fn.structArraySerialization
      e(`${indent(2)}var partDicts = [[String: Any]]()`)
      e(`${indent(2)}for p in ${s.paramName} {`)
      e(`${indent(3)}var d: [String: Any] = [${s.requiredFields.map(f => `"${f.name}": ${f.value}`).join(', ')}]`)
      for (const f of s.optionalFields)
        e(`${indent(3)}if let ${f.localBinding} = p.${f.name} { d["${f.name}"] = ${f.localBinding} }`)
      e(`${indent(3)}partDicts.append(d)`)
      e(`${indent(2)}}`)
      const extraArgs = s.extraArgs.map(a => `"${a.argName}": ${a.value}`).join(', ')
      e(
        `${indent(2)}try await client.${fn.callKind ?? 'mutation'}("${modName}:${fnName}", args: [${extraArgs}, "${s.paramName}": partDicts])`
      )
    } else {
      const argStr = fn.args.length === 0 ? '[:]' : `[${fn.args.map(a => `"${a.argName}": ${a.value}`).join(', ')}]`,
        callKind = fn.callKind ?? 'mutation'
      if (fn.voidDummy)
        e(`${indent(2)}let _: [String: String] = try await client.${callKind}("${modName}:${fnName}", args: ${argStr})`)
      else if (fn.returnType) e(`${indent(2)}try await client.${callKind}("${modName}:${fnName}", args: ${argStr})`)
      else e(`${indent(2)}try await client.${callKind}("${modName}:${fnName}", args: ${argStr})`)
    }
    e(`${indent(1)}}`)
  },
  // eslint-disable-next-line @typescript-eslint/max-params
  emitCustomMobileFn = (e: (s: string) => void, modName: string, fn: CustomFnDescriptor, fnName: string): void => {
    const params = fn.params.map(p => `${p.name}: ${p.type}${p.default === undefined ? '' : ` = ${p.default}`}`),
      sig = fn.returnType ? `-> ${fn.returnType} ` : ''
    e(`${indent(1)}public static func ${fnName}(${params.join(', ')}) async throws ${sig}{`)
    if (fn.optionalArgs && fn.optionalArgs.length > 0) {
      const requiredParts = fn.args
        .filter(a => !fn.optionalArgs?.includes(a.argName))
        .map(a => `"${a.argName}": ${a.value}`)
      e(`${indent(2)}var args: [String: Any] = [${requiredParts.join(', ')}]`)
      for (const optName of fn.optionalArgs) {
        const arg = fn.args.find(a => a.argName === optName)
        if (arg)
          if (fn.nullableArgs?.includes(optName))
            e(
              `${indent(2)}if let ${optName} { args["${arg.argName}"] = ${arg.value} } else { args["${arg.argName}"] = NSNull() }`
            )
          else e(`${indent(2)}if let ${optName} { args["${arg.argName}"] = ${arg.value} }`)
      }
      e(`${indent(2)}try await ConvexService.shared.mutate("${modName}:${fnName}", args: args)`)
    } else if (fn.nestedData) {
      const nd = fn.nestedData,
        mobileDataInit = nd.required.length > 0 ? nd.required.map(r => `"${r}": ${r}`).join(', ') : ':'
      e(`${indent(2)}var data: [String: Any] = [${mobileDataInit}]`)
      for (const opt of nd.optional) e(`${indent(2)}if let ${opt} { data["${opt}"] = ${opt} }`)
      const outerArgs = nd.outerArgs ? `${nd.outerArgs.map(a => `"${a}": ${a}`).join(', ')}, ` : ''
      e(`${indent(2)}try await ConvexService.shared.mutate("${modName}:${fnName}", args: [${outerArgs}"data": data])`)
    } else if (fn.structArraySerialization) {
      const s = fn.structArraySerialization
      e(`${indent(2)}var partDicts = [[String: Any]]()`)
      e(`${indent(2)}for p in ${s.paramName} {`)
      e(`${indent(3)}var d: [String: Any] = [${s.requiredFields.map(f => `"${f.name}": ${f.value}`).join(', ')}]`)
      for (const f of s.optionalFields)
        e(`${indent(3)}if let ${f.localBinding} = p.${f.name} { d["${f.name}"] = ${f.localBinding} }`)
      e(`${indent(3)}partDicts.append(d)`)
      e(`${indent(2)}}`)
      const extraArgs = s.extraArgs.map(a => `"${a.argName}": ${a.value}`).join(', ')
      e(
        `${indent(2)}try await ConvexService.shared.mutate("${modName}:${fnName}", args: [${extraArgs}, "${s.paramName}": partDicts])`
      )
    } else if (fn.mobileAction) {
      const ma = fn.mobileAction,
        argStr = fn.args.length === 0 ? '[:]' : `[${fn.args.map(a => `"${a.argName}": ${a.value}`).join(', ')}]`
      e(`${indent(2)}#if !SKIP`)
      if (ma.voidAction)
        e(
          `${indent(2)}let _: [String: String] = try await ConvexService.shared.action("${modName}:${fnName}", args: ${argStr}, returning: [String: String].self)`
        )
      else
        e(
          `${indent(2)}return try await ConvexService.shared.action("${modName}:${fnName}", args: ${argStr}, returning: ${ma.notSkipReturnType}.self)`
        )

      e(`${indent(2)}#else`)
      if (ma.voidAction)
        e(`${indent(2)}try await ConvexService.shared.action(name: "${modName}:${fnName}", args: ${argStr})`)
      else if (ma.skipArrayCast)
        e(
          `${indent(2)}return Array(try await ConvexService.shared.${ma.skipMethod}(name: "${modName}:${fnName}", args: ${argStr}))`
        )
      else
        e(
          `${indent(2)}return try await ConvexService.shared.${ma.skipMethod}(name: "${modName}:${fnName}", args: ${argStr})`
        )

      e(`${indent(2)}#endif`)
    } else {
      const argStr = fn.args.length === 0 ? '[:]' : `[${fn.args.map(a => `"${a.argName}": ${a.value}`).join(', ')}]`,
        callKind = fn.callKind ?? 'mutate'
      if (fn.returnType && (callKind === 'query' || callKind === 'mutation')) {
        const rt = fn.returnType,
          isArray = rt.startsWith('[') && rt.endsWith(']'),
          isNullable = rt.endsWith('?'),
          baseType = isArray ? rt.slice(1, -1) : isNullable ? rt.slice(0, -1) : rt,
          skipMethod =
            callKind === 'mutation' && rt === 'String'
              ? 'mutateReturningString'
              : isArray
                ? `${callKind}${baseType}s`
                : isNullable
                  ? `${callKind}Nullable${baseType}`
                  : `${callKind}${baseType}`,
          skipArrayCast = isArray
        e(`${indent(2)}#if !SKIP`)
        e(`${indent(2)}try await ConvexService.shared.${callKind}("${modName}:${fnName}", args: ${argStr})`)
        e(`${indent(2)}#else`)
        if (skipArrayCast)
          e(
            `${indent(2)}try await Array(ConvexService.shared.${skipMethod}(name: "${modName}:${fnName}", args: ${argStr}))`
          )
        else e(`${indent(2)}try await ConvexService.shared.${skipMethod}(name: "${modName}:${fnName}", args: ${argStr})`)
        e(`${indent(2)}#endif`)
      } else if (fn.voidDummy)
        e(
          `${indent(2)}let _: [String: String] = try await ConvexService.shared.${callKind}("${modName}:${fnName}", args: ${argStr})`
        )
      else e(`${indent(2)}try await ConvexService.shared.${callKind}("${modName}:${fnName}", args: ${argStr})`)
    }
    e(`${indent(1)}}`)
  },
  emitMobileSubscription = (e: (s: string) => void, sub: MobileSubscriptionDescriptor): void => {
    e(`${indent(1)}@preconcurrency`)
    e(`${indent(1)}public static func ${sub.methodName}(`)
    for (const p of sub.params) e(`${indent(2)}${p.name}: ${p.type},`)
    e(`${indent(2)}onUpdate: @escaping @Sendable @MainActor (${sub.resultType}) -> Void,`)
    if (sub.onNull) {
      e(`${indent(2)}onError: @escaping @Sendable @MainActor (Error) -> Void = { _ in _ = () },`)
      e(`${indent(2)}onNull: @escaping @Sendable @MainActor () -> Void = { () }`)
    } else e(`${indent(2)}onError: @escaping @Sendable @MainActor (Error) -> Void = { _ in _ = () }`)

    e(`${indent(1)}) -> String {`)
    const argStr = sub.args.length === 0 ? '[:]' : `[${sub.args.map(a => `"${a.argName}": ${a.value}`).join(', ')}]`
    if (sub.usesListArgs)
      if (sub.listArgsParam) e(`${indent(2)}let args = listArgs(${sub.listArgsParam})`)
      else e(`${indent(2)}let args = listArgs(where: filterWhere)`)

    e(`${indent(2)}#if !SKIP`)
    const notSkipArgs = sub.usesListArgs ? 'args' : argStr
    e(
      `${indent(2)}return ConvexService.shared.subscribe(to: ${sub.apiRef}, args: ${notSkipArgs}, type: ${sub.notSkipType}.self, onUpdate: onUpdate, onError: onError)`
    )
    e(`${indent(2)}#else`)
    const skipArgs = sub.usesListArgs ? 'args' : argStr,
      skipUpdate = sub.skipArrayCast ? '{ r in onUpdate(Array(r)) }' : '{ r in onUpdate(r) }',
      skipError = '{ e in onError(e) }'
    if (sub.onNull)
      e(
        `${indent(2)}return ConvexService.shared.${sub.skipMethod}(to: ${sub.apiRef}, args: ${skipArgs}, onUpdate: ${skipUpdate}, onError: ${skipError}, onNull: { onNull() })`
      )
    else if (sub.skipNullableViaOnUpdate)
      e(
        `${indent(2)}return ConvexService.shared.${sub.skipMethod}(to: ${sub.apiRef}, args: ${skipArgs}, onUpdate: ${skipUpdate}, onError: ${skipError}, onNull: { onUpdate(nil) })`
      )
    else
      e(
        `${indent(2)}return ConvexService.shared.${sub.skipMethod}(to: ${sub.apiRef}, args: ${skipArgs}, onUpdate: ${skipUpdate}, onError: ${skipError})`
      )

    e(`${indent(2)}#endif`)
    e(`${indent(1)}}`)
  }

interface CustomFnArg {
  argName: string
  value: string
}

interface CustomFnDescriptor {
  args: CustomFnArg[]
  callKind?: string
  mobileAction?: MobileActionDescriptor
  nestedData?: NestedDataDescriptor
  nullableArgs?: string[]
  optionalArgs?: string[]
  params: CustomFnParam[]
  returnType?: string
  structArraySerialization?: StructArrayDescriptor
  voidDummy?: boolean
}

interface CustomFnParam {
  default?: string
  name: string
  type: string
}

interface MobileActionDescriptor {
  notSkipReturnType: string
  skipArrayCast?: boolean
  skipMethod: string
  voidAction?: boolean
}

interface MobileSubscriptionDescriptor {
  apiRef: string
  args: CustomFnArg[]
  listArgsParam?: string
  methodName: string
  notSkipType: string
  onNull?: boolean
  params: CustomFnParam[]
  resultType: string
  skipArrayCast?: boolean
  skipMethod: string
  skipNullableViaOnUpdate?: boolean
  usesListArgs?: boolean
}

interface NestedDataDescriptor {
  optional: string[]
  outerArgs?: string[]
  required: string[]
}

interface StructArrayDescriptor {
  extraArgs: CustomFnArg[]
  optionalFields: StructArrayField[]
  paramName: string
  requiredFields: StructArrayField[]
}

interface StructArrayField {
  localBinding?: string
  name: string
  value: string
}

const parsedSourceFns: Record<string, Record<string, ParsedCustomFn>> = {},
  parsedCacheKeys: Record<string, null | string> = {}
for (const modName of Object.keys(modules)) {
  const filePath = join(CONVEX_DIR, `${modName}.ts`)
  try {
    const parsed = parseCustomFnsFromFile(filePath)
    parsedSourceFns[modName] = parsed.fns
    parsedCacheKeys[modName] = parsed.cacheCrudKey
  } catch {
    parsedSourceFns[modName] = {}
    parsedCacheKeys[modName] = null
  }
}

const inferParsedReturnType = (parsed: ParsedCustomFn, fnName: string, tableName: string): string | undefined => {
    const { callKind, source } = parsed,
      structName = safeSwiftName(pascalCase(tableName))
    if (callKind === 'query') {
      if (source.includes('.paginate(')) return `PaginatedResult<${structName}>`
      if (source.includes('.collect(') || source.includes('.filter(')) return `[${structName}]`
      if (source.includes('.unique(') || source.includes('.first(') || source.includes('db.get(')) return `${structName}?`
      if (fnName.startsWith('list') || fnName.startsWith('by')) return `[${structName}]`
      if (fnName.startsWith('get') || fnName.startsWith('read')) return `${structName}?`
      if (fnName.startsWith('is')) return 'Bool'
    }
    if (callKind === 'action' && source.includes('.map(')) return `[${structName}]`
  },
  argOrderWeight = (name: string): number => {
    if (name === 'orgId') return 0
    if (name === 'id') return 1
    return 2
  },
  buildDescriptorFromParsed = (
    ctx: { isMobile: boolean; tableName: string },
    fnName: string,
    parsed: ParsedCustomFn
  ): CustomFnDescriptor | null => {
    const { isMobile, tableName } = ctx,
      requiredParams: CustomFnParam[] = [],
      optionalParams: CustomFnParam[] = [],
      requiredArgs: CustomFnArg[] = [],
      optionalArgsData: CustomFnArg[] = [],
      optionalArgs: string[] = [],
      nullableArgs: string[] = []
    for (const a of parsed.args) {
      const type = a.isOptional ? `${a.swiftType}?` : a.swiftType
      if (a.isOptional) {
        optionalParams.push({ default: 'nil', name: a.name, type })
        optionalArgsData.push({ argName: a.name, value: a.name })
        optionalArgs.push(a.name)
      } else {
        requiredParams.push({ name: a.name, type })
        requiredArgs.push({ argName: a.name, value: a.name })
      }
      if (a.isNullable) nullableArgs.push(a.name)
    }
    const orderedRequiredParams = [...requiredParams].toSorted((a, b) => argOrderWeight(a.name) - argOrderWeight(b.name)),
      orderedRequiredArgs = [...requiredArgs].toSorted((a, b) => argOrderWeight(a.argName) - argOrderWeight(b.argName)),
      params = [...orderedRequiredParams, ...optionalParams],
      args = [...orderedRequiredArgs, ...optionalArgsData],
      inferred = inferParsedReturnType(parsed, fnName, tableName)
    if (parsed.callKind === 'query' && !inferred) return null
    const desc: CustomFnDescriptor = {
      args,
      callKind: isMobile && parsed.callKind === 'mutation' ? 'mutate' : parsed.callKind,
      nullableArgs: nullableArgs.length > 0 ? nullableArgs : undefined,
      optionalArgs: optionalArgs.length > 0 ? optionalArgs : undefined,
      params,
      returnType: inferred
    }
    if (parsed.callKind === 'action')
      if (inferred) {
        const isArray = inferred.startsWith('[')
        desc.mobileAction = {
          notSkipReturnType: inferred,
          skipArrayCast: isArray,
          skipMethod: isArray ? `action${inferred.slice(1, -1)}s` : `action${inferred}`
        }
      } else {
        desc.voidDummy = true
        desc.mobileAction = { notSkipReturnType: '[String: String]', skipMethod: 'action', voidAction: true }
      }

    return desc
  },
  buildDesktopAclDescriptors = (tableName: string): Record<string, CustomFnDescriptor> => {
    const tableIdName = `${tableName}Id`
    return {
      addEditor: {
        args: [
          { argName: 'editorId', value: 'editorId' },
          { argName: 'orgId', value: 'orgId' },
          { argName: tableIdName, value: tableIdName }
        ],
        callKind: 'mutation',
        params: [
          { name: 'orgId', type: 'String' },
          { name: 'editorId', type: 'String' },
          { name: tableIdName, type: 'String' }
        ]
      },
      editors: {
        args: [
          { argName: 'orgId', value: 'orgId' },
          { argName: tableIdName, value: tableIdName }
        ],
        callKind: 'query',
        params: [
          { name: 'orgId', type: 'String' },
          { name: tableIdName, type: 'String' }
        ],
        returnType: '[EditorEntry]'
      },
      removeEditor: {
        args: [
          { argName: 'editorId', value: 'editorId' },
          { argName: 'orgId', value: 'orgId' },
          { argName: tableIdName, value: tableIdName }
        ],
        callKind: 'mutation',
        params: [
          { name: 'orgId', type: 'String' },
          { name: 'editorId', type: 'String' },
          { name: tableIdName, type: 'String' }
        ]
      },
      setEditors: {
        args: [
          { argName: 'editorIds', value: 'editorIds' },
          { argName: 'orgId', value: 'orgId' },
          { argName: tableIdName, value: tableIdName }
        ],
        callKind: 'mutation',
        params: [
          { name: 'orgId', type: 'String' },
          { name: 'editorIds', type: '[String]' },
          { name: tableIdName, type: 'String' }
        ]
      }
    }
  },
  buildMobileAclDescriptors = (tableName: string): Record<string, CustomFnDescriptor> => {
    const tableIdName = `${tableName}Id`
    return {
      addEditor: {
        args: [
          { argName: 'editorId', value: 'editorId' },
          { argName: 'orgId', value: 'orgId' },
          { argName: tableIdName, value: tableIdName }
        ],
        params: [
          { name: 'orgId', type: 'String' },
          { name: 'editorId', type: 'String' },
          { name: tableIdName, type: 'String' }
        ]
      },
      removeEditor: {
        args: [
          { argName: 'editorId', value: 'editorId' },
          { argName: 'orgId', value: 'orgId' },
          { argName: tableIdName, value: tableIdName }
        ],
        params: [
          { name: 'orgId', type: 'String' },
          { name: 'editorId', type: 'String' },
          { name: tableIdName, type: 'String' }
        ]
      }
    }
  },
  DESKTOP_ORG_FN_DESCRIPTORS: Record<string, CustomFnDescriptor> = {
    acceptInvite: {
      args: [{ argName: 'token', value: 'token' }],
      callKind: 'mutation',
      params: [{ name: 'token', type: 'String' }]
    },
    approveJoinRequest: {
      args: [
        { argName: 'requestId', value: 'requestId' },
        { argName: 'isAdmin', value: 'isAdmin' }
      ],
      callKind: 'mutation',
      optionalArgs: ['isAdmin'],
      params: [
        { name: 'requestId', type: 'String' },
        { default: 'nil', name: 'isAdmin', type: 'Bool?' }
      ]
    },
    cancelJoinRequest: {
      args: [{ argName: 'requestId', value: 'requestId' }],
      callKind: 'mutation',
      params: [{ name: 'requestId', type: 'String' }]
    },
    create: {
      args: [],
      callKind: 'mutation',
      nestedData: {
        optional: ['avatarId'],
        required: ['name', 'slug']
      },
      params: [
        { name: 'name', type: 'String' },
        { name: 'slug', type: 'String' },
        { default: 'nil', name: 'avatarId', type: 'String?' }
      ]
    },
    get: {
      args: [{ argName: 'orgId', value: 'orgId' }],
      callKind: 'query',
      params: [{ name: 'orgId', type: 'String' }],
      returnType: 'Org'
    },
    getBySlug: {
      args: [{ argName: 'slug', value: 'slug' }],
      callKind: 'query',
      params: [{ name: 'slug', type: 'String' }],
      returnType: 'Org?'
    },
    getPublic: {
      args: [{ argName: 'slug', value: 'slug' }],
      callKind: 'query',
      params: [{ name: 'slug', type: 'String' }],
      returnType: 'Org?'
    },
    invite: {
      args: [
        { argName: 'email', value: 'email' },
        { argName: 'isAdmin', value: 'isAdmin' },
        { argName: 'orgId', value: 'orgId' }
      ],
      callKind: 'mutation',
      params: [
        { name: 'email', type: 'String' },
        { name: 'isAdmin', type: 'Bool' },
        { name: 'orgId', type: 'String' }
      ]
    },
    isSlugAvailable: {
      args: [{ argName: 'slug', value: 'slug' }],
      callKind: 'query',
      params: [{ name: 'slug', type: 'String' }],
      returnType: 'SlugAvailability'
    },
    leave: {
      args: [{ argName: 'orgId', value: 'orgId' }],
      callKind: 'mutation',
      params: [{ name: 'orgId', type: 'String' }]
    },
    members: {
      args: [{ argName: 'orgId', value: 'orgId' }],
      callKind: 'query',
      params: [{ name: 'orgId', type: 'String' }],
      returnType: '[OrgMemberEntry]'
    },
    membership: {
      args: [{ argName: 'orgId', value: 'orgId' }],
      callKind: 'query',
      params: [{ name: 'orgId', type: 'String' }],
      returnType: 'OrgMembership'
    },
    myJoinRequest: {
      args: [{ argName: 'orgId', value: 'orgId' }],
      callKind: 'query',
      params: [{ name: 'orgId', type: 'String' }],
      returnType: 'OrgJoinRequest?'
    },
    myOrgs: {
      args: [],
      callKind: 'query',
      params: [],
      returnType: '[OrgWithRole]'
    },
    pendingInvites: {
      args: [{ argName: 'orgId', value: 'orgId' }],
      callKind: 'query',
      params: [{ name: 'orgId', type: 'String' }],
      returnType: '[OrgInvite]'
    },
    pendingJoinRequests: {
      args: [{ argName: 'orgId', value: 'orgId' }],
      callKind: 'query',
      params: [{ name: 'orgId', type: 'String' }],
      returnType: '[JoinRequestEntry]'
    },
    rejectJoinRequest: {
      args: [{ argName: 'requestId', value: 'requestId' }],
      callKind: 'mutation',
      params: [{ name: 'requestId', type: 'String' }]
    },
    remove: {
      args: [{ argName: 'orgId', value: 'orgId' }],
      callKind: 'mutation',
      params: [{ name: 'orgId', type: 'String' }]
    },
    removeMember: {
      args: [{ argName: 'memberId', value: 'memberId' }],
      callKind: 'mutation',
      params: [{ name: 'memberId', type: 'String' }]
    },
    requestJoin: {
      args: [
        { argName: 'orgId', value: 'orgId' },
        { argName: 'message', value: 'message' }
      ],
      callKind: 'mutation',
      optionalArgs: ['message'],
      params: [
        { name: 'orgId', type: 'String' },
        { default: 'nil', name: 'message', type: 'String?' }
      ]
    },
    revokeInvite: {
      args: [{ argName: 'inviteId', value: 'inviteId' }],
      callKind: 'mutation',
      params: [{ name: 'inviteId', type: 'String' }]
    },
    setAdmin: {
      args: [
        { argName: 'isAdmin', value: 'isAdmin' },
        { argName: 'memberId', value: 'memberId' }
      ],
      callKind: 'mutation',
      params: [
        { name: 'isAdmin', type: 'Bool' },
        { name: 'memberId', type: 'String' }
      ]
    },
    transferOwnership: {
      args: [
        { argName: 'newOwnerId', value: 'newOwnerId' },
        { argName: 'orgId', value: 'orgId' }
      ],
      callKind: 'mutation',
      params: [
        { name: 'newOwnerId', type: 'String' },
        { name: 'orgId', type: 'String' }
      ]
    },
    update: {
      args: [],
      callKind: 'mutation',
      nestedData: {
        optional: ['name', 'slug', 'avatarId'],
        outerArgs: ['orgId'],
        required: []
      },
      params: [
        { name: 'orgId', type: 'String' },
        { default: 'nil', name: 'name', type: 'String?' },
        { default: 'nil', name: 'slug', type: 'String?' },
        { default: 'nil', name: 'avatarId', type: 'String?' }
      ]
    }
  },
  MOBILE_ORG_FN_DESCRIPTORS: Record<string, CustomFnDescriptor> = DESKTOP_ORG_FN_DESCRIPTORS,
  isOrgModule = (fnSet: Set<string>): boolean => fnSet.has('myOrgs') && fnSet.has('membership') && fnSet.has('members'),
  hasAcl = (fnSet: Set<string>): boolean =>
    fnSet.has('addEditor') && fnSet.has('removeEditor') && fnSet.has('setEditors') && fnSet.has('editors'),
  hasMobileAcl = (fnSet: Set<string>): boolean => fnSet.has('addEditor') && fnSet.has('removeEditor'),
  mergeOrgSchemaCreateUpdate = (
    descs: Record<string, CustomFnDescriptor>,
    tableName: string
  ): Record<string, CustomFnDescriptor> => {
    const schemaFields = userSchemaFields[tableName]
    if (!schemaFields) return descs
    const reserved = new Set(['_creationTime', '_id', 'updatedAt', 'userId'])
    let result = { ...descs }
    const createDesc = result.create
    if (createDesc?.nestedData) {
      const required = new Set(createDesc.nestedData.required),
        optional = [...createDesc.nestedData.optional],
        params = [...createDesc.params]
      for (const [name, field] of schemaFields)
        if (!(reserved.has(name) || required.has(name))) {
          if (!optional.includes(name)) optional.push(name)
          if (!params.some(p => p.name === name)) params.push({ default: 'nil', name, type: `${field.swiftType}?` })
        }
      result = {
        ...result,
        create: {
          ...createDesc,
          nestedData: { ...createDesc.nestedData, optional },
          params
        }
      }
    }
    const updateDesc = result.update
    if (updateDesc?.nestedData) {
      const optional = [...updateDesc.nestedData.optional],
        params = [...updateDesc.params]
      for (const [name, field] of schemaFields)
        if (!reserved.has(name)) {
          if (!optional.includes(name)) optional.push(name)
          if (!params.some(p => p.name === name)) params.push({ default: 'nil', name, type: `${field.swiftType}?` })
        }
      result = {
        ...result,
        update: {
          ...updateDesc,
          nestedData: { ...updateDesc.nestedData, optional },
          params
        }
      }
    }
    return result
  },
  snakeToCamel = (s: string): string => s.replaceAll(/_(?<ch>[a-z])/gu, (_, c: string) => c.toUpperCase()),
  maybeAddPubReadAutoDescriptor = (ctx: {
    auto: Record<string, CustomFnDescriptor>
    factoryType: 'base' | 'child' | 'orgScoped' | 'owned' | 'singleton' | undefined
    fnSet: Set<string>
    structName: string
  }): void => {
    const { auto, factoryType, fnSet, structName } = ctx
    if (factoryType === 'owned' && fnSet.has('pubRead'))
      auto.pubRead = {
        args: [{ argName: 'id', value: 'id' }],
        callKind: 'query',
        params: [{ name: 'id', type: 'String' }],
        returnType: structName
      }
  },
  maybeAddChildReadAutoDescriptors = (ctx: {
    auto: Record<string, CustomFnDescriptor>
    fnSet: Set<string>
    structName: string
    tableName: string
  }): void => {
    const { auto, fnSet, structName, tableName } = ctx,
      fk = childForeignKeys[tableName] ?? `${tableName}Id`
    if (fnSet.has('list'))
      auto.list = {
        args: [{ argName: fk, value: fk }],
        callKind: 'query',
        params: [{ name: fk, type: 'String' }],
        returnType: `[${structName}]`
      }
    if (fnSet.has('pubList'))
      auto.pubList = {
        args: [{ argName: fk, value: fk }],
        callKind: 'query',
        params: [{ name: fk, type: 'String' }],
        returnType: `[${structName}]`
      }
    if (fnSet.has('pubGet'))
      auto.pubGet = {
        args: [{ argName: 'id', value: 'id' }],
        callKind: 'query',
        params: [{ name: 'id', type: 'String' }],
        returnType: structName
      }
  },
  findUnionArrayField = (fields: Map<string, FieldEntry>): null | { unionFieldName: string; unionStructName: string } => {
    for (const [fieldName, field] of fields)
      if (field.swiftType.startsWith('[') && field.swiftType.endsWith(']')) {
        const inner = field.swiftType.slice(1, -1)
        if (unionStructFieldsMap[inner]) return { unionFieldName: fieldName, unionStructName: inner }
      }
    return null
  },
  buildStructArrayCreateDescriptor = (
    fields: Map<string, FieldEntry>,
    unionFieldName: string,
    unionStructName: string
  ): CustomFnDescriptor | null => {
    const buildParamsAndExtraArgs = (): { extraArgs: CustomFnArg[]; params: CustomFnParam[] } => {
        const builtParams: CustomFnParam[] = [],
          builtExtraArgs: CustomFnArg[] = []
        for (const [fieldName, field] of fields) {
          const t = field.isOptional ? `${field.swiftType}?` : field.swiftType
          builtParams.push({ default: field.isOptional ? 'nil' : undefined, name: fieldName, type: t })
          if (fieldName !== unionFieldName) {
            const value = enumRegistry.has(field.swiftType) ? `${fieldName}.rawValue` : fieldName
            builtExtraArgs.push({ argName: fieldName, value })
          }
        }
        return { extraArgs: builtExtraArgs, params: builtParams }
      },
      buildUnionFields = (): null | { optionalFields: StructArrayField[]; requiredFields: StructArrayField[] } => {
        const unionFields = unionStructFieldsMap[unionStructName]
        if (!unionFields) return null
        const requiredFields: StructArrayField[] = [],
          optionalFields: StructArrayField[] = []
        for (const [fieldName, field] of unionFields)
          if (field.isOptional) optionalFields.push({ localBinding: fieldName, name: fieldName, value: fieldName })
          else {
            const value = enumRegistry.has(field.swiftType) ? `p.${fieldName}.rawValue` : `p.${fieldName}`
            requiredFields.push({ name: fieldName, value })
          }
        return { optionalFields, requiredFields }
      },
      { extraArgs, params } = buildParamsAndExtraArgs(),
      unionData = buildUnionFields()
    if (!unionData) return null
    return {
      args: [],
      callKind: 'mutation',
      params,
      structArraySerialization: {
        extraArgs,
        optionalFields: unionData.optionalFields,
        paramName: unionFieldName,
        requiredFields: unionData.requiredFields
      }
    }
  },
  maybeAddChildCreateStructArrayDescriptor = (
    auto: Record<string, CustomFnDescriptor>,
    fnSet: Set<string>,
    fields: Map<string, FieldEntry> | undefined
  ): void => {
    if (!(fields && fnSet.has('create') && !allFieldsArgSafe(fields))) return
    const unionMeta = findUnionArrayField(fields)
    if (!unionMeta) return
    const createDesc = buildStructArrayCreateDescriptor(fields, unionMeta.unionFieldName, unionMeta.unionStructName)
    if (createDesc) auto.create = createDesc
  },
  maybeAddCacheLoadDescriptor = (ctx: {
    auto: Record<string, CustomFnDescriptor>
    fields: Map<string, FieldEntry> | undefined
    fnSet: Set<string>
    isMobile: boolean
    modName: string
    structName: string
  }): void => {
    const { auto, fields, fnSet, isMobile, modName, structName } = ctx
    if (!fields) return
    const cacheKey = parsedCacheKeys[modName]
    if (!(cacheKey && fnSet.has('load'))) return
    const keyField = fields.get(cacheKey),
      keyType = keyField?.swiftType ?? 'String',
      paramName = cacheKey.includes('_') ? snakeToCamel(cacheKey) : cacheKey,
      mobileAction = isMobile
        ? {
            notSkipReturnType: structName,
            skipMethod: `action${structName}`
          }
        : undefined
    auto.load = {
      args: [{ argName: cacheKey, value: paramName }],
      callKind: 'action',
      mobileAction,
      params: [{ name: paramName, type: keyType }],
      returnType: structName
    }
  },
  maybeAddFileUploadDescriptor = (auto: Record<string, CustomFnDescriptor>, modName: string, fnSet: Set<string>): void => {
    if (modName === 'file' && fnSet.has('upload'))
      auto.upload = {
        args: [],
        callKind: 'mutation',
        params: [],
        returnType: 'String'
      }
  },
  mergeParsedFnDescriptors = (ctx: {
    auto: Record<string, CustomFnDescriptor>
    fnSet: Set<string>
    isMobile: boolean
    modName: string
    tableName: string
  }): Record<string, CustomFnDescriptor> => {
    const { auto, fnSet, isMobile, modName, tableName } = ctx,
      merged: Record<string, CustomFnDescriptor> = { ...auto },
      parsedFns = parsedSourceFns[modName] ?? {}
    for (const [fnName, parsed] of Object.entries(parsedFns))
      if (fnSet.has(fnName) && !merged[fnName]) {
        const desc = buildDescriptorFromParsed({ isMobile, tableName }, fnName, parsed)
        if (desc) merged[fnName] = desc
      }
    return merged
  },
  sortDescriptors = (descs: Record<string, CustomFnDescriptor>): Record<string, CustomFnDescriptor> => {
    const sorted: Record<string, CustomFnDescriptor> = {}
    for (const k of Object.keys(descs).toSorted()) {
      const desc = descs[k]
      if (desc) sorted[k] = desc
    }
    return sorted
  },
  buildBaseAutoDescriptors = (ctx: {
    fnSet: Set<string>
    isMobile: boolean
    modName: string
    tableName: string
  }): Record<string, CustomFnDescriptor> => {
    const { fnSet, isMobile, modName, tableName } = ctx,
      factoryType = tableFactoryType[tableName],
      structName = safeSwiftName(pascalCase(tableName)),
      fields = userSchemaFields[tableName],
      auto: Record<string, CustomFnDescriptor> = {}
    maybeAddPubReadAutoDescriptor({ auto, factoryType, fnSet, structName })
    if (factoryType === 'child') {
      maybeAddChildReadAutoDescriptors({ auto, fnSet, structName, tableName })
      maybeAddChildCreateStructArrayDescriptor(auto, fnSet, fields)
    }
    if (factoryType === 'base') maybeAddCacheLoadDescriptor({ auto, fields, fnSet, isMobile, modName, structName })
    maybeAddFileUploadDescriptor(auto, modName, fnSet)
    return auto
  },
  buildDesktopDescriptors = (
    modName: string,
    tableName: string,
    fnSet: Set<string>
  ): Record<string, CustomFnDescriptor> => {
    const orgOrAclAuto = isOrgModule(fnSet)
        ? mergeOrgSchemaCreateUpdate(DESKTOP_ORG_FN_DESCRIPTORS, tableName)
        : hasAcl(fnSet)
          ? buildDesktopAclDescriptors(tableName)
          : {},
      auto = { ...orgOrAclAuto, ...buildBaseAutoDescriptors({ fnSet, isMobile: false, modName, tableName }) },
      merged = mergeParsedFnDescriptors({ auto, fnSet, isMobile: false, modName, tableName })
    return sortDescriptors(merged)
  },
  buildMobileDescriptors = (
    modName: string,
    tableName: string,
    fnSet: Set<string>
  ): Record<string, CustomFnDescriptor> => {
    const orgOrAclAuto = isOrgModule(fnSet)
        ? mergeOrgSchemaCreateUpdate(MOBILE_ORG_FN_DESCRIPTORS, tableName)
        : hasMobileAcl(fnSet)
          ? buildMobileAclDescriptors(tableName)
          : {},
      auto = { ...orgOrAclAuto, ...buildBaseAutoDescriptors({ fnSet, isMobile: true, modName, tableName }) },
      merged = mergeParsedFnDescriptors({ auto, fnSet, isMobile: true, modName, tableName })
    return sortDescriptors(merged)
  },
  subscriptionSkipMethod = (fnName: string, resultType: string): string => {
    if (fnName === 'myOrgs') return 'subscribeOrgsWithRole'
    if (fnName === 'members') return 'subscribeOrgMembers'
    if (fnName === 'pendingInvites') return 'subscribeInvites'
    if (fnName === 'pendingJoinRequests') return 'subscribeJoinRequests'
    if (fnName === 'editors') return 'subscribeEditors'
    if (resultType.startsWith('PaginatedResult<') && resultType.endsWith('>')) {
      const inner = resultType.slice('PaginatedResult<'.length, -1)
      return `subscribePaginated${inner}s`
    }
    if (resultType.startsWith('[') && resultType.endsWith(']')) {
      const inner = resultType.slice(1, -1)
      return `subscribe${inner}s`
    }
    if (resultType.endsWith('?')) {
      const inner = resultType.slice(0, -1)
      return `subscribeNullable${inner}`
    }
    return `subscribe${resultType}`
  },
  hasSubscriptionMethod = (subs: MobileSubscriptionDescriptor[], methodName: string): boolean => {
    for (const s of subs) if (s.methodName === methodName) return true
    return false
  },
  hasSubscriptionApiRef = (subs: MobileSubscriptionDescriptor[], apiRef: string): boolean => {
    for (const s of subs) if (s.apiRef === apiRef) return true
    return false
  },
  addOwnedListSubscription = (ctx: {
    factoryType: 'orgScoped' | 'owned'
    structName: string
    subs: MobileSubscriptionDescriptor[]
    tableName: string
  }): void => {
    const { factoryType, structName, subs, tableName } = ctx,
      params: CustomFnParam[] = []
    if (factoryType === 'orgScoped') params.push({ name: 'orgId', type: 'String' })
    if (whereFieldsMap[tableName])
      params.push({ default: 'nil', name: 'where filterWhere', type: `${pascalCase(tableName)}Where?` })
    subs.push({
      apiRef: 'list',
      args: [],
      listArgsParam: factoryType === 'orgScoped' ? 'orgId: orgId, where: filterWhere' : undefined,
      methodName: 'subscribeList',
      notSkipType: `PaginatedResult<${structName}>`,
      params,
      resultType: `PaginatedResult<${structName}>`,
      skipMethod: `subscribePaginated${structName}s`,
      usesListArgs: true
    })
  },
  addOwnedReadSubscription = (
    subs: MobileSubscriptionDescriptor[],
    structName: string,
    factoryType: 'orgScoped' | 'owned'
  ): void => {
    const args: CustomFnArg[] = [{ argName: 'id', value: 'id' }],
      params: CustomFnParam[] = [{ name: 'id', type: 'String' }]
    if (factoryType === 'orgScoped') {
      args.push({ argName: 'orgId', value: 'orgId' })
      params.unshift({ name: 'orgId', type: 'String' })
    }
    subs.push({
      apiRef: 'read',
      args,
      methodName: 'subscribeRead',
      notSkipType: structName,
      params,
      resultType: structName,
      skipMethod: `subscribe${structName}`
    })
  },
  addOwnedEditorsSubscription = (subs: MobileSubscriptionDescriptor[], tableName: string): void => {
    const tableIdName = `${tableName}Id`
    subs.push({
      apiRef: 'editors',
      args: [
        { argName: 'orgId', value: 'orgId' },
        { argName: tableIdName, value: tableIdName }
      ],
      methodName: 'subscribeEditors',
      notSkipType: '[EditorEntry]',
      params: [
        { name: 'orgId', type: 'String' },
        { name: tableIdName, type: 'String' }
      ],
      resultType: '[EditorEntry]',
      skipArrayCast: true,
      skipMethod: 'subscribeEditors'
    })
  },
  addOwnedOrOrgScopedSubscriptions = (ctx: {
    factoryType: 'orgScoped' | 'owned'
    fnSet: Set<string>
    structName: string
    subs: MobileSubscriptionDescriptor[]
    tableName: string
  }): void => {
    const { factoryType, fnSet, structName, subs, tableName } = ctx
    if (fnSet.has('list')) addOwnedListSubscription({ factoryType, structName, subs, tableName })
    if (fnSet.has('read')) addOwnedReadSubscription(subs, structName, factoryType)
    if (fnSet.has('editors')) addOwnedEditorsSubscription(subs, tableName)
  },
  addSingletonSubscriptions = (subs: MobileSubscriptionDescriptor[], structName: string, fnSet: Set<string>): void => {
    if (fnSet.has('get'))
      subs.push({
        apiRef: 'get',
        args: [],
        methodName: 'subscribeGet',
        notSkipType: structName,
        onNull: true,
        params: [],
        resultType: structName,
        skipMethod: `subscribe${structName}`
      })
  },
  addChildSubscriptions = (ctx: {
    fnSet: Set<string>
    structName: string
    subs: MobileSubscriptionDescriptor[]
    tableName: string
  }): void => {
    const { fnSet, structName, subs, tableName } = ctx,
      fk = childForeignKeys[tableName] ?? `${tableName}Id`
    if (fnSet.has('list'))
      subs.push({
        apiRef: 'list',
        args: [{ argName: fk, value: fk }],
        methodName: 'subscribeList',
        notSkipType: `[${structName}]`,
        params: [{ name: fk, type: 'String' }],
        resultType: `[${structName}]`,
        skipArrayCast: true,
        skipMethod: `subscribe${structName}s`
      })
    if (fnSet.has('pubList'))
      subs.push({
        apiRef: 'pubList',
        args: [{ argName: fk, value: fk }],
        methodName: 'subscribePubList',
        notSkipType: `[${structName}]`,
        params: [{ name: fk, type: 'String' }],
        resultType: `[${structName}]`,
        skipArrayCast: true,
        skipMethod: `subscribe${structName}s`
      })
  },
  ORG_SUBSCRIPTIONS: MobileSubscriptionDescriptor[] = [
    {
      apiRef: 'myOrgs',
      args: [],
      methodName: 'subscribeMyOrgs',
      notSkipType: '[OrgWithRole]',
      params: [],
      resultType: '[OrgWithRole]',
      skipArrayCast: true,
      skipMethod: 'subscribeOrgsWithRole'
    },
    {
      apiRef: 'members',
      args: [{ argName: 'orgId', value: 'orgId' }],
      methodName: 'subscribeMembers',
      notSkipType: '[OrgMemberEntry]',
      params: [{ name: 'orgId', type: 'String' }],
      resultType: '[OrgMemberEntry]',
      skipArrayCast: true,
      skipMethod: 'subscribeOrgMembers'
    },
    {
      apiRef: 'pendingInvites',
      args: [{ argName: 'orgId', value: 'orgId' }],
      methodName: 'subscribePendingInvites',
      notSkipType: '[OrgInvite]',
      params: [{ name: 'orgId', type: 'String' }],
      resultType: '[OrgInvite]',
      skipArrayCast: true,
      skipMethod: 'subscribeInvites'
    },
    {
      apiRef: 'pendingJoinRequests',
      args: [{ argName: 'orgId', value: 'orgId' }],
      methodName: 'subscribePendingJoinRequests',
      notSkipType: '[JoinRequestEntry]',
      params: [{ name: 'orgId', type: 'String' }],
      resultType: '[JoinRequestEntry]',
      skipArrayCast: true,
      skipMethod: 'subscribeJoinRequests'
    }
  ],
  addOrgSubscriptions = (subs: MobileSubscriptionDescriptor[], fnSet: Set<string>): void => {
    for (const s of ORG_SUBSCRIPTIONS) if (fnSet.has(s.apiRef) && !hasSubscriptionMethod(subs, s.methodName)) subs.push(s)
  },
  addParsedQuerySubscriptions = (ctx: {
    fnSet: Set<string>
    modName: string
    subs: MobileSubscriptionDescriptor[]
    tableName: string
  }): void => {
    const { fnSet, modName, subs, tableName } = ctx,
      parsedDescriptors = buildMobileDescriptors(modName, tableName, fnSet)
    for (const [fnName, desc] of Object.entries(parsedDescriptors))
      if (
        fnSet.has(fnName) &&
        (desc.callKind === 'query' || desc.callKind === undefined) &&
        desc.returnType &&
        !hasSubscriptionApiRef(subs, fnName)
      ) {
        const isArray = desc.returnType.startsWith('['),
          isPaginated = desc.returnType.startsWith('PaginatedResult<'),
          isNullable = desc.returnType.endsWith('?')
        subs.push({
          apiRef: fnName,
          args: desc.args,
          methodName: `subscribe${capitalize(fnName)}`,
          notSkipType: desc.returnType,
          params: desc.params,
          resultType: desc.returnType,
          skipArrayCast: isArray,
          skipMethod: subscriptionSkipMethod(fnName, desc.returnType),
          skipNullableViaOnUpdate: isNullable || undefined,
          usesListArgs: isPaginated
        })
      }
  },
  buildMobileSubscriptions = (ctx: {
    factoryType: 'base' | 'child' | 'orgScoped' | 'owned' | 'singleton' | undefined
    fnSet: Set<string>
    modName: string
    tableName: string
  }): MobileSubscriptionDescriptor[] => {
    const { factoryType, fnSet, modName, tableName } = ctx,
      subs: MobileSubscriptionDescriptor[] = [],
      structName = safeSwiftName(pascalCase(tableName))
    if (factoryType === 'owned' || factoryType === 'orgScoped')
      addOwnedOrOrgScopedSubscriptions({ factoryType, fnSet, structName, subs, tableName })
    if (factoryType === 'singleton') addSingletonSubscriptions(subs, structName, fnSet)
    if (factoryType === 'child') addChildSubscriptions({ fnSet, structName, subs, tableName })
    if (isOrgModule(fnSet)) addOrgSubscriptions(subs, fnSet)
    addParsedQuerySubscriptions({ fnSet, modName, subs, tableName })
    return subs
  }

for (const [modName, fns] of Object.entries(modules)) {
  const apiName = `${pascalCase(modName)}API`,
    tableName = modName.replace(/^(?<ch>[a-z])/u, (_, c: string) => c.toLowerCase()),
    factoryType = tableFactoryType[tableName],
    fields = userSchemaFields[tableName],
    structName = safeSwiftName(pascalCase(tableName)),
    fnSet = new Set(fns),
    hasWhereFields = whereFieldsMap[tableName] !== undefined,
    isStandardList = (factoryType === 'owned' || factoryType === 'orgScoped') && fnSet.has('list') && hasWhereFields

  emit(`public enum ${apiName} {`)
  for (const fn of fns) emit(`${indent(1)}public static let ${fn} = "${modName}:${fn}"`)

  if (isStandardList) {
    emit('')
    emitListArgs(modName, tableName, factoryType)
  }

  if (factoryType && fields) {
    const prevDesktopLen = lines.length
    if (factoryType === 'owned' || factoryType === 'orgScoped') {
      if (isStandardList) emitListWrapper(modName, tableName, structName, factoryType)
      if (fnSet.has('search')) emitSearchWrapper(modName, structName, factoryType)
      if (fnSet.has('create')) emitCreateWrapper(modName, fields, factoryType)
      if (fnSet.has('update')) emitUpdateWrapper(modName, fields, factoryType)
      if (fnSet.has('rm')) emitRmWrapper(modName, factoryType)
      if (fnSet.has('read')) emitReadWrapper(modName, structName, factoryType)
      if (fnSet.has('restore')) emitRestoreWrapper(modName, factoryType)
    } else if (factoryType === 'singleton') {
      if (fnSet.has('upsert')) emitUpsertWrapper(modName, fields)
      if (fnSet.has('get')) emitGetWrapper(modName, structName)
    } else if (factoryType === 'child' && fnSet.has('create') && allFieldsArgSafe(fields))
      emitChildCreateWrapper(modName, fields)

    const customDesktop = buildDesktopDescriptors(modName, tableName, fnSet)
    for (const [fnName, desc] of Object.entries(customDesktop))
      if (fnSet.has(fnName)) emitCustomDesktopFn(emit, modName, desc, fnName)

    if (lines.length > prevDesktopLen) {
      const wrappedLines = lines.splice(prevDesktopLen)
      emit('')
      emit(`${indent(1)}#if DESKTOP`)
      for (const line of wrappedLines) emit(line)
      emit(`${indent(1)}#endif`)
    }
  }

  if (!(factoryType && fields)) {
    const customDesktopNoFactory = buildDesktopDescriptors(modName, tableName, fnSet)
    if (Object.keys(customDesktopNoFactory).length > 0) {
      const prevLen = lines.length
      for (const [fnName, desc] of Object.entries(customDesktopNoFactory))
        if (fnSet.has(fnName)) emitCustomDesktopFn(emit, modName, desc, fnName)

      if (lines.length > prevLen) {
        const wrappedLines = lines.splice(prevLen)
        emit('')
        emit(`${indent(1)}#if DESKTOP`)
        for (const line of wrappedLines) emit(line)
        emit(`${indent(1)}#endif`)
      }
    }
  }

  emit('}')
  emit('')
}

emit('// swiftlint:enable file_types_order file_length')

const output = `${lines.join('\n')}\n`
writeFileSync(OUTPUT_PATH, output)

const structCount = emittedStructs.size + nestedEmitted.size,
  enumCount = enumRegistry.size,
  moduleCount = Object.keys(modules).length,
  whereCount = Object.keys(whereFieldsMap).length
let fnCount = 0
for (const fns of Object.values(modules)) fnCount += fns.length
let wrapperCount = 0
for (const [modName] of Object.entries(modules)) {
  const tableName = modName.replace(/^(?<ch>[a-z])/u, (_, c: string) => c.toLowerCase())
  if (tableFactoryType[tableName]) wrapperCount += 1
}

process.stdout.write(
  `Generated ${OUTPUT_PATH}\n  ${String(structCount)} structs, ${String(enumCount)} enums, ${String(moduleCount)} modules, ${String(fnCount)} API constants, ${String(wrapperCount)} typed wrappers, ${String(whereCount)} Where structs\n`
)

if (MOBILE_OUTPUT_PATH) {
  const mLines: string[] = [],
    me = (s: string) => {
      mLines.push(s)
    },
    emitMobileCreateWrapper = (modName: string, fields: Map<string, FieldEntry>, factoryType: string) => {
      const params: string[] = [],
        required: string[] = [],
        optional: string[] = []
      if (factoryType === 'orgScoped') params.push('orgId: String')
      for (const [fname, field] of fields) {
        const t = field.isOptional ? `${field.swiftType}?` : field.swiftType,
          defaultVal = field.isOptional ? ' = nil' : ''
        params.push(`${fname}: ${t}${defaultVal}`)
        const value = isEnumField(field.swiftType) ? `${fname}.rawValue` : fname
        if (field.isOptional) optional.push(fname)
        else required.push(`"${fname}": ${value}`)
      }
      if (factoryType === 'orgScoped') required.unshift('"orgId": orgId')
      me(`${indent(1)}public static func create(`)
      me(`${indent(2)}${params.join(`,\n${indent(2)}`)}`)
      me(`${indent(1)}) async throws {`)
      const binding = optional.length > 0 ? 'var' : 'let'
      me(`${indent(2)}${binding} args: [String: Any] = [${required.join(', ')}]`)
      for (const fname of optional) {
        const field = fields.get(fname)
        if (field) {
          const value = isEnumField(field.swiftType) ? `${fname}.rawValue` : fname
          me(`${indent(2)}if let ${fname} { args["${fname}"] = ${value} }`)
        }
      }
      me(`${indent(2)}try await ConvexService.shared.mutate("${modName}:create", args: args)`)
      me(`${indent(1)}}`)
    },
    emitMobileUpdateWrapper = (modName: string, fields: Map<string, FieldEntry>, factoryType: string) => {
      const params: string[] = [],
        required: string[] = ['"id": id'],
        optional: string[] = []
      if (factoryType === 'orgScoped') {
        params.push('orgId: String')
        required.push('"orgId": orgId')
      }
      params.push('id: String')
      for (const [fname, field] of fields) {
        params.push(`${fname}: ${field.swiftType}? = nil`)
        optional.push(fname)
      }
      params.push('expectedUpdatedAt: Double? = nil')
      optional.push('expectedUpdatedAt')
      me(`${indent(1)}public static func update(`)
      me(`${indent(2)}${params.join(`,\n${indent(2)}`)}`)
      me(`${indent(1)}) async throws {`)
      me(`${indent(2)}var args: [String: Any] = [${required.join(', ')}]`)
      for (const fname of optional) {
        const field =
          fname === 'expectedUpdatedAt' ? ({ isOptional: true, swiftType: 'Double' } as FieldEntry) : fields.get(fname)
        if (field) {
          const value = isEnumField(field.swiftType) ? `${fname}.rawValue` : fname
          me(`${indent(2)}if let ${fname} { args["${fname}"] = ${value} }`)
        }
      }
      me(`${indent(2)}try await ConvexService.shared.mutate("${modName}:update", args: args)`)
      me(`${indent(1)}}`)
    },
    emitMobileRmWrapper = (modName: string, factoryType: string) => {
      const params: string[] = [],
        argParts = ['"id": id']
      if (factoryType === 'orgScoped') {
        params.push('orgId: String')
        argParts.push('"orgId": orgId')
      }
      params.push('id: String')
      me(`${indent(1)}public static func rm(${params.join(', ')}) async throws {`)
      me(`${indent(2)}try await ConvexService.shared.mutate("${modName}:rm", args: [${argParts.join(', ')}])`)
      me(`${indent(1)}}`)
      const bulkParams: string[] = [],
        bulkArgParts = ['"ids": ids']
      if (factoryType === 'orgScoped') {
        bulkParams.push('orgId: String')
        bulkArgParts.push('"orgId": orgId')
      }
      bulkParams.push('ids: [String]')
      me(`${indent(1)}public static func rm(${bulkParams.join(', ')}) async throws {`)
      me(`${indent(2)}try await ConvexService.shared.mutate("${modName}:rm", args: [${bulkArgParts.join(', ')}])`)
      me(`${indent(1)}}`)
    },
    emitMobileUpsertWrapper = (modName: string, fields: Map<string, FieldEntry>) => {
      const params: string[] = [],
        optional: string[] = []
      for (const [fname, field] of fields) {
        params.push(`${fname}: ${field.swiftType}? = nil`)
        optional.push(fname)
      }
      me(`${indent(1)}public static func upsert(`)
      me(`${indent(2)}${params.join(`,\n${indent(2)}`)}`)
      me(`${indent(1)}) async throws {`)
      me(`${indent(2)}var args: [String: Any] = [:]`)
      for (const fname of optional) {
        const field = fields.get(fname)
        if (field) {
          const value = isEnumField(field.swiftType) ? `${fname}.rawValue` : fname
          me(`${indent(2)}if let ${fname} { args["${fname}"] = ${value} }`)
        }
      }
      me(`${indent(2)}try await ConvexService.shared.mutate("${modName}:upsert", args: args)`)
      me(`${indent(1)}}`)
    },
    emitMobileRestoreWrapper = (modName: string, factoryType: string) => {
      const params: string[] = [],
        argParts = ['"id": id']
      if (factoryType === 'orgScoped') {
        params.push('orgId: String')
        argParts.push('"orgId": orgId')
      }
      params.push('id: String')
      me(`${indent(1)}public static func restore(${params.join(', ')}) async throws {`)
      me(`${indent(2)}try await ConvexService.shared.mutate("${modName}:restore", args: [${argParts.join(', ')}])`)
      me(`${indent(1)}}`)
    }

  me('// Auto-generated by @noboil/convex-codegen-swift. DO NOT EDIT.')
  me('// swiftlint:disable file_length')
  me('import Foundation')
  me('')

  for (const [modName, fns] of Object.entries(modules)) {
    const tableName = modName.replace(/^(?<ch>[a-z])/u, (_, c: string) => c.toLowerCase()),
      factoryType = tableFactoryType[tableName],
      fields = userSchemaFields[tableName],
      apiName = `${pascalCase(modName)}API`,
      fnSet = new Set(fns)

    if (factoryType && fields) {
      const prevLen = mLines.length

      if (factoryType === 'owned' || factoryType === 'orgScoped') {
        if (fnSet.has('create')) emitMobileCreateWrapper(modName, fields, factoryType)
        if (fnSet.has('update')) emitMobileUpdateWrapper(modName, fields, factoryType)
        if (fnSet.has('rm')) emitMobileRmWrapper(modName, factoryType)
        if (fnSet.has('restore')) emitMobileRestoreWrapper(modName, factoryType)
      } else if (factoryType === 'singleton' && fnSet.has('upsert')) emitMobileUpsertWrapper(modName, fields)

      const customMobile = buildMobileDescriptors(modName, tableName, fnSet)
      for (const [fnName, desc] of Object.entries(customMobile))
        if (fnSet.has(fnName)) emitCustomMobileFn(me, modName, desc, fnName)

      if (mLines.length > prevLen) {
        const wrappedLines = mLines.splice(prevLen)
        me('')
        me(`extension ${apiName} {`)
        for (const line of wrappedLines) me(line)
        me('}')
      }
    }

    if (!(factoryType && fields)) {
      const customMobileNoFactory = buildMobileDescriptors(modName, tableName, fnSet)
      if (Object.keys(customMobileNoFactory).length > 0) {
        const prevLen = mLines.length
        for (const [fnName, desc] of Object.entries(customMobileNoFactory))
          if (fnSet.has(fnName)) emitCustomMobileFn(me, modName, desc, fnName)

        if (mLines.length > prevLen) {
          const wrappedLines = mLines.splice(prevLen)
          me('')
          me(`extension ${apiName} {`)
          for (const line of wrappedLines) me(line)
          me('}')
        }
      }
    }

    const subs = buildMobileSubscriptions({ factoryType, fnSet, modName, tableName })
    if (subs.length > 0) {
      me('')
      me(`extension ${apiName} {`)
      let first = true
      for (const sub of subs) {
        if (!first) me('')
        emitMobileSubscription(me, sub)
        first = false
      }
      me('}')
    }
  }

  const mobileOutput = `${mLines.join('\n')}\n`
  writeFileSync(MOBILE_OUTPUT_PATH, mobileOutput)
  process.stdout.write(`Generated ${MOBILE_OUTPUT_PATH}\n`)
}

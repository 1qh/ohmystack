import type { AlgebraicTypeType, ColumnBuilder, table as stdbTable, TypeBuilder } from 'spacetimedb/server'
import { schema as stdbSchema, t as stdbT, table as stdbTableFn } from 'spacetimedb/server'
type FieldBuilder = ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>
type FieldFromSchemaFn = (schema: unknown, t: ZodBridgeT, path: string) => FieldBuilder
interface KeyField {
  builder: FieldBuilder
  name: string
}
type OptionalFieldBuilder = FieldBuilder & {
  index: () => FieldBuilder
  optional: () => FieldBuilder
  unique: () => FieldBuilder
}
interface StdbDeps {
  t: ZodBridgeT
  table: (...args: Parameters<typeof stdbTable>) => StdbTable
}
type StdbTable = ReturnType<typeof stdbTable>
type StdbTypeBuilder = TypeBuilder<unknown, AlgebraicTypeType>
type TableFields = Record<string, FieldBuilder>
type TableInput = TableFields | ZodLike
type TableOptions = Record<string, unknown>
interface ZodBridgeT {
  array: (element: StdbTypeBuilder) => FieldBuilder & { optional: () => FieldBuilder }
  bool: () => OptionalFieldBuilder
  identity: () => StdbTypeBuilder & {
    index: () => FieldBuilder
    optional: () => FieldBuilder
  }
  number: () => FieldBuilder & { optional: () => FieldBuilder }
  object: (name: string, fields: Record<string, StdbTypeBuilder>) => FieldBuilder & { optional: () => FieldBuilder }
  string: () => OptionalFieldBuilder
  timestamp: () => OptionalFieldBuilder
  u32: () => {
    autoInc: () => { primaryKey: () => FieldBuilder }
    index: () => FieldBuilder
    unique: () => FieldBuilder
  }
}
interface ZodLike {
  def?: {
    element?: unknown
    innerType?: unknown
    options?: unknown[]
    shape?: Record<string, unknown>
  }
  shape?: Record<string, unknown>
  type?: unknown
}
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isZodObject = (value: unknown): value is ZodLike =>
  isRecord(value) && value.type === 'object' && 'shape' in value && isRecord(value.shape)
const hasOptional = (value: FieldBuilder): value is FieldBuilder & { optional: () => FieldBuilder } =>
  isRecord(value) && 'optional' in value && typeof value.optional === 'function'
const toPascalCase = (value: string): string => {
  let out = ''
  let word = ''
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charAt(i)
    const code = ch.codePointAt(0) ?? -1
    const isUpper = code >= 65 && code <= 90
    const isLower = code >= 97 && code <= 122
    const isDigit = code >= 48 && code <= 57
    const isAlphaNum = isUpper || isLower || isDigit
    const prev = i > 0 ? value.charAt(i - 1) : ''
    const prevCode = prev.codePointAt(0) ?? -1
    const prevIsLower = prevCode >= 97 && prevCode <= 122
    const prevIsDigit = prevCode >= 48 && prevCode <= 57
    const splitBeforeUpper = isUpper && word.length > 0 && (prevIsLower || prevIsDigit)
    if (!isAlphaNum) {
      if (word.length > 0) {
        out += word.charAt(0).toUpperCase() + word.slice(1)
        word = ''
      }
    } else if (splitBeforeUpper) {
      out += word.charAt(0).toUpperCase() + word.slice(1)
      word = ch.toLowerCase()
    } else word += ch
  }
  if (word.length > 0) out += word.charAt(0).toUpperCase() + word.slice(1)
  return out || 'Object'
}
const asOptional = (field: FieldBuilder): FieldBuilder => (hasOptional(field) ? field.optional() : field)
const unwrapOptional = (z: ZodLike): undefined | ZodLike => {
  let inner = z.def?.innerType as undefined | ZodLike
  while (inner) {
    const it = isRecord(inner) && typeof inner.type === 'string' ? inner.type : ''
    if (it === 'optional' || it === 'nullable') inner = inner.def?.innerType as undefined | ZodLike
    else break
  }
  return inner
}
const simpleField = (type: string, t: ZodBridgeT): FieldBuilder | undefined => {
  if (type === 'string' || type === 'enum') return t.string()
  if (type === 'number') return t.number()
  if (type === 'boolean') return t.bool()
}
const unionObject = (
  options: undefined | unknown[],
  t: ZodBridgeT,
  ctx: { fromSchema: FieldFromSchemaFn; path: string }
): FieldBuilder => {
  const { fromSchema, path } = ctx
  const variants: Record<string, unknown>[] = []
  if (options)
    for (const option of options) {
      const shape = (option as ZodLike).def?.shape
      if (isRecord(shape)) variants.push(shape)
    }
  if (variants.length === 0) return t.object(toPascalCase(path), {})
  const totalVariants = variants.length
  const fieldCounts: Record<string, number> = {}
  const firstSchemaByField: Record<string, unknown> = {}
  const fieldNames: string[] = []
  for (const variant of variants) {
    const names = Object.keys(variant)
    for (const name of names) {
      if (!(name in fieldCounts)) {
        fieldCounts[name] = 0
        fieldNames.push(name)
      }
      fieldCounts[name] = (fieldCounts[name] ?? 0) + 1
      if (!(name in firstSchemaByField)) firstSchemaByField[name] = variant[name]
    }
  }
  const merged: Record<string, FieldBuilder> = {}
  fieldNames.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  for (const name of fieldNames) {
    const baseField = fromSchema(firstSchemaByField[name], t, `${path}.${name}`)
    merged[name] = (fieldCounts[name] ?? 0) === totalVariants ? baseField : asOptional(baseField)
  }
  return t.object(toPascalCase(path), merged as Record<string, StdbTypeBuilder>)
}
const objectFields = (
  shape: Record<string, unknown> | undefined,
  t: ZodBridgeT,
  ctx: { fromSchema: FieldFromSchemaFn; prefix: string }
): Record<string, FieldBuilder> => {
  const { fromSchema, prefix } = ctx
  const safeShape = shape ?? {}
  const fields: Record<string, FieldBuilder> = {}
  const names = Object.keys(safeShape)
  for (const name of names) {
    const path = prefix ? `${prefix}.${name}` : name
    fields[name] = fromSchema(safeShape[name], t, path)
  }
  return fields
}
const fieldFromSchema = (schema: unknown, t: ZodBridgeT, path: string): FieldBuilder => {
  const z = schema as ZodLike
  const type = isRecord(schema) && typeof z.type === 'string' ? z.type : ''
  const simple = simpleField(type, t)
  if (simple) return simple
  if (type === 'array') return t.array(fieldFromSchema(z.def?.element, t, `${path}.item`) as StdbTypeBuilder)
  if (type === 'object')
    return t.object(
      toPascalCase(path),
      objectFields(z.def?.shape, t, {
        fromSchema: fieldFromSchema,
        prefix: path
      }) as Record<string, StdbTypeBuilder>
    )
  if (type === 'union')
    return unionObject(z.def?.options, t, {
      fromSchema: fieldFromSchema,
      path
    })
  if (type === 'optional' || type === 'nullable') return asOptional(fieldFromSchema(unwrapOptional(z), t, path))
  if (type === 'default' || type === 'readonly' || type === 'catch' || type === 'prefault')
    return fieldFromSchema(z.def?.innerType, t, path)
  return t.string()
}
const zodToStdbFields = (shape: Record<string, unknown>, t: ZodBridgeT, prefix = ''): Record<string, FieldBuilder> =>
  objectFields(shape, t, { fromSchema: fieldFromSchema, prefix })
const resolveFields = (fields: unknown, t: StdbDeps['t'], tableName: string): TableFields => {
  if (isZodObject(fields)) return zodToStdbFields(fields.shape ?? {}, t, tableName)
  return fields as TableFields
}
const makeSchema = (deps?: Partial<StdbDeps>) => {
  const t = deps?.t ?? stdbT
  const table = deps?.table ?? stdbTableFn
  const schema = stdbSchema
  const tbl = (opts: TableOptions, fields: TableFields): StdbTable =>
    table({ public: true, ...opts } as never, fields as never)
  const cacheTable = (keyFieldOrName: KeyField | string, fields: TableInput, opts?: TableOptions): StdbTable => {
    const keyField: KeyField =
      typeof keyFieldOrName === 'string' ? { builder: t.u32().unique(), name: keyFieldOrName } : keyFieldOrName
    return tbl(
      { ...opts },
      {
        ...resolveFields(fields, t, 'cache'),
        cachedAt: t.timestamp(),
        createdAt: t.timestamp(),
        id: t.u32().autoInc().primaryKey(),
        invalidatedAt: t.timestamp().optional(),
        [keyField.name]: keyField.builder,
        updatedAt: t.timestamp()
      }
    )
  }
  const childTable = (foreignKeyName: string, fields: TableInput, opts?: TableOptions): StdbTable =>
    tbl(
      { ...opts },
      {
        ...resolveFields(fields, t, 'child'),
        createdAt: t.timestamp(),
        [foreignKeyName]: t.u32().index(),
        id: t.u32().autoInc().primaryKey(),
        updatedAt: t.timestamp(),
        userId: t.identity().index()
      }
    )
  const fileTable = (): StdbTable =>
    tbl(
      {},
      {
        contentType: t.string(),
        createdAt: t.timestamp(),
        data: stdbT.byteArray(),
        filename: t.string(),
        id: t.u32().autoInc().primaryKey(),
        size: t.number(),
        uploadedAt: t.timestamp(),
        userId: t.identity().index()
      }
    )
  const orgInviteTable = (): StdbTable =>
    tbl(
      {},
      {
        createdAt: t.timestamp(),
        email: t.string(),
        expiresAt: t.number(),
        id: t.u32().autoInc().primaryKey(),
        isAdmin: t.bool(),
        orgId: t.u32().index(),
        token: t.string().unique()
      }
    )
  const orgJoinRequestTable = (): StdbTable =>
    tbl(
      {},
      {
        createdAt: t.timestamp(),
        id: t.u32().autoInc().primaryKey(),
        message: t.string().optional(),
        orgId: t.u32().index(),
        status: t.string().index(),
        updatedAt: t.timestamp(),
        userId: t.identity().index()
      }
    )
  const orgMemberTable = (): StdbTable =>
    tbl(
      {},
      {
        createdAt: t.timestamp(),
        id: t.u32().autoInc().primaryKey(),
        isAdmin: t.bool(),
        orgId: t.u32().index(),
        updatedAt: t.timestamp(),
        userId: t.identity().index()
      }
    )
  const orgScopedTable = (fields: TableInput, extra?: TableFields, opts?: TableOptions): StdbTable =>
    tbl(
      { ...opts },
      {
        ...resolveFields(fields, t, 'orgScoped'),
        ...extra,
        createdAt: t.timestamp(),
        id: t.u32().autoInc().primaryKey(),
        orgId: t.u32().index(),
        updatedAt: t.timestamp(),
        userId: t.identity().index()
      }
    )
  const ownedTable = (fields: TableInput, extra?: TableFields, opts?: TableOptions): StdbTable =>
    tbl(
      { ...opts },
      {
        ...resolveFields(fields, t, 'owned'),
        ...extra,
        createdAt: t.timestamp(),
        id: t.u32().autoInc().primaryKey(),
        updatedAt: t.timestamp(),
        userId: t.identity().index()
      }
    )
  const singletonTable = (fields: TableInput, opts?: TableOptions): StdbTable =>
    tbl(
      { ...opts },
      {
        ...resolveFields(fields, t, 'singleton'),
        createdAt: t.timestamp(),
        id: t.u32().autoInc().primaryKey(),
        updatedAt: t.timestamp(),
        userId: t.identity().index()
      }
    )
  return {
    cacheTable,
    childTable,
    fileTable,
    orgInviteTable,
    orgJoinRequestTable,
    orgMemberTable,
    orgScopedTable,
    ownedTable,
    schema,
    singletonTable,
    t
  }
}
export type { FieldBuilder, StdbDeps, StdbTable, TableFields, ZodBridgeT }
export { makeSchema, zodToStdbFields }

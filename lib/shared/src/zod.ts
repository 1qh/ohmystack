/* eslint-disable complexity */
import type { core, input, output, ZodObject, ZodType } from 'zod/v4'
import { isRecord } from './server/helpers'
type CvMeta = 'file' | 'files'
type DefType = core.$ZodTypeDef['type']
type NullsToUndefined<T> = { [K in keyof T]-?: Exclude<T[K], null> | undefined }
type ShapeKey<S extends ZodObject> = keyof S['shape'] & string
type UndefinedToOptional<T> = { [K in keyof T as undefined extends T[K] ? K : never]?: null | T[K] } & {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
} extends infer U
  ? { [K in keyof U]: U[K] }
  : never
type ZodSchema = ZodType
const WRAPPERS: ReadonlySet<DefType> = new Set<DefType>([
    'catch',
    'default',
    'nullable',
    'optional',
    'prefault',
    'readonly'
  ]),
  unwrapZod = (
    schema: unknown
  ): {
    def: undefined | ZodSchema['def']
    schema: undefined | ZodSchema
    type: '' | DefType
  } => {
    let cur = schema as undefined | ZodSchema
    while (cur && typeof cur === 'object' && 'type' in cur) {
      if (!WRAPPERS.has(cur.type)) return { def: cur.def, schema: cur, type: cur.type }
      cur = (cur.def as { innerType?: ZodSchema }).innerType
    }
    return { def: undefined, schema: undefined, type: '' }
  },
  isOptionalField = (schema: unknown): boolean => {
    let cur = schema as undefined | ZodSchema
    while (cur && typeof cur === 'object' && 'type' in cur) {
      if (cur.type === 'optional') return true
      if (!WRAPPERS.has(cur.type)) return false
      cur = (cur.def as { innerType?: ZodSchema }).innerType
    }
    return false
  },
  elementOf = (s: undefined | ZodSchema): unknown => (s?.def as undefined | { element?: unknown })?.element,
  cvMetaOf = (schema: undefined | ZodSchema): CvMeta | undefined => {
    if (!schema || typeof schema.meta !== 'function') return
    const m = schema.meta() as undefined | { cv?: unknown; file?: unknown; files?: unknown; storage?: unknown }
    if (!m || typeof m !== 'object') return
    if (m.file === true || m.storage === 'file') return 'file'
    if (m.files === true || m.storage === 'files') return 'files'
    if (m.cv === 'file' || m.cv === 'files') return m.cv
  },
  isArrayType = (t: '' | DefType) => t === 'array',
  isBooleanType = (t: '' | DefType) => t === 'boolean',
  isDateType = (t: '' | DefType) => t === 'date',
  isNumberType = (t: '' | DefType) => t === 'number',
  isStringType = (t: '' | DefType) => t === 'string' || t === 'enum',
  cvFileKindOf = (schema: unknown): CvMeta | undefined => {
    const { schema: s, type } = unwrapZod(schema),
      cv = cvMetaOf(s)
    if (cv) return cv
    if (isArrayType(type) && cvMetaOf(elementOf(s) as undefined | ZodSchema) === 'file') return 'files'
  },
  enumToOptions = <T extends string>(
    schema: { options: readonly T[] },
    transform?: (v: T) => string
  ): {
    label: string
    value: T
  }[] => {
    const out: { label: string; value: T }[] = []
    for (const v of schema.options) out.push({ label: transform?.(v) ?? v.charAt(0).toUpperCase() + v.slice(1), value: v })
    return out
  },
  shapeKeys = <S extends ZodObject>(schema: S): ShapeKey<S>[] => Object.keys(schema.shape) as ShapeKey<S>[],
  requiredPartial = <S extends ZodObject>(schema: S, requiredKeys: (keyof S['shape'])[]): ZodObject => {
    const partial = schema.partial(),
      required: Record<string, true> = {}
    for (const k of requiredKeys) required[k as string] = true
    return partial.required(required) as ZodObject
  },
  defaultValue = (schema: unknown): unknown => {
    let cur = schema as undefined | ZodSchema
    while (cur && typeof cur === 'object' && 'type' in cur) {
      if (cur.type === 'prefault') {
        const { factory } = cur.def as { factory?: () => unknown }
        if (typeof factory === 'function') return factory()
      }
      if (cur.type === 'default') {
        const { defaultValue: defaultVal } = cur.def as { defaultValue?: unknown }
        if (defaultVal !== undefined) return defaultVal
      }
      if (!WRAPPERS.has(cur.type)) break
      cur = (cur.def as { innerType?: ZodSchema }).innerType
    }
    const { schema: base, type } = unwrapZod(schema),
      fk = cvFileKindOf(schema)
    if (fk === 'file') return null
    if (fk === 'files') return []
    if (isArrayType(type)) return []
    if (isBooleanType(type)) return false
    if (isNumberType(type)) return 0
    if (isStringType(type)) {
      if (base && 'options' in base) {
        const opts = (base as { options: readonly string[] }).options
        if (opts.length > 0) return opts[0]
      }
      return ''
    }
    if (isDateType(type)) return null
    const inner = (base?.def as undefined | { innerType?: unknown })?.innerType
    if (inner) return defaultValue(inner)
  },
  defaultValues = <S extends ZodObject>(schema: S): output<S> => {
    const result: Record<string, unknown> = {},
      keys = shapeKeys(schema)
    for (const k of keys) result[k] = defaultValue(schema.shape[k])
    return result as output<S>
  },
  pickValues = <S extends ZodObject>(schema: S, doc: object): output<S> => {
    const d = doc as Record<string, unknown>,
      result: Record<string, unknown> = {},
      keys = shapeKeys(schema)
    for (const k of keys) result[k] = d[k] ?? defaultValue(schema.shape[k])
    return result as output<S>
  },
  partialValues = <S extends ZodObject, V extends Partial<input<S>> & Record<string, unknown>>(
    schema: S,
    values: V
  ): NullsToUndefined<output<S>> & Omit<V, keyof output<S>> => {
    const result: Record<string, unknown> = {},
      keys = shapeKeys(schema)
    for (const k of keys) {
      const v = (values as Record<string, unknown>)[k]
      result[k] = v === null ? undefined : v
    }
    for (const k of Object.keys(values)) if (!(k in result)) result[k] = (values as Record<string, unknown>)[k]
    return result as NullsToUndefined<output<S>> & Omit<V, keyof output<S>>
  },
  coerceOptionals = <S extends ZodObject>(schema: S, data: output<S>): output<S> => {
    const result: Record<string, unknown> = { ...data }
    for (const k of shapeKeys(schema))
      if (k in result && isOptionalField(schema.shape[k]) && isStringType(unwrapZod(schema.shape[k]).type)) {
        const v = result[k]
        if (typeof v === 'string') {
          const trimmed = v.trim()
          result[k] = trimmed.length > 0 ? trimmed : undefined
        }
      }
    return result as output<S>
  },
  schemaVariants: {
    <S extends ZodObject>(schema: S): { create: S; update: ReturnType<S['partial']> }
    <S extends ZodObject>(
      schema: S,
      requiredOnUpdate: (keyof output<S>)[]
    ): {
      create: S
      update: ZodObject
    }
  } = <S extends ZodObject>(schema: S, requiredOnUpdate?: (keyof output<S>)[]) => ({
    create: schema,
    update:
      requiredOnUpdate && requiredOnUpdate.length > 0
        ? requiredPartial(schema, requiredOnUpdate as (keyof S['shape'])[])
        : schema.partial()
  })
interface CheckSchemaOutput {
  path: string
  zodType: string
}
const unsupportedTypes = new Set(['pipe', 'transform']),
  scanSchema = (schema: unknown, path: string, out: CheckSchemaOutput[]) => {
    const b = unwrapZod(schema)
    if (b.type && unsupportedTypes.has(b.type)) out.push({ path, zodType: b.type })
    if (isArrayType(b.type)) return scanSchema(elementOf(b.schema), `${path}[]`, out)
    if (b.type === 'object' && b.schema && isRecord((b.schema as unknown as { shape?: unknown }).shape))
      for (const [k, vl] of Object.entries((b.schema as unknown as { shape: Record<string, unknown> }).shape))
        scanSchema(vl, path ? `${path}.${k}` : k, out)
  },
  checkSchema = (schemas: Record<string, ZodObject>) => {
    const res: CheckSchemaOutput[] = []
    for (const [table, schema] of Object.entries(schemas)) scanSchema(schema, table, res)
    if (res.length > 0) {
      for (const f of res) process.stderr.write(`${f.path}: unsupported zod type "${f.zodType}"\n`)
      process.exitCode = 1
    }
  }
export type { CheckSchemaOutput, CvMeta, DefType, NullsToUndefined, ShapeKey, UndefinedToOptional, ZodSchema }
export {
  checkSchema,
  coerceOptionals,
  cvFileKindOf,
  cvMetaOf,
  defaultValue,
  defaultValues,
  elementOf,
  enumToOptions,
  isArrayType,
  isBooleanType,
  isDateType,
  isNumberType,
  isOptionalField,
  isStringType,
  partialValues,
  pickValues,
  requiredPartial,
  schemaVariants,
  shapeKeys,
  unwrapZod
}

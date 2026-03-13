/* eslint-disable complexity */
import type { core, input, output, ZodObject, ZodRawShape, ZodType } from 'zod/v4'

/** Marks Betterspace file metadata on Zod fields. */
type CvMeta = 'file' | 'files'
/** Represents a raw Zod definition type tag. */
type DefType = core.$ZodTypeDef['type']

type NullsToUndefined<T> = { [K in keyof T]-?: Exclude<T[K], null> | undefined }
type ShapeKey<S extends ZodObject<ZodRawShape>> = keyof S['shape'] & string
type UndefinedToOptional<T> = { [K in keyof T as undefined extends T[K] ? K : never]?: null | T[K] } & {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
} extends infer U
  ? { [K in keyof U]: U[K] }
  : never
/** Alias for runtime Zod schema values. */
type ZodSchema = ZodType

const WRAPPERS: ReadonlySet<DefType> = new Set<DefType>([
    'catch',
    'default',
    'nullable',
    'optional',
    'prefault',
    'readonly'
  ]),
  /** Unwraps optional/default wrappers and returns the underlying schema metadata. */
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
  /** Checks whether a schema is optional through any wrapper chain. */
  isOptionalField = (schema: unknown): boolean => {
    let cur = schema as undefined | ZodSchema
    while (cur && typeof cur === 'object' && 'type' in cur) {
      if (cur.type === 'optional') return true
      if (!WRAPPERS.has(cur.type)) return false
      cur = (cur.def as { innerType?: ZodSchema }).innerType
    }
    return false
  },
  /** Returns the element schema for array-like definitions. */
  elementOf = (s: undefined | ZodSchema): unknown => (s?.def as undefined | { element?: unknown })?.element,
  /** Reads Betterspace file metadata from a schema's meta object. */
  cvMetaOf = (schema: undefined | ZodSchema): CvMeta | undefined => {
    if (!schema || typeof schema.meta !== 'function') return
    const m = schema.meta() as undefined | { cv?: unknown; file?: unknown; files?: unknown; storage?: unknown }
    if (!m || typeof m !== 'object') return
    if (m.file === true || m.storage === 'file') return 'file'
    if (m.files === true || m.storage === 'files') return 'files'
    if (m.cv === 'file' || m.cv === 'files') return m.cv
  },
  /** Returns true when the unwrapped type is an array. */
  isArrayType = (t: '' | DefType) => t === 'array',
  /** Returns true when the unwrapped type is boolean. */
  isBooleanType = (t: '' | DefType) => t === 'boolean',
  /** Returns true when the unwrapped type is date. */
  isDateType = (t: '' | DefType) => t === 'date',
  /** Returns true when the unwrapped type is number. */
  isNumberType = (t: '' | DefType) => t === 'number',
  /** Returns true when the unwrapped type is string or enum. */
  isStringType = (t: '' | DefType) => t === 'string' || t === 'enum',
  /** Resolves whether a schema maps to a single file or file list field. */
  cvFileKindOf = (schema: unknown): CvMeta | undefined => {
    const { schema: s, type } = unwrapZod(schema),
      cv = cvMetaOf(s)
    if (cv) return cv
    if (isArrayType(type) && cvMetaOf(elementOf(s) as undefined | ZodSchema) === 'file') return 'files'
  },
  /** Converts enum options to label/value pairs for form controls.
   * @param schema - Enum schema with an options list
   * @param transform - Optional label formatter
   * @returns Array of normalized option entries
   */
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
  shapeKeys = <S extends ZodObject<ZodRawShape>>(schema: S): ShapeKey<S>[] => Object.keys(schema.shape) as ShapeKey<S>[],
  /** Makes a partial schema while forcing selected keys back to required.
   * @param schema - Source object schema
   * @param requiredKeys - Keys that should stay required
   * @returns Reconfigured object schema
   */
  requiredPartial = <S extends ZodObject<ZodRawShape>>(
    schema: S,
    requiredKeys: (keyof S['shape'])[]
  ): ZodObject<S['shape']> => {
    const partial = schema.partial(),
      required: Record<string, true> = {}
    for (const k of requiredKeys) required[k as string] = true
    return partial.required(required) as ZodObject<S['shape']>
  },
  /** Computes a default value for a single schema field. */
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
  /** Builds default values for every key in an object schema.
   * @param schema - Object schema used to derive defaults
   * @returns Object with initialized field values
   */
  defaultValues = <S extends ZodObject<ZodRawShape>>(schema: S): output<S> => {
    const result: Record<string, unknown> = {},
      keys = shapeKeys(schema)
    for (const k of keys) result[k] = defaultValue(schema.shape[k])
    return result as output<S>
  },
  /** Picks known keys from a document and fills missing ones with defaults. */
  pickValues = <S extends ZodObject<ZodRawShape>>(schema: S, doc: object): output<S> => {
    const d = doc as Record<string, unknown>,
      result: Record<string, unknown> = {},
      keys = shapeKeys(schema)
    for (const k of keys) result[k] = d[k] ?? defaultValue(schema.shape[k])
    return result as output<S>
  },
  partialValues = <S extends ZodObject<ZodRawShape>, V extends Partial<input<S>> & Record<string, unknown>>(
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
  /** Converts blank optional strings into undefined before submission. */
  coerceOptionals = <S extends ZodObject<ZodRawShape>>(schema: S, data: output<S>): output<S> => {
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
  /** Generates create and update schema variants from a base schema.
   * @param schema - Base object schema
   * @param requiredOnUpdate - Keys that remain required in the update variant
   * @returns Object with create (original) and update (partial) variants
   */
  schemaVariants: {
    <S extends ZodObject<ZodRawShape>>(schema: S): { create: S; update: ReturnType<S['partial']> }
    <S extends ZodObject<ZodRawShape>>(
      schema: S,
      requiredOnUpdate: (keyof output<S>)[]
    ): {
      create: S
      update: ZodObject<S['shape']>
    }
  } = <S extends ZodObject<ZodRawShape>>(schema: S, requiredOnUpdate?: (keyof output<S>)[]) => ({
    create: schema,
    update:
      requiredOnUpdate && requiredOnUpdate.length > 0
        ? requiredPartial(schema, requiredOnUpdate as (keyof S['shape'])[])
        : schema.partial()
  })

export type { CvMeta, DefType, UndefinedToOptional, ZodSchema }
export {
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
  unwrapZod
}

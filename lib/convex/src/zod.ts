import type { core, output, ZodObject, ZodRawShape, ZodType } from 'zod/v4'

type CvMeta = 'file' | 'files'
type DefType = core.$ZodTypeDef['type']
type ZodSchema = ZodType

const WRAPPERS: ReadonlySet<DefType> = new Set<DefType>([
    'catch',
    'default',
    'nullable',
    'optional',
    'prefault',
    'readonly'
  ]),
  /** Unwraps Zod wrapper types (optional, nullable, etc.) to get the underlying schema. */
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
  /** Checks if a Zod schema is optional. */
  isOptionalField = (schema: unknown): boolean => {
    let cur = schema as undefined | ZodSchema
    while (cur && typeof cur === 'object' && 'type' in cur) {
      if (cur.type === 'optional') return true
      if (!WRAPPERS.has(cur.type)) return false
      cur = (cur.def as { innerType?: ZodSchema }).innerType
    }
    return false
  },
  /** Extracts the element type from a Zod array schema. */
  elementOf = (s: undefined | ZodSchema): unknown => (s?.def as undefined | { element?: unknown })?.element,
  /** Extracts Convex file metadata from a Zod schema. */
  cvMetaOf = (schema: undefined | ZodSchema): CvMeta | undefined => {
    if (!schema || typeof schema.meta !== 'function') return
    const m = schema.meta() as undefined | { cv?: unknown }
    if (m && typeof m === 'object') {
      const { cv } = m
      if (cv === 'file' || cv === 'files') return cv
    }
  },
  /** Checks if a Zod type definition is an array. */
  isArrayType = (t: '' | DefType) => t === 'array',
  /** Checks if a Zod type definition is a boolean. */
  isBooleanType = (t: '' | DefType) => t === 'boolean',
  /** Checks if a Zod type definition is a date. */
  isDateType = (t: '' | DefType) => t === 'date',
  /** Checks if a Zod type definition is a number. */
  isNumberType = (t: '' | DefType) => t === 'number',
  /** Checks if a Zod type definition is a string or enum. */
  isStringType = (t: '' | DefType) => t === 'string' || t === 'enum',
  /** Determines if a schema is a file or files field. */
  cvFileKindOf = (schema: unknown): CvMeta | undefined => {
    const { schema: s, type } = unwrapZod(schema),
      cv = cvMetaOf(s)
    if (cv) return cv
    if (isArrayType(type) && cvMetaOf(elementOf(s) as undefined | ZodSchema) === 'file') return 'files'
  },
  /** Converts enum options to label-value pairs for form rendering. */
  enumToOptions = <T extends string>(
    schema: { options: readonly T[] },
    transform?: (v: T) => string
  ): {
    label: string
    value: T
  }[] =>
    schema.options.map(v => ({
      label: transform?.(v) ?? v.charAt(0).toUpperCase() + v.slice(1),
      value: v
    })),
  /** Creates a partial schema with specific fields marked as required. */
  requiredPartial = <S extends ZodObject<ZodRawShape>>(
    schema: S,
    requiredKeys: (keyof S['shape'])[]
  ): ZodObject<ZodRawShape> => {
    const partial = schema.partial(),
      required = Object.fromEntries(requiredKeys.map(k => [k, true])) as Record<string, true>
    return partial.required(required) as ZodObject<ZodRawShape>
  },
  /** Generates a default value for a Zod schema field. */
  defaultValue = (schema: unknown): unknown => {
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
  /** Generates default values for all fields in a Zod object schema. */
  defaultValues = <S extends ZodObject<ZodRawShape>>(schema: S): output<S> => {
    const result: Record<string, unknown> = {}
    // biome-ignore lint/nursery/noForIn: iterating shape keys with hasOwn guard
    for (const k in schema.shape) if (Object.hasOwn(schema.shape, k)) result[k] = defaultValue(schema.shape[k])
    return result as output<S>
  },
  /** Extracts values from a document, using defaults for missing fields. */
  pickValues = <S extends ZodObject<ZodRawShape>>(schema: S, doc: object): output<S> => {
    const d = doc as Record<string, unknown>,
      result: Record<string, unknown> = {}
    // biome-ignore lint/nursery/noForIn: iterating shape keys with hasOwn guard
    for (const k in schema.shape) if (Object.hasOwn(schema.shape, k)) result[k] = d[k] ?? defaultValue(schema.shape[k])
    return result as output<S>
  },
  /** Coerces optional string fields to undefined if empty after trimming. */
  coerceOptionals = <S extends ZodObject<ZodRawShape>>(schema: S, data: output<S>): output<S> => {
    const result: Record<string, unknown> = { ...data }
    for (const k of Object.keys(result))
      if (isOptionalField(schema.shape[k]) && isStringType(unwrapZod(schema.shape[k]).type)) {
        const v = result[k]
        if (typeof v === 'string') {
          const trimmed = v.trim()
          result[k] = trimmed.length > 0 ? trimmed : undefined
        }
      }
    return result as output<S>
  }

export type { CvMeta, DefType, ZodSchema }
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
  pickValues,
  requiredPartial,
  unwrapZod
}

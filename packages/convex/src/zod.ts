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
  isOptionalField = (schema: unknown): boolean => {
    let cur = schema as undefined | ZodSchema
    while (cur && typeof cur === 'object' && 'type' in cur) {
      if (cur.type === 'optional') return true
      if (!WRAPPERS.has(cur.type)) return false
      cur = (cur.def as { innerType?: ZodSchema }).innerType
    }
    return false
  },
  cvMetaOf = (schema: undefined | ZodSchema): CvMeta | undefined => {
    if (!schema || typeof schema.meta !== 'function') return
    const m = schema.meta() as undefined | { cv?: unknown }
    if (m && typeof m === 'object') {
      const { cv } = m
      if (cv === 'file' || cv === 'files') return cv
    }
  },
  isBooleanType = (t: '' | DefType) => t === 'boolean',
  isNumberType = (t: '' | DefType) => t === 'number',
  cvFileKindOf = (schema: unknown): CvMeta | undefined => {
    const { schema: s, type } = unwrapZod(schema),
      cv = cvMetaOf(s)
    if (cv) return cv
    if (isArrayType(type) && cvMetaOf(elementOf(s) as undefined | ZodSchema) === 'file') return 'files'
  },
  requiredPartial = <S extends ZodObject<ZodRawShape>>(
    schema: S,
    requiredKeys: (keyof S['shape'])[]
  ): ZodObject<ZodRawShape> => {
    const partial = schema.partial(),
      required = Object.fromEntries(requiredKeys.map(k => [k, true])) as Record<string, true>
    return partial.required(required) as ZodObject<ZodRawShape>
  },
  defaultValues = <S extends ZodObject<ZodRawShape>>(schema: S): output<S> => {
    const result: Record<string, unknown> = {}
    // biome-ignore lint/nursery/noForIn: iterating shape keys with hasOwn guard
    for (const k in schema.shape) if (Object.hasOwn(schema.shape, k)) result[k] = defaultValue(schema.shape[k])
    return result as output<S>
  },
  pickValues = <S extends ZodObject<ZodRawShape>>(schema: S, doc: object): output<S> => {
    const d = doc as Record<string, unknown>,
      result: Record<string, unknown> = {}
    // biome-ignore lint/nursery/noForIn: iterating shape keys with hasOwn guard
    for (const k in schema.shape) if (Object.hasOwn(schema.shape, k)) result[k] = d[k] ?? defaultValue(schema.shape[k])
    return result as output<S>
  },
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

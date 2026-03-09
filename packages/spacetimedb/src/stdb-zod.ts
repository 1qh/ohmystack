import type { ZodObject, ZodRawShape, ZodType } from 'zod/v4'

import { array, boolean, number, object, string, unknown, uuid, enum as zenum } from 'zod/v4'

interface RuntimeBuilder {
  algebraicType?: unknown
  columnMetadata?: unknown
  element?: unknown
  elements?: unknown
  name?: string
  tag?: string
  typeBuilder?: unknown
  value?: unknown
  variants?: unknown
}

interface ZodFromTableOptions {
  exclude?: string[]
  include?: string[]
  optional?: string[]
}

const NUMBER_TAGS = new Set([
    'F32',
    'F64',
    'I8',
    'I16',
    'I32',
    'I64',
    'I128',
    'I256',
    'U8',
    'U16',
    'U32',
    'U64',
    'U128',
    'U256'
  ]),
  
  isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null,
  toBuilder = (v: unknown): RuntimeBuilder => (isRecord(v) ? (v as RuntimeBuilder) : {}),
  toTypeBuilder = (v: unknown): RuntimeBuilder => {
    const b = toBuilder(v),
      { typeBuilder } = b,
      inner = toBuilder(typeBuilder),
      { algebraicType } = inner
    if (algebraicType !== undefined) return inner
    return b
  },
  getTag = (v: unknown): string => {
    const { algebraicType } = toTypeBuilder(v),
      { tag } = toBuilder(algebraicType)
    if (typeof tag === 'string') return tag
    return ''
  },
  getColumnMetadata = (v: unknown): Record<string, unknown> => {
    const { columnMetadata: m } = toBuilder(v)
    if (isRecord(m)) return m
    return {}
  },
  hasTypeBuilder = (v: unknown): boolean => isRecord(v) && 'typeBuilder' in v,
  isIdentityLike = (v: unknown): boolean => {
    const tb = toTypeBuilder(v),
      { algebraicType } = tb,
      at = toBuilder(algebraicType),
      { tag, value } = at
    if (tag !== 'Product') return false
    const { elements } = toBuilder(value)
    if (!Array.isArray(elements)) return false
    for (const el of elements) {
      const { name } = toBuilder(el)
      if (name === '__identity__') return true
    }
    return false
  },
  isTimestampLike = (v: unknown): boolean => {
    const tb = toTypeBuilder(v),
      { algebraicType } = tb,
      at = toBuilder(algebraicType),
      { tag, value } = at
    if (tag !== 'Product') return false
    const { elements } = toBuilder(value)
    if (!Array.isArray(elements)) return false
    for (const el of elements) {
      const { name } = toBuilder(el)
      if (name === '__timestamp_micros_since_unix_epoch__') return true
    }
    return false
  },
  isConnectionIdLike = (v: unknown): boolean => {
    const tb = toTypeBuilder(v),
      { algebraicType } = tb,
      at = toBuilder(algebraicType),
      { tag, value } = at
    if (tag !== 'Product') return false
    const { elements } = toBuilder(value)
    if (!Array.isArray(elements)) return false
    for (const el of elements) {
      const { name } = toBuilder(el)
      if (name === '__connection_id__') return true
    }
    return false
  },
  isUuidLike = (v: unknown): boolean => {
    const tb = toTypeBuilder(v),
      { algebraicType } = tb,
      at = toBuilder(algebraicType),
      { tag, value } = at
    if (tag !== 'Product') return false
    const { elements } = toBuilder(value)
    if (!Array.isArray(elements) || elements.length !== 1) return false
    const { name } = toBuilder(elements[0])
    return name === '__uuid__'
  },
  isOptionBuilder = (v: unknown): boolean => {
    const b = toBuilder(toTypeBuilder(v)),
      { value } = b
    return isRecord(value) && 'algebraicType' in value
  },
  isArrayBuilder = (v: unknown): boolean => {
    const b = toBuilder(toTypeBuilder(v)),
      { element } = b
    return getTag(v) === 'Array' && isRecord(element) && 'algebraicType' in element
  },
  toVariantNames = (variants: Record<string, unknown>): string[] => {
    const names: string[] = []
    for (const k of Object.keys(variants)) names.push(k)
    return names
  },
  isUnitVariant = (v: unknown): boolean => {
    const b = toBuilder(v),
      { algebraicType } = b,
      at = toBuilder(algebraicType),
      { tag, value } = at
    if (tag !== 'Product') return false
    const { elements } = toBuilder(value)
    return Array.isArray(elements) && elements.length === 0
  },
  
  sumEnumSchema = (v: unknown): ZodType => {
    const { variants } = toBuilder(toTypeBuilder(v))
    if (!isRecord(variants)) return unknown()
    const names = toVariantNames(variants)
    if (names.length === 0) return unknown()
    for (const k of names) if (!isUnitVariant(variants[k])) return unknown()

    return object({ tag: zenum(names as [string, ...string[]]) })
  },
  
  scalarSchemaFromTag = (tag: string): undefined | ZodType => {
    if (tag === 'String') return string()
    if (tag === 'Bool') return boolean()
    if (NUMBER_TAGS.has(tag)) return number()
  },
  
  optionSchemaFromBuilder = (v: unknown, visit: (x: unknown) => ZodType): undefined | ZodType => {
    if (!isOptionBuilder(v)) return
    const { value: inner } = toBuilder(toTypeBuilder(v))
    return visit(inner).optional()
  },
  
  arraySchemaFromBuilder = (v: unknown, visit: (x: unknown) => ZodType): undefined | ZodType => {
    if (!isArrayBuilder(v)) return
    const { element: inner } = toBuilder(toTypeBuilder(v))
    return array(visit(inner))
  },
  
  productSchema = (v: unknown, visit: (x: unknown) => ZodType): ZodType => {
    const b = toTypeBuilder(v),
      { elements: elementsObj } = toBuilder(b)
    if (!isRecord(elementsObj)) return unknown()
    const shape = {} as unknown as Record<string, ZodType>
    for (const k of Object.keys(elementsObj)) shape[k] = visit(elementsObj[k])
    return object(shape)
  },
  
  schemaFromBuilder = (v: unknown): ZodType => {
    const optionSchema = optionSchemaFromBuilder(v, schemaFromBuilder)
    if (optionSchema) return optionSchema
    const arraySchema = arraySchemaFromBuilder(v, schemaFromBuilder)
    if (arraySchema) return arraySchema
    if (isUuidLike(v)) return uuid()
    const tag = getTag(v),
      scalar = scalarSchemaFromTag(tag)
    if (scalar) return scalar
    if (tag === 'Sum') return sumEnumSchema(v)
    if (tag === 'Product') return productSchema(v, schemaFromBuilder)
    return unknown()
  },
  
  shouldExcludeByDefault = (v: unknown): boolean => {
    if (isIdentityLike(v) || isTimestampLike(v) || isConnectionIdLike(v)) return true
    if (!hasTypeBuilder(v)) return false
    const m = getColumnMetadata(v)
    if (m.isAutoIncrement === true || m.isPrimaryKey === true) return true
    return false
  },
  
  zodFromTable = (columns: Record<string, unknown>, options: ZodFromTableOptions = {}): ZodObject<ZodRawShape> => {
    const includeSet = new Set(options.include),
      excludeSet = new Set(options.exclude),
      optionalSet = new Set(options.optional),
      hasInclude = includeSet.size > 0,
      shape = {} as unknown as Record<string, ZodType>
    for (const key of Object.keys(columns)) {
      const inInclude = includeSet.has(key),
        explicitlyExcluded = excludeSet.has(key),
        skippedByInclude = hasInclude && !inInclude,
        shouldSkip = skippedByInclude || explicitlyExcluded
      if (!shouldSkip) {
        const builder = columns[key],
          blockedByDefault = shouldExcludeByDefault(builder)
        if (!(blockedByDefault && !inInclude)) {
          const base = schemaFromBuilder(builder)
          shape[key] = optionalSet.has(key) ? base.optional() : base
        }
      }
    }
    return object(shape)
  }

export type { ZodFromTableOptions }
export { zodFromTable }

import type { ZodObject, ZodType } from 'zod/v4'
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
/** Options for selecting and shaping fields when deriving Zod from table metadata. */
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
])
/** Narrows unknown values to plain records. */
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const toBuilder = (v: unknown): RuntimeBuilder => (isRecord(v) ? v : {})
const toTypeBuilder = (v: unknown): RuntimeBuilder => {
  const b = toBuilder(v)
  const { typeBuilder } = b
  const inner = toBuilder(typeBuilder)
  const { algebraicType } = inner
  if (algebraicType !== undefined) return inner
  return b
}
const getTag = (v: unknown): string => {
  const { algebraicType } = toTypeBuilder(v)
  const { tag } = toBuilder(algebraicType)
  if (typeof tag === 'string') return tag
  return ''
}
const getColumnMetadata = (v: unknown): Record<string, unknown> => {
  const { columnMetadata: m } = toBuilder(v)
  if (isRecord(m)) return m
  return {}
}
const hasTypeBuilder = (v: unknown): boolean => isRecord(v) && 'typeBuilder' in v
const isIdentityLike = (v: unknown): boolean => {
  const tb = toTypeBuilder(v)
  const { algebraicType } = tb
  const at = toBuilder(algebraicType)
  const { tag, value } = at
  if (tag !== 'Product') return false
  const { elements } = toBuilder(value)
  if (!Array.isArray(elements)) return false
  for (const el of elements) {
    const { name } = toBuilder(el)
    if (name === '__identity__') return true
  }
  return false
}
const isTimestampLike = (v: unknown): boolean => {
  const tb = toTypeBuilder(v)
  const { algebraicType } = tb
  const at = toBuilder(algebraicType)
  const { tag, value } = at
  if (tag !== 'Product') return false
  const { elements } = toBuilder(value)
  if (!Array.isArray(elements)) return false
  for (const el of elements) {
    const { name } = toBuilder(el)
    if (name === '__timestamp_micros_since_unix_epoch__') return true
  }
  return false
}
const isConnectionIdLike = (v: unknown): boolean => {
  const tb = toTypeBuilder(v)
  const { algebraicType } = tb
  const at = toBuilder(algebraicType)
  const { tag, value } = at
  if (tag !== 'Product') return false
  const { elements } = toBuilder(value)
  if (!Array.isArray(elements)) return false
  for (const el of elements) {
    const { name } = toBuilder(el)
    if (name === '__connection_id__') return true
  }
  return false
}
const isUuidLike = (v: unknown): boolean => {
  const tb = toTypeBuilder(v)
  const { algebraicType } = tb
  const at = toBuilder(algebraicType)
  const { tag, value } = at
  if (tag !== 'Product') return false
  const { elements } = toBuilder(value)
  if (!Array.isArray(elements) || elements.length !== 1) return false
  const { name } = toBuilder(elements[0])
  return name === '__uuid__'
}
const isOptionBuilder = (v: unknown): boolean => {
  const b = toBuilder(toTypeBuilder(v))
  const { value } = b
  return isRecord(value) && 'algebraicType' in value
}
const isArrayBuilder = (v: unknown): boolean => {
  const b = toBuilder(toTypeBuilder(v))
  const { element } = b
  return getTag(v) === 'Array' && isRecord(element) && 'algebraicType' in element
}
const toVariantNames = (variants: Record<string, unknown>): string[] => {
  const names: string[] = []
  for (const k of Object.keys(variants)) names.push(k)
  return names
}
const isUnitVariant = (v: unknown): boolean => {
  const b = toBuilder(v)
  const { algebraicType } = b
  const at = toBuilder(algebraicType)
  const { tag, value } = at
  if (tag !== 'Product') return false
  const { elements } = toBuilder(value)
  return Array.isArray(elements) && elements.length === 0
}
/** Builds a tag-only schema for unit-variant sum types. */
const sumEnumSchema = (v: unknown): ZodType => {
  const { variants } = toBuilder(toTypeBuilder(v))
  if (!isRecord(variants)) return unknown()
  const names = toVariantNames(variants)
  if (names.length === 0) return unknown()
  for (const k of names) if (!isUnitVariant(variants[k])) return unknown()
  return object({ tag: zenum(names as [string, ...string[]]) })
}
/** Maps scalar SpacetimeDB tags to primitive Zod schemas. */
const scalarSchemaFromTag = (tag: string): undefined | ZodType => {
  if (tag === 'String') return string()
  if (tag === 'Bool') return boolean()
  if (NUMBER_TAGS.has(tag)) return number()
}
/** Converts option builders into optional schemas. */
const optionSchemaFromBuilder = (v: unknown, visit: (x: unknown) => ZodType): undefined | ZodType => {
  if (!isOptionBuilder(v)) return
  const { value: inner } = toBuilder(toTypeBuilder(v))
  return visit(inner).optional()
}
/** Converts array builders into array schemas. */
const arraySchemaFromBuilder = (v: unknown, visit: (x: unknown) => ZodType): undefined | ZodType => {
  if (!isArrayBuilder(v)) return
  const { element: inner } = toBuilder(toTypeBuilder(v))
  return array(visit(inner))
}
/** Recursively converts product builders into object schemas. */
const productSchema = (v: unknown, visit: (x: unknown) => ZodType): ZodType => {
  const b = toTypeBuilder(v)
  const { elements: elementsObj } = toBuilder(b)
  if (!isRecord(elementsObj)) return unknown()
  const shape: Record<string, ZodType> = {}
  for (const k of Object.keys(elementsObj)) shape[k] = visit(elementsObj[k])
  return object(shape)
}
/** Converts a runtime SpacetimeDB type builder into a Zod schema. */
const schemaFromBuilder = (v: unknown): ZodType => {
  const optionSchema = optionSchemaFromBuilder(v, schemaFromBuilder)
  if (optionSchema) return optionSchema
  const arraySchema = arraySchemaFromBuilder(v, schemaFromBuilder)
  if (arraySchema) return arraySchema
  if (isUuidLike(v)) return uuid()
  const tag = getTag(v)
  const scalar = scalarSchemaFromTag(tag)
  if (scalar) return scalar
  if (tag === 'Sum') return sumEnumSchema(v)
  if (tag === 'Product') return productSchema(v, schemaFromBuilder)
  return unknown()
}
/** Applies noboil defaults for excluding internal or generated fields. */
const shouldExcludeByDefault = (v: unknown): boolean => {
  if (isIdentityLike(v) || isTimestampLike(v) || isConnectionIdLike(v)) return true
  if (!hasTypeBuilder(v)) return false
  const m = getColumnMetadata(v)
  if (m.isAutoIncrement === true || m.isPrimaryKey === true) return true
  return false
}
/** Builds a Zod object schema from SpacetimeDB column metadata.
 * @param columns - Runtime table columns metadata
 * @param options - Include/exclude/optional field controls
 * @returns Derived Zod object schema
 * @example
 * ```ts
 * const schema = zodFromTable(module.table.columns, { optional: ['bio'] })
 * ```
 */
const zodFromTable = (columns: Record<string, unknown>, options: ZodFromTableOptions = {}): ZodObject => {
  const includeSet = new Set(options.include)
  const excludeSet = new Set(options.exclude)
  const optionalSet = new Set(options.optional)
  const hasInclude = includeSet.size > 0
  const shape: Record<string, ZodType> = {}
  for (const key of Object.keys(columns)) {
    const inInclude = includeSet.has(key)
    const explicitlyExcluded = excludeSet.has(key)
    const skippedByInclude = hasInclude && !inInclude
    const shouldSkip = skippedByInclude || explicitlyExcluded
    if (!shouldSkip) {
      const builder = columns[key]
      const blockedByDefault = shouldExcludeByDefault(builder)
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

import { describe, expect, test } from 'bun:test'
import { array, boolean, date, number, object, optional, string, enum as zenum } from 'zod/v4'
import {
  coerceOptionals,
  defaultValues,
  enumToOptions,
  fileKindOf,
  isArrayType,
  isBooleanType,
  isDateType,
  isNumberType,
  isOptionalField,
  isStringType,
  pickValues,
  unwrapZod,
  validateSchemas
} from '../zod'
const VOID = undefined
const file = () => string().meta({ nb: 'file' as const })
const files = () => array(file()).meta({ nb: 'files' as const })
describe('unwrapZod', () => {
  test('plain string', () => {
    const r = unwrapZod(string())
    expect(r.type).toBe('string')
    expect(r.schema).toBeDefined()
    expect(r.def).toBeDefined()
  })
  test('optional(string)', () => {
    const r = unwrapZod(optional(string()))
    expect(r.type).toBe('string')
  })
  test('nullable(optional(string))', () => {
    const r = unwrapZod(string().nullable().optional())
    expect(r.type).toBe('string')
  })
  test('number', () => {
    expect(unwrapZod(number()).type).toBe('number')
  })
  test('boolean', () => {
    expect(unwrapZod(boolean()).type).toBe('boolean')
  })
  test('array(string)', () => {
    expect(unwrapZod(array(string())).type).toBe('array')
  })
  test('enum', () => {
    expect(unwrapZod(zenum(['a', 'b'])).type).toBe('enum')
  })
  test('undefined input', () => {
    const r = unwrapZod(VOID)
    expect(r.type).toBe('')
    expect(r.schema).toBeUndefined()
    expect(r.def).toBeUndefined()
  })
  test('non-schema input', () => {
    const r = unwrapZod(42)
    expect(r.type).toBe('')
  })
})
describe('isOptionalField', () => {
  test('required string is not optional', () => {
    expect(isOptionalField(string())).toBe(false)
  })
  test('optional string is optional', () => {
    expect(isOptionalField(optional(string()))).toBe(true)
  })
  test('nullable(optional(string)) is optional', () => {
    expect(isOptionalField(string().nullable().optional())).toBe(true)
  })
  test('nullable without optional is not optional', () => {
    expect(isOptionalField(string().nullable())).toBe(false)
  })
  test('undefined input', () => {
    expect(isOptionalField(VOID)).toBe(false)
  })
})
describe('fileKindOf', () => {
  test('file() returns file', () => {
    expect(fileKindOf(file())).toBe('file')
  })
  test('files() returns files', () => {
    expect(fileKindOf(files())).toBe('files')
  })
  test('optional(file()) returns file', () => {
    expect(fileKindOf(file().optional())).toBe('file')
  })
  test('nullable(file()) returns file', () => {
    expect(fileKindOf(file().nullable())).toBe('file')
  })
  test('array(file()) returns files', () => {
    expect(fileKindOf(array(file()))).toBe('files')
  })
  test('regular string returns undefined', () => {
    expect(fileKindOf(string())).toBeUndefined()
  })
  test('regular number returns undefined', () => {
    expect(fileKindOf(number())).toBeUndefined()
  })
})
describe('defaultValues', () => {
  const schema = object({
    active: boolean(),
    category: zenum(['tech', 'life', 'food']),
    count: number(),
    tags: array(string()),
    title: string()
  })
  test('generates correct defaults for all field types', () => {
    const defaults = defaultValues(schema)
    expect(defaults).toEqual({
      active: false,
      category: 'tech',
      count: 0,
      tags: [],
      title: ''
    })
  })
  test('file fields default to null', () => {
    const s = object({ photo: file().nullable() })
    expect(defaultValues(s)).toEqual({ photo: null })
  })
  test('files fields default to empty array', () => {
    const s = object({ attachments: files() })
    expect(defaultValues(s)).toEqual({ attachments: [] })
  })
  test('date fields default to null', () => {
    const s = object({ createdAt: date() })
    const result = defaultValues(s)
    expect(result.createdAt).toBeNull()
  })
})
describe('pickValues', () => {
  const schema = object({
    price: number(),
    title: string()
  })
  test('extracts matching fields from doc', () => {
    const doc = { _id: '123', extra: true, price: 42, title: 'hello' }
    expect(pickValues(schema, doc)).toEqual({ price: 42, title: 'hello' })
  })
  test('falls back to defaults for missing fields', () => {
    const doc = { _id: '123', title: 'hello' }
    expect(pickValues(schema, doc)).toEqual({ price: 0, title: 'hello' })
  })
  test('ignores extra fields', () => {
    const doc = { foo: 'bar', price: 10, title: 'test', userId: 'u1' }
    const result = pickValues(schema, doc)
    expect(result).toEqual({ price: 10, title: 'test' })
    expect('foo' in result).toBe(false)
    expect('userId' in result).toBe(false)
  })
})
describe('coerceOptionals', () => {
  const schema = object({
    name: string(),
    note: optional(string())
  })
  test('empty string on optional field becomes undefined', () => {
    const data = { name: 'test', note: '' }
    const result = coerceOptionals(schema, data)
    expect(result.name).toBe('test')
    expect(result.note).toBeUndefined()
  })
  test('whitespace-only on optional field becomes undefined', () => {
    const data = { name: 'test', note: '   ' }
    expect(coerceOptionals(schema, data).note).toBeUndefined()
  })
  test('non-empty optional string stays and is trimmed', () => {
    const data = { name: 'test', note: ' hello ' }
    expect(coerceOptionals(schema, data).note).toBe('hello')
  })
  test('required string field is untouched', () => {
    const data = { name: '', note: 'x' }
    expect(coerceOptionals(schema, data).name).toBe('')
  })
  test('non-string optional field is untouched', () => {
    const s = object({ count: optional(number()) })
    const data = { count: 0 }
    expect(coerceOptionals(s, data).count).toBe(0)
  })
})
describe('enumToOptions', () => {
  const schema = zenum(['draft', 'published', 'archived'])
  test('generates options with capitalized labels', () => {
    const opts = enumToOptions(schema)
    expect(opts).toEqual([
      { label: 'Draft', value: 'draft' },
      { label: 'Published', value: 'published' },
      { label: 'Archived', value: 'archived' }
    ])
  })
  test('uses custom transform', () => {
    const opts = enumToOptions(schema, v => v.toUpperCase())
    expect(opts).toEqual([
      { label: 'DRAFT', value: 'draft' },
      { label: 'PUBLISHED', value: 'published' },
      { label: 'ARCHIVED', value: 'archived' }
    ])
  })
})
describe('type checks', () => {
  test('isStringType', () => {
    expect(isStringType('string')).toBe(true)
    expect(isStringType('enum')).toBe(true)
    expect(isStringType('number')).toBe(false)
    expect(isStringType('')).toBe(false)
  })
  test('isNumberType', () => {
    expect(isNumberType('number')).toBe(true)
    expect(isNumberType('string')).toBe(false)
  })
  test('isBooleanType', () => {
    expect(isBooleanType('boolean')).toBe(true)
    expect(isBooleanType('string')).toBe(false)
  })
  test('isArrayType', () => {
    expect(isArrayType('array')).toBe(true)
    expect(isArrayType('string')).toBe(false)
  })
  test('isDateType', () => {
    expect(isDateType('date')).toBe(true)
    expect(isDateType('string')).toBe(false)
  })
})
describe('validateSchemas', () => {
  test('passes for plain types', () => {
    expect(() =>
      validateSchemas({
        blog: object({ published: boolean(), tags: array(string()), title: string() })
      })
    ).not.toThrow()
  })
  test('throws for pipe type', () => {
    const s = object({ val: string().pipe(string()) })
    expect(() => validateSchemas({ bad: s })).toThrow('Unsupported Zod types')
  })
  test('throws for transform type', () => {
    const s = object({ val: string().transform(v => v.toUpperCase()) })
    expect(() => validateSchemas({ bad: s })).toThrow('Unsupported Zod types')
  })
  test('error message includes field path', () => {
    const s = object({ nested: object({ deep: string().pipe(string()) }) })
    expect(() => validateSchemas({ tbl: s })).toThrow('tbl.nested.deep')
  })
  test('skips non-schema entries', () => {
    expect(() => validateSchemas({ child: { foreignKey: 'blogId', parent: 'blog' } })).not.toThrow()
  })
})

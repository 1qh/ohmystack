/* eslint-disable @typescript-eslint/no-use-before-define */
import type { output, ZodObject, ZodRawShape, ZodType } from 'zod/v4'

import { cvFileKindOf, isArrayType, isBooleanType, isNumberType, isOptionalField, isStringType, unwrapZod } from './zod'

const ALPHA = 'abcdefghijklmnopqrstuvwxyz',
  DIGITS = '0123456789',
  WORDS = [
    'alpha',
    'bravo',
    'charlie',
    'delta',
    'echo',
    'foxtrot',
    'golf',
    'hotel',
    'india',
    'juliet',
    'kilo',
    'lima',
    'mike',
    'november',
    'oscar',
    'papa',
    'quebec',
    'romeo',
    'sierra',
    'tango',
    'uniform',
    'victor',
    'whiskey',
    'xray',
    'yankee',
    'zulu'
  ],
  /** Generates a random integer between min and max (inclusive). */
  randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min,
  /** Randomly selects an element from an array. */
  randomPick = <T>(arr: readonly T[]): T => arr[randomInt(0, arr.length - 1)] as T,
  /** Generates a random string of specified length from given characters. */
  randomChars = (len: number, chars: string): string => {
    let result = ''
    for (let i = 0; i < len; i += 1) result += chars[randomInt(0, chars.length - 1)]
    return result
  },
  /** Generates a random word from the word list. */
  randomWord = (): string => randomPick(WORDS),
  /** Generates a random sentence with at least minWords words. */
  randomSentence = (minWords: number): string => {
    const count = Math.max(minWords, randomInt(3, 8)),
      words: string[] = []
    for (let i = 0; i < count; i += 1) words.push(randomWord())
    const sentence = words.join(' ')
    return sentence.charAt(0).toUpperCase() + sentence.slice(1)
  },
  /** Generates a random Convex storage ID. */
  randomStorageId = (): string => `_storage:${randomChars(16, ALPHA + DIGITS)}`,
  /** Generates a random Convex table ID for the given table name. */
  randomTableId = (table: string): string => `${table}:${randomChars(16, ALPHA + DIGITS)}`,
  /** Extracts the minimum length constraint from a Zod schema. */
  getMinLength = (schema: ZodType): number => {
    const checks = (schema as { _zod?: { bag?: { checks?: { kind: string; value: number }[] } } })._zod?.bag?.checks
    if (!checks) return 0
    for (const check of checks) if (check.kind === 'min_length') return check.value
    return 0
  },
  /** Extracts enum options from a Zod schema. */
  getEnumOptions = (schema: ZodType): readonly string[] | undefined => {
    const opts = (schema as { options?: readonly string[] }).options
    return opts && opts.length > 0 ? opts : undefined
  },
  /** Generates a random string value for a Zod schema field. */
  generateStringValue = (base: undefined | ZodType): string => {
    const opts = base ? getEnumOptions(base) : undefined
    if (opts) return randomPick(opts)
    const minLen = base ? getMinLength(base) : 0
    return randomSentence(Math.max(1, Math.ceil(minLen / 5)))
  },
  /** Generates a random array value for a Zod schema field. */
  generateArrayValue = (base: undefined | ZodType): unknown[] => {
    const element = (base?.def as undefined | { element?: ZodType })?.element
    if (!element) return []
    const count = randomInt(1, 3),
      items: unknown[] = []
    for (let i = 0; i < count; i += 1) items.push(generateFieldValue(element))
    return items
  },
  /** Generates a random value for any Zod schema field. */
  generateFieldValue = (field: ZodType): unknown => {
    const cv = cvFileKindOf(field)
    if (cv === 'file') return randomStorageId()
    if (cv === 'files') return [randomStorageId(), randomStorageId()]

    const { schema: base, type } = unwrapZod(field)

    if (isBooleanType(type)) return Math.random() > 0.5
    if (isNumberType(type)) return randomInt(1, 1000)
    if (isStringType(type)) return generateStringValue(base)
    if (isArrayType(type)) return generateArrayValue(base)

    if (type === 'object') {
      const shape = (base as undefined | ZodObject<ZodRawShape>)?.shape
      if (shape) return generateOne(base as ZodObject<ZodRawShape>)
      return {}
    }

    const zidTable = (base?.def as undefined | { schema?: { description?: string } })?.schema?.description
    if (zidTable) return randomTableId(zidTable)

    return randomSentence(1)
  },
  /** Generates a single random document matching the Zod schema. */
  generateOne = <S extends ZodRawShape>(schema: ZodObject<S>): output<ZodObject<S>> => {
    const result: Record<string, unknown> = {}
    for (const k of Object.keys(schema.shape)) {
      const field = schema.shape[k] as ZodType
      if (isOptionalField(field)) result[k] = Math.random() > 0.3 ? generateFieldValue(field) : undefined
      else result[k] = generateFieldValue(field)
    }
    return result as output<ZodObject<S>>
  },
  /** Generates multiple random documents matching the Zod schema. */
  generateSeed = <S extends ZodRawShape>(schema: ZodObject<S>, count = 1): output<ZodObject<S>>[] => {
    const results: output<ZodObject<S>>[] = []
    for (let i = 0; i < count; i += 1) results.push(generateOne(schema))
    return results
  }

export { generateFieldValue, generateOne, generateSeed }

/* eslint-disable @typescript-eslint/no-use-before-define */
/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
/* oxlint-disable eslint(no-underscore-dangle) */
import type { output, ZodObject, ZodRawShape, ZodType } from 'zod/v4'
interface SeedHelpers<TFieldType, TSchemaInput> {
  fileKindOf: (field: TSchemaInput) => unknown
  isArrayType: (type: TFieldType) => boolean
  isBooleanType: (type: TFieldType) => boolean
  isNumberType: (type: TFieldType) => boolean
  isOptionalField: (field: TSchemaInput) => boolean
  isStringType: (type: TFieldType) => boolean
  unwrapZod: (field: TSchemaInput) => { schema: undefined | ZodType; type: TFieldType }
}
interface SeedOptions {
  randomFileRef: () => string
  randomTableId: (tableName: string) => number | string
}
const WORDS = [
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
] as const
const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min
const randomPick = <T>(arr: readonly T[]): T => arr[randomInt(0, arr.length - 1)] as T
const randomWord = (): string => randomPick(WORDS)
const randomSentence = (minWords: number): string => {
  const count = Math.max(minWords, randomInt(3, 8))
  const words: string[] = []
  for (let i = 0; i < count; i += 1) words.push(randomWord())
  const sentence = words.join(' ')
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}
const getMinLength = (schema: ZodType): number => {
  const checks = (schema as { _zod?: { bag?: { checks?: { kind: string; value: number }[] } } })._zod?.bag?.checks
  if (!checks) return 0
  for (const check of checks) if (check.kind === 'min_length') return check.value
  return 0
}
const getEnumOptions = (schema: ZodType): readonly string[] | undefined => {
  const opts = (schema as { options?: readonly string[] }).options
  return opts && opts.length > 0 ? opts : undefined
}
const createSeedUtils = <TFieldType, TSchemaInput>(
  helpers: SeedHelpers<TFieldType, TSchemaInput>,
  options: SeedOptions
) => {
  const generateStringValue = (base: undefined | ZodType): string => {
    const opts = base ? getEnumOptions(base) : undefined
    if (opts) return randomPick(opts)
    const minLen = base ? getMinLength(base) : 0
    return randomSentence(Math.max(1, Math.ceil(minLen / 5)))
  }
  const generateArrayValue = (base: undefined | ZodType): unknown[] => {
    const element = (base?.def as undefined | { element?: ZodType })?.element
    if (!element) return []
    const count = randomInt(1, 3)
    const items: unknown[] = []
    for (let i = 0; i < count; i += 1) items.push(generateFieldValue(element))
    return items
  }
  const generateFieldValue = (field: ZodType): unknown => {
    const fk = helpers.fileKindOf(field as unknown as TSchemaInput)
    if (fk === 'file') return options.randomFileRef()
    if (fk === 'files') return [options.randomFileRef(), options.randomFileRef()]
    const { schema: base, type } = helpers.unwrapZod(field as unknown as TSchemaInput)
    if (helpers.isBooleanType(type)) return Math.random() > 0.5
    if (helpers.isNumberType(type)) return randomInt(1, 1000)
    if (helpers.isStringType(type)) return generateStringValue(base)
    if (helpers.isArrayType(type)) return generateArrayValue(base)
    if (type === 'object') {
      const shape = (base as undefined | ZodObject)?.shape
      if (shape) return generateOne(base as ZodObject)
      return {}
    }
    const zidTable = (base?.def as undefined | { schema?: { description?: string } })?.schema?.description
    if (zidTable) return options.randomTableId(zidTable)
    return randomSentence(1)
  }
  const generateOne = <S extends ZodRawShape>(schema: ZodObject<S>): output<ZodObject<S>> => {
    const result: Record<string, unknown> = {}
    for (const k of Object.keys(schema.shape)) {
      const field = schema.shape[k] as ZodType
      if (helpers.isOptionalField(field as unknown as TSchemaInput))
        result[k] = Math.random() > 0.3 ? generateFieldValue(field) : undefined
      else result[k] = generateFieldValue(field)
    }
    return result as output<ZodObject<S>>
  }
  const generateSeed = <S extends ZodRawShape>(schema: ZodObject<S>, count = 1): output<ZodObject<S>>[] => {
    const results: output<ZodObject<S>>[] = []
    for (let i = 0; i < count; i += 1) results.push(generateOne(schema))
    return results
  }
  return { generateFieldValue, generateOne, generateSeed }
}
export type { SeedHelpers, SeedOptions }
export { createSeedUtils }

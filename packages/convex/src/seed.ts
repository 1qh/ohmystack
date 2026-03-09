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
  randomPick = <T>(arr: readonly T[]): T => arr[randomInt(0, arr.length - 1)] as T,
  randomWord = (): string => randomPick(WORDS),
  randomStorageId = (): string => `_storage:${randomChars(16, ALPHA + DIGITS)}`,
  getMinLength = (schema: ZodType): number => {
    const checks = (schema as { _zod?: { bag?: { checks?: { kind: string; value: number }[] } } })._zod?.bag?.checks
    if (!checks) return 0
    for (const check of checks) if (check.kind === 'min_length') return check.value
    return 0
  },
  generateStringValue = (base: undefined | ZodType): string => {
    const opts = base ? getEnumOptions(base) : undefined
    if (opts) return randomPick(opts)
    const minLen = base ? getMinLength(base) : 0
    return randomSentence(Math.max(1, Math.ceil(minLen / 5)))
  },
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
  generateSeed = <S extends ZodRawShape>(schema: ZodObject<S>, count = 1): output<ZodObject<S>>[] => {
    const results: output<ZodObject<S>>[] = []
    for (let i = 0; i < count; i += 1) results.push(generateOne(schema))
    return results
  }

export { generateFieldValue, generateOne, generateSeed }

import { createSeedUtils } from '@a/shared/seed'
import { cvFileKindOf, isArrayType, isBooleanType, isNumberType, isOptionalField, isStringType, unwrapZod } from './zod'
const ALPHA = 'abcdefghijklmnopqrstuvwxyz',
  DIGITS = '0123456789',
  randomChars = (len: number, chars: string): string => {
    let result = ''
    for (let i = 0; i < len; i += 1) result += chars[Math.floor(Math.random() * chars.length)]
    return result
  },
  randomFileRef = (): string => `s3://uploads/${randomChars(24, ALPHA + DIGITS)}`,
  randomTableId = (): number => Math.floor(Math.random() * 1_000_000) + 1,
  { generateFieldValue, generateOne, generateSeed } = createSeedUtils(
    { cvFileKindOf, isArrayType, isBooleanType, isNumberType, isOptionalField, isStringType, unwrapZod },
    { randomFileRef, randomTableId }
  )
export { generateFieldValue, generateOne, generateSeed }

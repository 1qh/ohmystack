import { createSeedUtils } from '../shared/seed'
import { fileKindOf, isArrayType, isBooleanType, isNumberType, isOptionalField, isStringType, unwrapZod } from './zod'
const ALPHA = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const randomChars = (len: number, chars: string): string => {
  let result = ''
  for (let i = 0; i < len; i += 1) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}
const randomFileRef = (): string => `file://${randomChars(24, ALPHA + DIGITS)}`
const randomTableId = (): number => Math.floor(Math.random() * 1_000_000) + 1
const { generateFieldValue, generateOne, generateSeed } = createSeedUtils(
  { fileKindOf, isArrayType, isBooleanType, isNumberType, isOptionalField, isStringType, unwrapZod },
  { randomFileRef, randomTableId }
)
export { generateFieldValue, generateOne, generateSeed }

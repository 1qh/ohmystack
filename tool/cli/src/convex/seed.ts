import { createSeedUtils } from '../shared/seed'
import { fileKindOf, isArrayType, isBooleanType, isNumberType, isOptionalField, isStringType, unwrapZod } from './zod'
const ALPHA = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const randomChars = (len: number, chars: string): string => {
  let result = ''
  for (let i = 0; i < len; i += 1) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}
const randomStorageId = (): string => `_storage:${randomChars(16, ALPHA + DIGITS)}`
const randomTableId = (table: string): string => `${table}:${randomChars(16, ALPHA + DIGITS)}`
const { generateFieldValue, generateOne, generateSeed } = createSeedUtils(
  { fileKindOf, isArrayType, isBooleanType, isNumberType, isOptionalField, isStringType, unwrapZod },
  { randomFileRef: randomStorageId, randomTableId }
)
export { generateFieldValue, generateOne, generateSeed }

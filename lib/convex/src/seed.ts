import { createSeedUtils } from '@a/shared/seed'
import { cvFileKindOf, isArrayType, isBooleanType, isNumberType, isOptionalField, isStringType, unwrapZod } from './zod'
const ALPHA = 'abcdefghijklmnopqrstuvwxyz',
  DIGITS = '0123456789',
  randomChars = (len: number, chars: string): string => {
    let result = ''
    for (let i = 0; i < len; i += 1) result += chars[Math.floor(Math.random() * chars.length)]
    return result
  },
  randomStorageId = (): string => `_storage:${randomChars(16, ALPHA + DIGITS)}`,
  randomTableId = (table: string): string => `${table}:${randomChars(16, ALPHA + DIGITS)}`,
  { generateFieldValue, generateOne, generateSeed } = createSeedUtils(
    { cvFileKindOf, isArrayType, isBooleanType, isNumberType, isOptionalField, isStringType, unwrapZod },
    { randomFileRef: randomStorageId, randomTableId }
  )
export { generateFieldValue, generateOne, generateSeed }

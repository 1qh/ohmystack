import { createNumericId, createSeedUtils } from '@a/shared/seed'
import type { DefType } from './zod'
import { cvFileKindOf, isArrayType, isBooleanType, isNumberType, isOptionalField, isStringType, unwrapZod } from './zod'
const randomFileRef = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let suffix = ''
    for (let i = 0; i < 24; i += 1) suffix += chars[Math.floor(Math.random() * chars.length)]
    return `s3://uploads/${suffix}`
  },
  { generateFieldValue, generateOne, generateSeed } = createSeedUtils({
    cvFileKindOf,
    isArrayType: type => isArrayType(type as '' | DefType),
    isBooleanType: type => isBooleanType(type as '' | DefType),
    isNumberType: type => isNumberType(type as '' | DefType),
    isOptionalField,
    isStringType: type => isStringType(type as '' | DefType),
    randomFileRef,
    randomTableId: () => createNumericId(),
    unwrapZod
  })
export { generateFieldValue, generateOne, generateSeed }

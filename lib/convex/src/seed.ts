import { createSeedUtils, createStorageId, createTableId } from '@a/shared/seed'
import type { DefType } from './zod'
import { cvFileKindOf, isArrayType, isBooleanType, isNumberType, isOptionalField, isStringType, unwrapZod } from './zod'
const { generateFieldValue, generateOne, generateSeed } = createSeedUtils({
  cvFileKindOf,
  isArrayType: type => isArrayType(type as '' | DefType),
  isBooleanType: type => isBooleanType(type as '' | DefType),
  isNumberType: type => isNumberType(type as '' | DefType),
  isOptionalField,
  isStringType: type => isStringType(type as '' | DefType),
  randomFileRef: createStorageId,
  randomTableId: tableDescription => createTableId(tableDescription ?? 'table'),
  unwrapZod
})
export { generateFieldValue, generateOne, generateSeed }

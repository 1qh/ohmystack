/* oxlint-disable jsx-no-jsx-as-prop, jsx-no-new-object-as-prop, jsx-no-new-array-as-prop */
// oxlint-disable promise/prefer-await-to-then
// biome-ignore-all lint/performance/noImgElement: x
// biome-ignore-all lint/performance/noAwaitInLoops: x
// biome-ignore-all lint/suspicious/noExplicitAny: x
'use client'
import { createFieldsModule } from '@a/shared/components/fields'
import type { Api } from '../react/form'
import { unwrapZod } from '../zod'
import FileFieldImpl from './file-field'
const { deriveLabel, fields, FormContext, ServerFieldError } = createFieldsModule({
  dynamicFileField: FileFieldImpl,
  errors: {
    chooseNoEnum: name => `Choose: field "${name}" has no enum options. Pass options prop.`,
    fieldOutsideForm: 'Field must be inside <Form>',
    unknownField: ({ name }) => `Unknown field: ${name}`,
    wrongKind: ({ expected, name }) => `Field ${name} is not ${expected}`
  },
  unwrapZod
})
export type { Api }
export { deriveLabel, fields, FormContext, ServerFieldError }

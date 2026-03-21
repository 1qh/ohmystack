/* oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-object-as-prop, react-perf/jsx-no-new-array-as-prop */
// oxlint-disable promise/prefer-await-to-then
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// biome-ignore-all lint/performance/noImgElement: x
// biome-ignore-all lint/performance/noAwaitInLoops: x
// biome-ignore-all lint/suspicious/noExplicitAny: x
'use client'
import type { ReactNode } from 'react'
import type { AnyFieldApi } from '@tanstack/react-form'
import { createFieldsModule } from '@a/shared/components/fields'
import type { Api, FieldKind, FieldMetaMap } from '../react/form'
import FileFieldImpl from './file-field'
import { unwrapZod } from '../zod'

const { deriveLabel, fields, FormContext, ServerFieldError } = createFieldsModule({
    dynamicFileField: FileFieldImpl as unknown as (props: { field: AnyFieldApi }) => ReactNode,
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

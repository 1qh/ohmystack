/* oxlint-disable react-perf/jsx-no-jsx-as-prop */
// biome-ignore-all lint/nursery/noLeakedRender: conditional rendering
// oxlint-disable promise/prefer-await-to-then
// biome-ignore-all lint/performance/noImgElement: x
// biome-ignore-all lint/performance/noAwaitInLoops: x
// biome-ignore-all lint/suspicious/noExplicitAny: x
'use client'
import type { AnyFieldApi } from '@tanstack/react-form'
import type { ReactNode } from 'react'
import { createFieldsModule } from '@a/shared/components/fields'
import type { Api } from '../react/form'
import { unwrapZod } from '../zod'
import FileFieldImpl from './file-field'
const { deriveLabel, fields, FormContext, ServerFieldError } = createFieldsModule({
  defaultAsyncDebounceMs: 300,
  defaultRatingMax: 5,
  dynamicFileField: FileFieldImpl as unknown as (props: { field: AnyFieldApi }) => ReactNode,
  errors: {
    chooseNoEnum: name =>
      `[@noboil/spacetimedb] Choose: field "${name}" has no enum options. Define the field as z.enum(["opt1", "opt2"]) in your schema, or pass an explicit options={[{ label: "...", value: "..." }]} prop to <Choose>.`,
    fieldOutsideForm:
      '[@noboil/spacetimedb] Field must be inside <Form>. Wrap your field components with <Form schema={...}> from @noboil/spacetimedb/components.',
    unknownField: ({ available, name }: { available: string[]; name: string }) =>
      `[@noboil/spacetimedb] Unknown field: "${name}". Available fields: ${available.join(', ') || '(none)'}. Check your Zod schema — the field name must match a key in the schema passed to <Form>.`,
    wrongKind: ({ actual, expected, name }) =>
      `[@noboil/spacetimedb] Field "${name}" has kind "${actual}", but <${expected}> expects kind "${expected}". Use the field component that matches the schema type (e.g. z.string() -> <Text>, z.number() -> <Num>, z.boolean() -> <Toggle>, z.enum() -> <Choose>).`
  },
  unwrapZod
})
export type { Api }
export { deriveLabel, fields, FormContext, ServerFieldError }

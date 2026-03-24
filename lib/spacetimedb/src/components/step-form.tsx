/* oxlint-disable react/jsx-handler-names */
// biome-ignore-all lint/nursery/noLeakedRender: conditional rendering
// biome-ignore-all lint/correctness/useHookAtTopLevel: hooks called in component render context
// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'
import type { Stepper as CoreStepper, Step } from '@stepperize/core'
import type { ComponentProps, ReactNode } from 'react'
import type { output, ZodObject } from 'zod/v4'
import { createDefineSteps } from '@a/shared/components/step-form'
import type { TypedFields } from './form'
import { buildMeta } from '../react/form'
import { coerceOptionals, defaultValues as dv } from '../zod'
import { fields, FormContext } from './fields'
type ExtractSchema<Defs extends readonly StepDef[], Id extends string> = Extract<Defs[number], { id: Id }>['schema']
type InternalStep<Id extends string = string> = Step<Id, { label: string; schema: ZodObject }>
type StepDataMap<Defs extends readonly StepDef[]> = {
  [D in Defs[number] as D['id']]: output<D['schema']>
}
interface StepDef<Id extends string = string, S extends ZodObject = ZodObject> {
  id: Id
  label: string
  schema: S
}
interface StepFormProps<Defs extends readonly StepDef[]> extends Omit<ComponentProps<'div'>, 'children'> {
  children: ReactNode
  indicator?: boolean
  nextLabel?: string
  prevLabel?: string
  stepIndicatorClassNames?: StepIndicatorClassNames
  stepper: StepperReturn<Defs>
  submitLabel?: string
}
type StepIds<Defs extends readonly StepDef[]> = Defs[number]['id']
interface StepIndicatorClassNames {
  button?: string
  label?: string
  nav?: string
  separator?: string
  step?: string
}
interface StepperReturn<Defs extends readonly StepDef[]> {
  error: Error | null
  inner: CoreStepper<InternalStep[]>
  isCompleted: boolean
  isPending: boolean
  schemas: Record<string, ZodObject>
  steps: InternalStep[]
  submitAll: (data: Record<string, Record<string, unknown>>) => Promise<void>
  values: Partial<{ [D in Defs[number] as D['id']]?: output<D['schema']> }>
}
interface StepProps<Defs extends readonly StepDef[], Id extends StepIds<Defs> = StepIds<Defs>> {
  id: Id
  render: (fields: TypedFields<output<ExtractSchema<Defs, Id>>>) => ReactNode
}
interface UseStepperOpts<Defs extends readonly StepDef[]> {
  onError?: (e: unknown) => void
  onSubmit: (data: StepDataMap<Defs>) => Promise<void> | void
  onSuccess?: () => void
  values?: Partial<{ [D in Defs[number] as D['id']]?: output<D['schema']> }>
}
const defineStepsBase = createDefineSteps<TypedFields<Record<string, unknown>>>({
    buildMeta,
    coerceOptionals,
    defaultValues: dv,
    fields: fields as TypedFields<Record<string, unknown>>,
    onFinalSubmitError: (error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[@noboil/spacetimedb] Step form final submission failed:', error)
    },
    renderFormContext: ({ children, value }) => <FormContext value={value as never}>{children}</FormContext>
  }),
  defineSteps = defineStepsBase as <const Defs extends readonly [StepDef, ...StepDef[]]>(
    ...defs: Defs
  ) => {
    StepForm: (<D extends Defs>(props: StepFormProps<D>) => ReactNode) & {
      Step: <Id extends StepIds<Defs>>(props: StepProps<Defs, Id>) => null | ReactNode
    }
    steps: InternalStep[]
    useStepper: (opts: UseStepperOpts<Defs>) => StepperReturn<Defs>
  }
export { defineSteps }

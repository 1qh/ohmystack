'use client'
import { createDefineSteps } from '@a/shared/components/step-form'
import { buildMeta } from '../react/form'
import { coerceOptionals, defaultValues } from '../zod'
import { fields, FormContext } from './fields'
const defineSteps = createDefineSteps({
  FormContext: FormContext as never,
  buildMeta,
  coerceOptionals,
  defaultValues,
  fields
})
export { defineSteps }

// biome-ignore-all lint/correctness/useHookAtTopLevel: watch hook is called inside component render context
'use client'
import type { FunctionReference } from 'convex/server'
import type { output, ZodObject } from 'zod/v4'
import { useMutation } from 'convex/react'
import type { Api, ConflictData, FieldKind, FieldMeta, FieldMetaMap, FormReturn } from '../../shared/react/form'
import { buildMeta, createUseForm, getMeta } from '../../shared/react/form'
import { extractErrorData, getErrorCode, getErrorMessage, isRecord } from '../server/helpers'
import { defaultOnError } from './use-mutate'
const useForm = createUseForm({ defaultOnError, extractErrorData, getErrorCode, getErrorMessage, isRecord })
const useFormMutation = <S extends ZodObject>({
  autoSave,
  mutation: mutationRef,
  onConflict,
  onError,
  onSuccess,
  resetOnSuccess = true,
  schema,
  transform,
  values
}: {
  autoSave?: { debounceMs: number; enabled: boolean }
  mutation: FunctionReference<'mutation'>
  onConflict?: (data: ConflictData<output<S>>) => void
  onError?: ((e: unknown) => void) | false
  onSuccess?: () => void
  resetOnSuccess?: boolean
  schema: S
  transform?: (d: output<S>) => Record<string, unknown>
  values?: output<S>
}) => {
  const mutate = useMutation(mutationRef)
  return useForm({
    autoSave,
    onConflict,
    onError,
    onSubmit: async (d: output<S>) => {
      const args = transform ? transform(d) : d
      await mutate(args)
      return d
    },
    onSuccess,
    resetOnSuccess,
    schema,
    values
  })
}
export type { Api, ConflictData, FieldKind, FieldMeta, FieldMetaMap, FormReturn }
export { buildMeta, getMeta, useForm, useFormMutation }

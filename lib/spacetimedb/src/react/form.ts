'use client'
import type {
  Api,
  ConflictData,
  FieldKind,
  FieldMeta,
  FieldMetaMap,
  FormReturn,
  FormToastOption,
  Widen
} from '@noboil/shared/react/form'
import type { output, ZodObject } from 'zod/v4'
import { buildMeta, createUseForm, getMeta, resolveFormToast } from '@noboil/shared/react/form'
import type { UndefinedToOptional } from '../zod'
import { extractErrorData, getErrorCode, getErrorMessage, isRecord } from '../server/helpers'
import { defaultOnError } from './use-mutate'
const useForm = createUseForm({ defaultOnError, extractErrorData, getErrorCode, getErrorMessage, isRecord })
const useFormMutation = <S extends ZodObject, M = output<S>>({
  autoSave,
  mutate,
  onConflict,
  onError,
  onSuccess,
  resetOnSuccess = true,
  schema,
  toast: toastOpt,
  transform,
  values
}: {
  autoSave?: { debounceMs: number; enabled: boolean }
  mutate: (args: M) => Promise<void>
  onConflict?: (data: ConflictData<output<S>>) => void
  onError?: ((e: unknown) => void) | false
  onSuccess?: () => void
  resetOnSuccess?: boolean
  schema: S
  toast?: { error?: string; success?: string }
  transform?: (d: output<S>) => UndefinedToOptional<M>
  values?: Widen<output<S>>
}) => {
  const { error: resolvedError, success: resolvedSuccess } = resolveFormToast({
    onError,
    onSuccess,
    toast: toastOpt
  })
  return useForm({
    autoSave,
    onConflict,
    onError: resolvedError,
    onSubmit: async (d: output<S>) => {
      const args = (transform ? transform(d) : d) as unknown as M
      await mutate(args)
      return d
    },
    onSuccess: resolvedSuccess,
    resetOnSuccess,
    schema,
    values
  })
}
export type { Api, ConflictData, FieldKind, FieldMeta, FieldMetaMap, FormReturn, FormToastOption, Widen }
export { buildMeta, getMeta, resolveFormToast, useForm, useFormMutation }

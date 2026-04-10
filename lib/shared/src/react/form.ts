'use client'
import type { StandardSchemaV1 } from '@tanstack/form-core'
import type { FormValidateOrFn, ReactFormExtendedApi } from '@tanstack/react-form'
import type { output, ZodObject, ZodRawShape, ZodType } from 'zod/v4'
import { useForm as useTanStackForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { globalRegistry } from 'zod/v4'
import type { ZodSchema } from '../zod'
import {
  coerceOptionals,
  defaultValues as dv,
  elementOf,
  fileKindOf,
  isArrayType,
  isBooleanType,
  isDateType,
  isNumberType,
  isStringType,
  unwrapZod
} from '../zod'
type Api<T extends Record<string, unknown>> = ReactFormExtendedApi<
  T,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  FormValidateOrFn<T>,
  undefined,
  undefined,
  undefined,
  undefined,
  unknown
>
interface ConflictData<T = unknown> {
  code: 'CONFLICT'
  current?: T
  incoming?: T
}
type FieldKind = 'boolean' | 'date' | 'file' | 'files' | 'number' | 'string' | 'stringArray' | 'unknown'
interface FieldMeta {
  description?: string
  kind: FieldKind
  max?: number
  title?: string
}
type FieldMetaMap = Record<string, FieldMeta>
interface FormReturn<T extends Record<string, unknown>, S extends ZodObject> {
  conflict: ConflictData<T> | null
  error: Error | null
  fieldErrors: Record<string, string>
  instance: Api<T>
  isDirty: boolean
  isPending: boolean
  lastSaved: null | number
  meta: { [K in keyof S['shape']]: FieldMeta }
  reset: (values?: T) => void
  resolveConflict: (action: 'cancel' | 'overwrite' | 'reload') => void
  schema: S
  watch: <K extends keyof T>(name: K) => T[K]
}
interface FormToastOption {
  error?: string
  success?: string
}
type ShapeKey<S extends ZodObject> = keyof S['shape'] & string
interface UseFormDeps {
  defaultOnError: (e: unknown) => void
  extractErrorData: (error: unknown) => undefined | { fieldErrors?: Record<string, string> }
  getErrorCode: (error: unknown) => string | undefined
  getErrorMessage: (error: unknown) => string
  isRecord: (v: unknown) => v is Record<string, unknown>
}
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends (infer U)[]
        ? Widen<U>[]
        : T extends Record<string, unknown>
          ? { [K in keyof T]: Widen<T[K]> }
          : T
const resolveFormToast = ({
  onError,
  onSuccess,
  toast: toastOpt
}: {
  onError?: ((e: unknown) => void) | false
  onSuccess?: () => void
  toast?: FormToastOption
}): {
  error: ((e: unknown) => void) | false | undefined
  success: (() => void) | undefined
} => ({
  error: onError ?? (toastOpt?.error ? () => toast.error(toastOpt.error) : undefined),
  success: toastOpt?.success
    ? () => {
        onSuccess?.()
        toast.success(toastOpt.success)
      }
    : onSuccess
})
const getMax = (schema: undefined | ZodSchema): number | undefined => {
  const checks = schema?.def.checks as (undefined | { _zod: { def: { check: string; maximum?: number } } })[] | undefined
  if (!checks) return
  for (const check of checks)
    if (check?._zod.def.check === 'max_length' && check._zod.def.maximum !== undefined) return check._zod.def.maximum
}
const readRegistryMeta = (schema: unknown): { description?: string; max?: number; title?: string } => {
  if (!schema || typeof schema !== 'object' || !('_zod' in schema)) return {}
  try {
    const reg = globalRegistry.get(schema as ZodType)
    if (!reg) return {}
    const out: { description?: string; max?: number; title?: string } = {}
    if (typeof reg.title === 'string') out.title = reg.title
    if (typeof reg.description === 'string') out.description = reg.description
    if (typeof reg.max === 'number') out.max = reg.max
    else if (typeof reg.maximum === 'number') out.max = reg.maximum
    else if (typeof reg.maxLength === 'number') out.max = reg.maxLength
    else if (typeof reg.maxItems === 'number') out.max = reg.maxItems
    return out
  } catch {
    return {}
  }
}
const getMeta = (schema: unknown): FieldMeta => {
  const { schema: base, type } = unwrapZod(schema)
  const fileKind = fileKindOf(schema)
  const reg = readRegistryMeta(schema)
  if (fileKind === 'file') return { kind: 'file', ...reg }
  if (fileKind === 'files') return { kind: 'files', max: reg.max ?? getMax(base), ...reg }
  if (isArrayType(type)) {
    const el = unwrapZod(elementOf(base))
    return { kind: isStringType(el.type) ? 'stringArray' : 'unknown', max: reg.max ?? getMax(base), ...reg }
  }
  if (isStringType(type)) return { kind: 'string', ...reg }
  if (isNumberType(type)) return { kind: 'number', ...reg }
  if (isBooleanType(type)) return { kind: 'boolean', ...reg }
  if (isDateType(type)) return { kind: 'date', ...reg }
  return { kind: 'unknown', ...reg }
}
const buildMeta = <S extends ZodObject>(schema: S): { [K in keyof S['shape']]: FieldMeta } => {
  const meta: FieldMetaMap = {}
  const keys = Object.keys(schema.shape) as ShapeKey<S>[]
  for (const key of keys) meta[key] = getMeta(schema.shape[key])
  return meta as { [K in keyof S['shape']]: FieldMeta }
}
const hasShapeKey = (shape: ZodRawShape, key: string): boolean => key in shape
const ensureKnownValueKeys = <S extends ZodObject>(resolved: output<S> | Widen<output<S>>, schema: S) => {
  for (const key of Object.keys(resolved))
    if (!hasShapeKey(schema.shape, key)) throw new Error(`Form values include unknown key: ${key}`)
}
const submitError =
  (deps: UseFormDeps) =>
  (error: unknown): Error =>
    new Error(deps.getErrorMessage(error), { cause: error })
const handleConflict =
  (deps: UseFormDeps) =>
  <T = unknown>(error: unknown): ConflictData<T> | null => {
    if (deps.getErrorCode(error) !== 'CONFLICT') return null
    if (!deps.isRecord(error)) return { code: 'CONFLICT' }
    const data = deps.isRecord(error.data) ? error.data : undefined
    return {
      code: 'CONFLICT',
      current: data?.current as T | undefined,
      incoming: data?.incoming as T | undefined
    }
  }
const createUseForm = (deps: UseFormDeps) => {
  const mkSubmitError = submitError(deps)
  const mkHandleConflict = handleConflict(deps)
  return <S extends ZodObject>({
    autoSave,
    onConflict,
    onError,
    onSubmit,
    onSuccess,
    resetOnSuccess,
    schema,
    values
  }: {
    autoSave?: { debounceMs: number; enabled: boolean }
    onConflict?: (data: ConflictData<output<S>>) => void
    onError?: ((e: unknown) => void) | false
    onSubmit: (d: output<S>, force?: boolean) => output<S> | Promise<output<S> | undefined> | undefined
    onSuccess?: () => void
    resetOnSuccess?: boolean
    schema: S
    values?: output<S> | Widen<output<S>>
  }) => {
    const resolved = values ?? dv(schema)
    const [conflict, setConflict] = useState<ConflictData<output<S>> | null>(null)
    const [er, setEr] = useState<Error | null>(null)
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [forceSubmit, setForceSubmit] = useState(false)
    const [lastSaved, setLastSaved] = useState<null | number>(null)
    const vRef = useRef(resolved)
    const autoSaveTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null)
    vRef.current = resolved
    ensureKnownValueKeys(resolved, schema)
    const meta = useMemo(() => buildMeta(schema), [schema])
    const instance = useTanStackForm({
      defaultValues: resolved,
      onSubmit: async ({ value }) => {
        setEr(null)
        setFieldErrors({})
        try {
          const coerced = coerceOptionals(schema, value as output<S>)
          const result = await Promise.resolve(onSubmit(coerced, forceSubmit))
          const returned = deps.isRecord(result) ? result : coerced
          const newValues = resetOnSuccess ? returned : value
          instance.reset(newValues as unknown as output<S>)
          if (resetOnSuccess && deps.isRecord(returned)) vRef.current = returned as unknown as Widen<output<S>>
          setForceSubmit(false)
          setLastSaved(Date.now())
          onSuccess?.()
        } catch (error) {
          const conflictData = mkHandleConflict<output<S>>(error)
          if (conflictData) {
            setConflict(conflictData)
            onConflict?.(conflictData)
            return
          }
          const errData = deps.extractErrorData(error)
          if (errData?.fieldErrors) setFieldErrors(errData.fieldErrors)
          const submitErr = mkSubmitError(error)
          setEr(submitErr)
          if (onError !== false) (onError ?? deps.defaultOnError)(submitErr)
        }
      },
      validators: { onSubmit: schema as unknown as StandardSchemaV1<output<S>, unknown> }
    }) as unknown as Api<output<S>>
    const storeState = useStore(instance.store, s => ({
      isDirty: s.isDirty,
      isSubmitting: s.isSubmitting,
      values: s.values
    }))
    const { isDirty, isSubmitting } = storeState
    const watchedValues = storeState.values
    useEffect(() => {
      if (!(autoSave?.enabled && isDirty)) return
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = setTimeout(() => {
        instance.handleSubmit()
      }, autoSave.debounceMs)
      return () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      }
    }, [autoSave?.enabled, autoSave?.debounceMs, isDirty, instance])
    return {
      conflict,
      error: er,
      fieldErrors,
      instance,
      isDirty,
      isPending: isSubmitting,
      lastSaved,
      meta,
      reset: (vals?: output<S>) => {
        const resetVals = vals ?? (vRef.current as unknown as output<S>)
        instance.reset(resetVals as unknown as output<S>)
        if (vals) vRef.current = vals as unknown as Widen<output<S>>
        setEr(null)
        setFieldErrors({})
        setLastSaved(null)
      },
      resolveConflict: (action: 'cancel' | 'overwrite' | 'reload') => {
        if (action === 'overwrite') {
          setConflict(null)
          setForceSubmit(true)
          instance.handleSubmit()
        } else if (action === 'reload') {
          setConflict(null)
          instance.reset(vRef.current as unknown as output<S>)
        } else setConflict(null)
      },
      schema,
      watch: <K extends keyof output<S>>(name: K) => {
        const key = String(name)
        if (!hasShapeKey(schema.shape, key)) throw new Error(`Unknown form field: ${key}`)
        return watchedValues[name]
      }
    } satisfies FormReturn<output<S>, S>
  }
}
export type { Api, ConflictData, FieldKind, FieldMeta, FieldMetaMap, FormReturn, FormToastOption, UseFormDeps, Widen }
export { buildMeta, createUseForm, getMax, getMeta, hasShapeKey, readRegistryMeta, resolveFormToast }

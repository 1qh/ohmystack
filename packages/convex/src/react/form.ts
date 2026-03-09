/* eslint-disable react-hooks/rules-of-hooks */
// biome-ignore-all lint/correctness/useHookAtTopLevel: watch hook is called inside component render context
'use client'
import type { StandardSchemaV1 } from '@tanstack/form-core'
import type { FormValidateOrFn, ReactFormExtendedApi } from '@tanstack/react-form'
import type { FunctionReference } from 'convex/server'
import type { output, ZodObject, ZodRawShape } from 'zod/v4'

import { useForm as useTanStackForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { useMutation } from 'convex/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { ZodSchema } from '../zod'

import { extractErrorData, getErrorCode, getErrorMessage, isRecord } from '../server/helpers'
import {
  coerceOptionals,
  cvFileKindOf,
  defaultValues as dv,
  elementOf,
  isArrayType,
  isBooleanType,
  isDateType,
  isNumberType,
  isStringType,
  unwrapZod
} from '../zod'
import { defaultOnError } from './use-mutate'

/** Discriminated kind of a form field derived from the Zod schema type. */
type FieldKind = 'boolean' | 'date' | 'file' | 'files' | 'number' | 'string' | 'stringArray' | 'unknown'
/** Metadata about a single form field including its kind and optional max constraint. */
interface FieldMeta {
  kind: FieldKind
  max?: number
}
/** Map of field names to their metadata, built from a Zod object schema. */
type FieldMetaMap = Record<string, FieldMeta>

const getMax = (schema: undefined | ZodSchema): number | undefined => {
    const checks = schema?.def.checks as (undefined | { _zod: { def: { check: string; maximum?: number } } })[] | undefined
    if (checks)
      for (const c of checks)
        if (c?._zod.def.check === 'max_length' && c._zod.def.maximum !== undefined) return c._zod.def.maximum
  },
  /** Returns the field metadata (kind, max) for a single Zod schema property. */
  getMeta = (s: unknown): FieldMeta => {
    const { schema: base, type } = unwrapZod(s),
      fk = cvFileKindOf(s)
    if (fk === 'file') return { kind: 'file' }
    if (fk === 'files') return { kind: 'files', max: getMax(base) }
    if (isArrayType(type)) {
      const el = unwrapZod(elementOf(base))
      return { kind: isStringType(el.type) ? 'stringArray' : 'unknown', max: getMax(base) }
    }
    if (isStringType(type)) return { kind: 'string' }
    if (isNumberType(type)) return { kind: 'number' }
    if (isBooleanType(type)) return { kind: 'boolean' }
    if (isDateType(type)) return { kind: 'date' }
    return { kind: 'unknown' }
  },
  /** Builds a field metadata map from a Zod object schema, inspecting each property's type. */
  buildMeta = (s: ZodObject<ZodRawShape>): FieldMetaMap => {
    const m: FieldMetaMap = {}
    // biome-ignore lint/nursery/noForIn: x
    for (const k in s.shape) if (Object.hasOwn(s.shape, k)) m[k] = getMeta(s.shape[k])
    return m
  }

/** TanStack Form API instance parameterized by the form's value type. */
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

/** Data returned when a mutation conflict (CONFLICT error code) is detected during form submission. */
interface ConflictData {
  code: string
  current?: unknown
  incoming?: unknown
}

/** Return type of useForm, providing the form instance, state, conflict handling, and field watching. */
interface FormReturn<T extends Record<string, unknown>, S extends ZodObject<ZodRawShape>> {
  conflict: ConflictData | null
  error: Error | null
  fieldErrors: Record<string, string>
  instance: Api<T>
  isDirty: boolean
  isPending: boolean
  lastSaved: null | number
  meta: FieldMetaMap
  reset: (values?: T) => void
  resolveConflict: (action: 'cancel' | 'overwrite' | 'reload') => void
  schema: S
  watch: <K extends keyof T>(name: K) => T[K]
}

const submitError = (e: unknown): Error => new Error(getErrorMessage(e), { cause: e }),
  handleConflict = (error: unknown): ConflictData | null => {
    if (getErrorCode(error) !== 'CONFLICT') return null
    const { data } = error as { data?: { current?: unknown; incoming?: unknown } }
    return {
      code: 'CONFLICT',
      current: data?.current,
      incoming: data?.incoming
    }
  },
  /**
   * Hook that creates a Zod-validated form with conflict detection, auto-save, and field watching.
   * @param schema Zod object schema for validation
   * @param values Optional initial/current values (defaults to schema defaults)
   * @example
   * ```tsx
   * const { instance, isPending, conflict } = useForm({
   *   schema: owned.blog,
   *   values: existingBlog,
   *   onSubmit: (data) => mutate(data),
   * })
   * ```
   */
  useForm = <S extends ZodObject<ZodRawShape>>({
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
    onConflict?: (data: ConflictData) => void
    onError?: ((e: unknown) => void) | false
    onSubmit: (d: output<S>, force?: boolean) => output<S> | Promise<output<S> | undefined> | undefined
    onSuccess?: () => void
    resetOnSuccess?: boolean
    schema: S
    values?: output<S>
  }) => {
    const resolved = values ?? dv(schema),
      [conflict, setConflict] = useState<ConflictData | null>(null),
      [er, setEr] = useState<Error | null>(null),
      [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
      [forceSubmit, setForceSubmit] = useState(false),
      [lastSaved, setLastSaved] = useState<null | number>(null),
      vRef = useRef(resolved),
      autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

    vRef.current = resolved
    if (Object.keys(resolved).some(k => !(k in schema.shape))) throw new Error('Form values include keys not in schema')
    const meta = useMemo(() => buildMeta(schema), [schema]),
      instance = useTanStackForm({
        defaultValues: resolved,

        onSubmit: async ({ value }) => {
          setEr(null)
          setFieldErrors({})
          try {
            const coerced = coerceOptionals(schema, value),
              result = await Promise.resolve(onSubmit(coerced, forceSubmit)),
              returned = isRecord(result) ? result : coerced,
              newValues = resetOnSuccess ? returned : value
            instance.reset(newValues)
            if (resetOnSuccess && isRecord(returned)) vRef.current = returned
            setForceSubmit(false)
            setLastSaved(Date.now())
            onSuccess?.()
          } catch (error) {
            const conflictData = handleConflict(error)
            if (conflictData) {
              setConflict(conflictData)
              onConflict?.(conflictData)
              return
            }
            const errData = extractErrorData(error)
            if (errData?.fieldErrors) setFieldErrors(errData.fieldErrors)
            const submitErr = submitError(error)
            setEr(submitErr)
            if (onError !== false) (onError ?? defaultOnError)(submitErr)
          }
        },
        validators: { onSubmit: schema as unknown as StandardSchemaV1<output<S>, unknown> }
      }) as unknown as Api<output<S>>,
      { isDirty, isSubmitting } = useStore(instance.store, s => ({ isDirty: s.isDirty, isSubmitting: s.isSubmitting }))

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
        const resetVals = vals ?? vRef.current
        instance.reset(resetVals)
        if (vals) vRef.current = vals
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
          instance.reset(vRef.current)
        } else setConflict(null)
      },
      schema,
      watch: <K extends keyof output<S>>(name: K) =>
        useStore(instance.store, s => s.values[name as string]) as output<S>[K]
    } satisfies FormReturn<output<S>, S>
  },
  /** Convenience wrapper around useForm that wires a Convex mutation as the submit handler. */
  useFormMutation = <S extends ZodObject<ZodRawShape>>({
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
    onConflict?: (data: ConflictData) => void
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

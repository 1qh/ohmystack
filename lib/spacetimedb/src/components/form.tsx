/* oxlint-disable react/jsx-handler-names */
// biome-ignore-all lint/suspicious/noExplicitAny: x
// biome-ignore-all lint/correctness/useHookAtTopLevel: watch hook is called inside component render context
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
'use client'
import type { ComponentProps, ReactNode } from 'react'
import type { infer as zinfer, ZodObject, ZodRawShape } from 'zod/v4'
import { AutoSaveIndicator, ConflictDialog, UnsavedChangesDialog } from '@a/shared/components/form-common'
import { useNavigationGuard } from 'next-navigation-guard'
import { use, useEffect, useMemo } from 'react'
import type { FormReturn as BaseFormReturn, ConflictData, FormToastOption } from '../react/form'
import type { UndefinedToOptional } from '../zod'
import type { Api } from './fields'
import { DevtoolsAutoMount } from '../react/devtools-panel'
import { resolveFormToast, useForm as useBaseForm } from '../react/form'
import { fields, FormContext } from './fields'
import { FileApiContext } from './file-field'
interface FormReturn<T extends Record<string, unknown>, S extends ZodObject<ZodRawShape>> extends BaseFormReturn<T, S> {
  guard: ReturnType<typeof useNavigationGuard>
}
type Key<T, V> = string & { [K in keyof T]: T[K] extends V ? K : never }[keyof T]
type Props<K extends keyof typeof fields> = Parameters<(typeof fields)[K]>[0]
interface TypedFields<T> {
  Arr: (p: WithName<Props<'Arr'>, Key<T, readonly string[] | string[] | undefined>>) => ReactNode
  Choose: (p: WithName<Props<'Choose'>, Key<T, string | undefined>>) => ReactNode
  Colorpick: (p: WithName<Props<'Colorpick'>, Key<T, string | undefined>>) => ReactNode
  Combobox: (p: WithName<Props<'Combobox'>, Key<T, string | undefined>>) => ReactNode
  Datepick: (p: WithName<Props<'Datepick'>, Key<T, null | number | undefined>>) => ReactNode
  Err: typeof fields.Err
  File: (p: WithName<Props<'File'>, Key<T, null | string | undefined>>) => ReactNode
  Files: (p: WithName<Props<'Files'>, Key<T, readonly string[] | string[] | undefined>>) => ReactNode
  MultiSelect: (p: WithName<Props<'MultiSelect'>, Key<T, readonly string[] | string[] | undefined>>) => ReactNode
  Num: (p: WithName<Props<'Num'>, Key<T, number | undefined>>) => ReactNode
  Rating: (p: WithName<Props<'Rating'>, Key<T, number | undefined>>) => ReactNode
  Slider: (p: WithName<Props<'Slider'>, Key<T, number | undefined>>) => ReactNode
  Submit: typeof fields.Submit
  Text: (
    p: WithName<Props<'Text'>, Key<T, string | undefined>> & {
      asyncDebounceMs?: number
      asyncValidate?: (value: string) => Promise<string | undefined>
    }
  ) => ReactNode
  Timepick: (p: WithName<Props<'Timepick'>, Key<T, string | undefined>>) => ReactNode
  Toggle: (p: WithName<Props<'Toggle'>, Key<T, boolean | undefined>>) => ReactNode
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
type WithName<P, K> = Omit<P, 'name'> & { name: K }
const useWithGuard = <T extends Record<string, unknown>, S extends ZodObject<ZodRawShape>>(
    base: BaseFormReturn<T, S>
  ): FormReturn<T, S> => {
    const dirty = base.isDirty || base.isPending,
      guard = useNavigationGuard({ enabled: dirty })
    useEffect(() => {
      if (!dirty) return
      const h = (e: BeforeUnloadEvent) => {
        e.preventDefault()
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        e.returnValue = ''
      }
      window.addEventListener('beforeunload', h)
      return () => window.removeEventListener('beforeunload', h)
    }, [dirty])
    return { ...base, guard }
  },
  useForm = <S extends ZodObject<ZodRawShape>>(opts: {
    autoSave?: { debounceMs: number; enabled: boolean }
    onConflict?: (data: ConflictData) => void
    onError?: ((e: unknown) => void) | false
    onSubmit: (d: zinfer<S>, force?: boolean) => Promise<undefined | zinfer<S>> | undefined | zinfer<S>
    onSuccess?: () => void
    resetOnSuccess?: boolean
    schema: S
    values?: Widen<zinfer<S>>
  }) => useWithGuard(useBaseForm(opts)),
  useFormMutation = <S extends ZodObject<ZodRawShape>, M = zinfer<S>>(opts: {
    autoSave?: { debounceMs: number; enabled: boolean }
    mutate: (args: M) => Promise<void> | void
    onConflict?: (data: ConflictData) => void
    onError?: ((e: unknown) => void) | false
    onSuccess?: () => void
    resetOnSuccess?: boolean
    schema: S
    toast?: FormToastOption
    transform?: (d: zinfer<S>) => UndefinedToOptional<M>
    values?: Widen<zinfer<S>>
  }) => {
    const { error: resolvedError, success: resolvedSuccess } = resolveFormToast({
      onError: opts.onError,
      onSuccess: opts.onSuccess,
      toast: opts.toast
    })
    return useWithGuard(
      useBaseForm({
        autoSave: opts.autoSave,
        onConflict: opts.onConflict,
        onError: resolvedError,
        onSubmit: async d => {
          const args = (opts.transform ? opts.transform(d) : d) as unknown as M
          await opts.mutate(args)
          return d
        },
        onSuccess: resolvedSuccess,
        resetOnSuccess: opts.resetOnSuccess ?? true,
        schema: opts.schema,
        values: opts.values
      })
    )
  },
  hasFileFields = (meta: Record<string, { kind: string }>): boolean => {
    for (const k of Object.keys(meta)) {
      const entry = meta[k]
      if (entry && (entry.kind === 'file' || entry.kind === 'files')) return true
    }
    return false
  },
  isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production',
  FileFieldWarning = ({ meta }: { meta: Record<string, { kind: string }> }) => {
    const fileCtx = use(FileApiContext)
    if (isDev && hasFileFields(meta) && !fileCtx)
      // eslint-disable-next-line no-console
      console.error(
        '[@noboil/spacetimedb] Form schema has file fields but no FileApiProvider found. Wrap your app in <FileApiProvider> for file uploads to work.'
      )
    return null
  },
  Form = <T extends Record<string, unknown>, S extends ZodObject<ZodRawShape>>({
    form: { conflict, error, fieldErrors, guard, instance, meta, resolveConflict, schema },
    render,
    showError = true,
    ...props
  }: Omit<ComponentProps<'form'>, 'children' | 'onSubmit'> & {
    form: FormReturn<T, S>
    render: (f: TypedFields<T>) => ReactNode
    showError?: boolean
  }) => {
    const contextValue = useMemo(
      () => ({ form: instance as Api<Record<string, unknown>>, meta, schema, serverErrors: fieldErrors }),
      [fieldErrors, instance, meta, schema]
    )
    return (
      <FormContext value={contextValue}>
        <form
          {...props}
          onSubmit={e => {
            e.preventDefault()
            instance.handleSubmit()
          }}>
          {showError && error ? (
            <p className='mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive' role='alert'>
              {error.message}
            </p>
          ) : null}
          {render(fields as TypedFields<T>)}
        </form>
        <ConflictDialog conflict={conflict} onResolve={resolveConflict} />
        <UnsavedChangesDialog active={guard.active} onAccept={guard.accept} onReject={guard.reject} />
        <FileFieldWarning meta={meta} />
        <DevtoolsAutoMount />
      </FormContext>
    )
  }
export type { TypedFields }
export { AutoSaveIndicator, ConflictDialog, Form, useForm, useFormMutation }

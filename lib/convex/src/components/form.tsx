/* oxlint-disable jsx-no-new-object-as-prop, react/jsx-handler-names */
// biome-ignore-all lint/suspicious/noExplicitAny: x
// biome-ignore-all lint/correctness/useHookAtTopLevel: watch hook is called inside component render context
'use client'
import type { FunctionReference } from 'convex/server'
import type { useNavigationGuard } from 'next-navigation-guard'
import type { ComponentProps, ReactNode } from 'react'
import type { infer as zinfer, ZodObject } from 'zod/v4'
import {
  autoRender,
  AutoSaveIndicator,
  ConflictDialog,
  createFileFieldWarning,
  useWithGuard
} from '@a/shared/components/form'
import { Button } from '@a/ui/button'
import { Dialog, DialogContent } from '@a/ui/dialog'
import { useMemo } from 'react'
import type { FormReturn as BaseFormReturn, ConflictData } from '../react/form'
import type { Api } from './fields'
import { DevtoolsAutoMount } from '../react/devtools-panel'
import { useForm as useBaseForm, useFormMutation as useBaseFormMutation } from '../react/form'
import { fields, FormContext } from './fields'
import { FileApiContext } from './file-field'
interface FormReturn<T extends Record<string, unknown>, S extends ZodObject> extends BaseFormReturn<T, S> {
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
type WithName<P, K> = Omit<P, 'name'> & { name: K }
const FileFieldWarning = createFileFieldWarning({
  fileApiContext: FileApiContext,
  messagePrefix: '[@noboil/convex]'
})
const useForm = <S extends ZodObject>(opts: {
  autoSave?: { debounceMs: number; enabled: boolean }
  onConflict?: (data: ConflictData) => void
  onError?: ((e: unknown) => void) | false
  onSubmit: (d: zinfer<S>, force?: boolean) => Promise<undefined | zinfer<S>> | undefined | zinfer<S>
  onSuccess?: () => void
  resetOnSuccess?: boolean
  schema: S
  values?: zinfer<S>
}) => useWithGuard(useBaseForm(opts))
const useFormMutation = <S extends ZodObject>(opts: {
  autoSave?: { debounceMs: number; enabled: boolean }
  doc?: { updatedAt?: unknown }
  mutation: FunctionReference<'mutation'>
  onConflict?: (data: ConflictData) => void
  onError?: ((e: unknown) => void) | false
  onSuccess?: () => void
  resetOnSuccess?: boolean
  schema: S
  transform?: (d: zinfer<S>) => Record<string, unknown>
  values?: zinfer<S>
}) => {
  const { doc, transform, ...rest } = opts
  const wrappedTransform = doc
    ? (d: zinfer<S>) => {
        const base = transform ? transform(d) : (d as Record<string, unknown>)
        return { ...base, expectedUpdatedAt: doc.updatedAt }
      }
    : transform
  return useWithGuard(useBaseFormMutation({ ...rest, transform: wrappedTransform }))
}
const Form = <T extends Record<string, unknown>, S extends ZodObject>({
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
      <Dialog
        onOpenChange={open => {
          if (!open) guard.reject()
        }}
        open={guard.active}>
        <DialogContent className='[&>button]:hidden'>
          <p>You have unsaved changes. Are you sure you want to leave?</p>
          <div className='flex justify-end gap-2'>
            <Button onClick={guard.reject} variant='outline'>
              Cancel
            </Button>
            <Button onClick={guard.accept} variant='destructive'>
              Discard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <FileFieldWarning meta={meta} />
      <DevtoolsAutoMount />
    </FormContext>
  )
}
const AutoForm = <T extends Record<string, unknown>, S extends ZodObject>({
  exclude,
  form,
  submitLabel = 'Submit',
  ...props
}: Omit<ComponentProps<'form'>, 'children' | 'onSubmit'> & {
  exclude?: (keyof T & string)[]
  form: FormReturn<T, S>
  submitLabel?: string
}) => (
  <Form
    form={form}
    render={f => (
      <>
        {autoRender(
          f as unknown as Record<string, (p: Record<string, unknown>) => unknown>,
          form.meta,
          exclude ? new Set(exclude) : undefined
        )}
        <f.Submit>{submitLabel}</f.Submit>
      </>
    )}
    {...props}
  />
)
export type { TypedFields }
export { AutoForm, AutoSaveIndicator, ConflictDialog, Form, useForm, useFormMutation }

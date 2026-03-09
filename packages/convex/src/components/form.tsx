// biome-ignore-all lint/suspicious/noExplicitAny: x
// biome-ignore-all lint/correctness/useHookAtTopLevel: watch hook is called inside component render context
'use client'
import type { FunctionReference } from 'convex/server'
import type { ComponentProps, ReactNode } from 'react'
import type { infer as zinfer, ZodObject, ZodRawShape } from 'zod/v4'

import { cn } from '@a/ui'
import { Button } from '@a/ui/button'
import { Dialog, DialogContent } from '@a/ui/dialog'
import { useNavigationGuard } from 'next-navigation-guard'
import { use, useEffect, useState } from 'react'

import type { FormReturn as BaseFormReturn, ConflictData } from '../react/form'
import type { Api } from './fields'

import { DevtoolsAutoMount } from '../react/devtools-panel'
import { useForm as useBaseForm, useFormMutation as useBaseFormMutation } from '../react/form'
import { fields, FormContext } from './fields'
import { FileApiContext } from './file-field'

const ConflictDialog = ({
  className,
  conflict,
  onResolve,
  ...props
}: Omit<ComponentProps<typeof DialogContent>, 'children'> & {
  conflict: ConflictData | null
  onResolve: (action: 'cancel' | 'overwrite' | 'reload') => void
}) => (
  <Dialog open={Boolean(conflict)}>
    <DialogContent
      className={cn('[&>button]:hidden', className)}
      {...props}
      onEscapeKeyDown={() => onResolve('cancel')}
      onInteractOutside={() => onResolve('cancel')}>
      <h2 className='text-lg font-semibold'>Conflict Detected</h2>
      <p className='text-sm text-muted-foreground'>
        This record was modified by someone else. Choose how to resolve the conflict.
      </p>
      {conflict?.current || conflict?.incoming ? (
        <div className='space-y-3'>
          {conflict.current ? (
            <div className='rounded-lg bg-muted p-3'>
              <p className='mb-1 text-xs font-medium text-muted-foreground'>Server version:</p>
              <pre className='text-xs'>{JSON.stringify(conflict.current, null, 2)}</pre>
            </div>
          ) : null}
          {conflict.incoming ? (
            <div className='rounded-lg bg-muted p-3'>
              <p className='mb-1 text-xs font-medium text-muted-foreground'>Your version:</p>
              <pre className='text-xs'>{JSON.stringify(conflict.incoming, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className='flex justify-end gap-2'>
        <Button onClick={() => onResolve('cancel')} variant='outline'>
          Cancel
        </Button>
        <Button onClick={() => onResolve('reload')} variant='outline'>
          Reload
        </Button>
        <Button onClick={() => onResolve('overwrite')} variant='destructive'>
          Overwrite
        </Button>
      </div>
    </DialogContent>
  </Dialog>
)

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
    values?: zinfer<S>
  }) => useWithGuard(useBaseForm(opts)),
  useFormMutation = <S extends ZodObject<ZodRawShape>>(opts: {
    autoSave?: { debounceMs: number; enabled: boolean }
    mutation: FunctionReference<'mutation'>
    onConflict?: (data: ConflictData) => void
    onError?: ((e: unknown) => void) | false
    onSuccess?: () => void
    resetOnSuccess?: boolean
    schema: S
    transform?: (d: zinfer<S>) => Record<string, unknown>
    values?: zinfer<S>
  }) => useWithGuard(useBaseFormMutation(opts)),
  hasFileFields = (meta: Record<string, { kind: string }>): boolean => {
    for (const k of Object.keys(meta)) {
      const entry = meta[k]
      if (entry && (entry.kind === 'file' || entry.kind === 'files')) return true
    }
    return false
  },
  // biome-ignore lint/style/noProcessEnv: env detection
  isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production',
  FileFieldWarning = ({ meta }: { meta: Record<string, { kind: string }> }) => {
    const fileCtx = use(FileApiContext)
    if (isDev && hasFileFields(meta) && !fileCtx)
      // eslint-disable-next-line no-console
      console.warn(
        '[@ohmystack/convex] Form schema has file fields but no FileApiProvider found. Wrap your app in <FileApiProvider> for file uploads to work.'
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
  }) => (
    // eslint-disable-next-line @eslint-react/no-unstable-context-value
    <FormContext value={{ form: instance as Api<Record<string, unknown>>, meta, schema, serverErrors: fieldErrors }}>
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
      <Dialog open={guard.active}>
        <DialogContent className='[&>button]:hidden' onEscapeKeyDown={guard.reject} onInteractOutside={guard.reject}>
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
  ),
  AutoSaveIndicator = ({ className, lastSaved, ...props }: ComponentProps<'span'> & { lastSaved: null | number }) => {
    const MS_PER_SECOND = 1000,
      JUST_SAVED_THRESHOLD = 5,
      REFRESH_INTERVAL = 10_000,
      calcAgo = () => (lastSaved ? Math.round((Date.now() - lastSaved) / MS_PER_SECOND) : 0),
      [ago, setAgo] = useState(calcAgo)

    // biome-ignore lint/correctness/useExhaustiveDependencies: calcAgo depends on lastSaved
    useEffect(() => {
      if (!lastSaved) return
      setAgo(calcAgo())
      const id = setInterval(() => setAgo(calcAgo()), REFRESH_INTERVAL)
      return () => clearInterval(id)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastSaved])

    if (!lastSaved) return null
    return (
      <span className={cn('text-xs text-muted-foreground', className)} {...props}>
        {ago < JUST_SAVED_THRESHOLD ? 'Saved' : `Saved ${ago}s ago`}
      </span>
    )
  }


/* oxlint-disable react-perf/jsx-no-new-object-as-prop, react/jsx-handler-names */
/* eslint-disable complexity, react-hooks/refs */
// biome-ignore-all lint/correctness/useHookAtTopLevel: hooks called in component render context
'use client'
import type { Stepper as CoreStepper, Step } from '@stepperize/core'
import type { StandardSchemaV1 } from '@tanstack/form-core'
import type { ComponentProps, ReactNode, SyntheticEvent } from 'react'
import type { output, ZodObject, ZodRawShape } from 'zod/v4'
import { cn } from '@a/ui'
import { Button } from '@a/ui/button'
import { Dialog, DialogContent } from '@a/ui/dialog'
import { Spinner } from '@a/ui/spinner'
import { defineStepper } from '@stepperize/react'
import { useForm as useTanStackForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { Check } from 'lucide-react'
import { useNavigationGuard } from 'next-navigation-guard'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ExtractSchema<Defs extends readonly StepDef[], Id extends string> = Extract<Defs[number], { id: Id }>['schema']

interface FormHandle {
  handleSubmit: () => void
  isDirty: boolean
  values: () => Record<string, unknown>
}

type InternalStep<Id extends string = string> = Step<Id, { label: string; schema: ZodObject<ZodRawShape> }>

type StepDataMap<Defs extends readonly StepDef[]> = {
  [D in Defs[number] as D['id']]: output<D['schema']>
}

interface StepDef<Id extends string = string, S extends ZodObject<ZodRawShape> = ZodObject<ZodRawShape>> {
  id: Id
  label: string
  schema: S
}

interface StepFormCtx {
  onDirtyChange: (dirty: boolean) => void
  registerForm: (handle: FormHandle | null) => void
}

type StepIds<Defs extends readonly StepDef[]> = Defs[number]['id']

interface StepIndicatorClassNames {
  button?: string
  label?: string
  nav?: string
  separator?: string
  step?: string
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

interface StepperReturn<Defs extends readonly StepDef[]> {
  error: Error | null
  inner: CoreStepper<InternalStep[]>
  isCompleted: boolean
  isPending: boolean
  schemas: Record<string, ZodObject<ZodRawShape>>
  steps: InternalStep[]
  submitAll: (data: Record<string, Record<string, unknown>>) => Promise<void>
  values: Partial<{ [D in Defs[number] as D['id']]?: output<D['schema']> }>
}

interface StepProps<Defs extends readonly StepDef[], TFields, Id extends StepIds<Defs> = StepIds<Defs>> {
  id: Id
  render: (fields: TFields) => ReactNode
}

interface UseStepperOpts<Defs extends readonly StepDef[]> {
  onError?: (e: unknown) => void
  onSubmit: (data: StepDataMap<Defs>) => Promise<void> | void
  onSuccess?: () => void
  values?: Partial<{ [D in Defs[number] as D['id']]?: output<D['schema']> }>
}

interface FormContextValue {
  form: FormApiLike
  meta: unknown
  schema: ZodObject<ZodRawShape>
  serverErrors: Record<string, unknown>
}

interface FormApiLike {
  handleSubmit: () => void
  state: {
    values: Record<string, unknown>
  }
  store: {
    subscribe: (listener: () => void) => () => void
  }
}

interface DefineStepsAdapters<TFields> {
  buildMeta: (schema: ZodObject<ZodRawShape>) => unknown
  coerceOptionals: (schema: ZodObject<ZodRawShape>, values: Record<string, unknown>) => Record<string, unknown>
  defaultValues: (schema: ZodObject<ZodRawShape>) => Record<string, unknown>
  fields: TFields
  onFinalSubmitError?: (error: unknown) => void
  renderFormContext: (args: { children: ReactNode; value: FormContextValue }) => ReactNode
}

const createDefineSteps = <TFields,>(adapters: DefineStepsAdapters<TFields>) => {
  const defineSteps = <const Defs extends readonly [StepDef, ...StepDef[]]>(...defs: Defs) => {
    const internalSteps = defs.map(d => ({ id: d.id, label: d.label, schema: d.schema })) as unknown as InternalStep[],
      stepperFactory = defineStepper(...internalSteps),
      schemaMap: Record<string, ZodObject<ZodRawShape>> = {}
    for (const d of defs) schemaMap[d.id] = d.schema
    const useStepperHook = (opts: UseStepperOpts<Defs>): StepperReturn<Defs> => {
        const inner = stepperFactory.useStepper(),
          [error, setError] = useState<Error | null>(null),
          [isCompleted, setIsCompleted] = useState(false),
          [isPending, setIsPending] = useState(false),
          submitAll = useCallback(
            async (allData: Record<string, Record<string, unknown>>) => {
              setError(null)
              setIsPending(true)
              try {
                await Promise.resolve(opts.onSubmit(allData as StepDataMap<Defs>))
                setIsCompleted(true)
                opts.onSuccess?.()
              } catch (submitError) {
                const err = submitError instanceof Error ? submitError : new Error(String(submitError))
                setError(err)
                opts.onError?.(err)
              } finally {
                setIsPending(false)
              }
            },
            [opts]
          )
        return {
          error,
          inner,
          isCompleted,
          isPending,
          schemas: schemaMap,
          steps: internalSteps,
          submitAll,
          values: opts.values ?? {}
        }
      },
      StepContent = <Id extends StepIds<Defs>>({
        id,
        render,
        schemas,
        values: prefill,
        ctx
      }: {
        ctx: StepFormCtx
        id: Id
        render: (f: TFields) => ReactNode
        schemas: Record<string, ZodObject<ZodRawShape>>
        values: Partial<{ [D in Defs[number] as D['id']]?: output<D['schema']> }>
      }) => {
        const rawSchema = schemas[id]
        if (!rawSchema) throw new Error(`No schema for step: ${id}`)
        const schema = rawSchema,
          initial = prefill[id as keyof typeof prefill] as Record<string, unknown> | undefined,
          resolved = initial ?? adapters.defaultValues(schema),
          meta = useMemo(() => adapters.buildMeta(schema), [schema]),
          instance = useTanStackForm({
            defaultValues: resolved,
            validators: { onSubmit: schema as unknown as StandardSchemaV1<output<typeof schema>, unknown> }
          }) as unknown as FormApiLike,
          { isDirty } = useStore(instance.store, st => ({ isDirty: (st as { isDirty: boolean }).isDirty }))
        useEffect(() => {
          ctx.onDirtyChange(isDirty)
        }, [ctx, isDirty])
        useEffect(() => {
          ctx.registerForm({
            handleSubmit: () => {
              instance.handleSubmit()
            },
            isDirty,
            values: () => instance.state.values
          })
          return () => {
            ctx.registerForm(null)
          }
        })
        return adapters.renderFormContext({
          children: render(adapters.fields),
          value: { form: instance, meta, schema, serverErrors: {} }
        })
      },
      StepIndicator = ({
        classNames,
        currentIndex,
        inner,
        steps
      }: {
        classNames?: StepIndicatorClassNames
        currentIndex: number
        inner: CoreStepper<InternalStep[]>
        steps: InternalStep[]
      }) => (
        <nav aria-label='Step progress' className={cn('flex items-center gap-2', classNames?.nav)}>
          {steps.map((step, i) => {
            const isActive = i === currentIndex,
              isCompleted = i < currentIndex,
              status = isActive ? 'active' : isCompleted ? 'completed' : 'inactive'
            return (
              <div
                className={cn('flex flex-1 items-center gap-2', classNames?.step)}
                data-status={status}
                data-step={step.id}
                key={step.id}>
                <button
                  aria-current={isActive ? 'step' : undefined}
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
                    isActive && 'bg-primary text-primary-foreground',
                    isCompleted && 'cursor-pointer bg-primary/20 text-primary',
                    !(isActive || isCompleted) && 'bg-muted text-muted-foreground',
                    classNames?.button
                  )}
                  data-testid={`step-indicator-${step.id}`}
                  disabled={!isCompleted}
                  onClick={() => {
                    if (isCompleted) inner.navigation.goTo(step.id)
                  }}
                  type='button'>
                  {isCompleted ? <Check className='size-4' /> : i + 1}
                </button>
                <span
                  className={cn(
                    'hidden text-sm sm:inline',
                    isActive && 'font-medium text-foreground',
                    isCompleted && 'text-foreground',
                    !(isActive || isCompleted) && 'text-muted-foreground',
                    classNames?.label
                  )}>
                  {step.label}
                </span>
                {i < steps.length - 1 ? <div className={cn('mx-2 h-px flex-1 bg-border', classNames?.separator)} /> : null}
              </div>
            )
          })}
        </nav>
      ),
      StepFormComponent = <D extends Defs>({
        children,
        className,
        indicator = true,
        nextLabel = 'Next',
        prevLabel = 'Back',
        stepIndicatorClassNames,
        stepper: s,
        submitLabel = 'Submit',
        ...props
      }: StepFormProps<D>) => {
        const formHandleRef = useRef<FormHandle | null>(null),
          stepDataRef = useRef<Record<string, Record<string, unknown>>>(
            (() => {
              const initial: Record<string, Record<string, unknown>> = {}
              for (const d of defs) {
                const v = s.values[d.id as keyof typeof s.values]
                if (v) initial[d.id] = v as Record<string, unknown>
              }
              return initial
            })()
          ),
          [isDirty, setIsDirty] = useState(false),
          [hasSaved, setHasSaved] = useState(false),
          dirty = hasSaved || isDirty,
          guard = useNavigationGuard({ enabled: dirty && !s.isPending && !s.isCompleted })
        useEffect(() => {
          if (!dirty) return
          const h = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
          }
          window.addEventListener('beforeunload', h)
          return () => window.removeEventListener('beforeunload', h)
        }, [dirty])
        const currentStep = s.inner.state.current.data,
          currentIdx = s.inner.state.current.index,
          currentIsFirst = s.inner.state.isFirst,
          currentIsLast = s.inner.state.isLast,
          currentId = currentStep.id,
          stepRenders: Record<string, (f: TFields) => ReactNode> = {},
          childArr = Array.isArray(children) ? children : [children]
        for (const c of childArr)
          if (c && typeof c === 'object' && 'props' in c) {
            const p = (c as { props: { id?: string; render?: (f: TFields) => ReactNode } }).props
            if (p.id && p.render) stepRenders[p.id] = p.render
          }
        const currentRender = stepRenders[currentId],
          saved = stepDataRef.current[currentId],
          currentValues = saved ? { ...s.values, [currentId]: saved } : s.values,
          handleSubmitForm = useCallback(
            (e: SyntheticEvent) => {
              e.preventDefault()
              if (!formHandleRef.current) return
              const values = formHandleRef.current.values(),
                schema = s.schemas[currentId]
              if (!schema) return
              const normalized = adapters.coerceOptionals(schema, values),
                result = schema.safeParse(normalized)
              if (!result.success) {
                formHandleRef.current.handleSubmit()
                return
              }
              stepDataRef.current[currentId] = normalized
              setHasSaved(true)
              if (currentIsLast)
                s.submitAll(stepDataRef.current).catch((error: unknown) => {
                  adapters.onFinalSubmitError?.(error)
                })
              else s.inner.navigation.next()
            },
            [currentId, currentIsLast, s]
          ),
          handlePrev = useCallback(() => {
            if (formHandleRef.current) stepDataRef.current[currentId] = formHandleRef.current.values()
            s.inner.navigation.prev()
          }, [currentId, s.inner]),
          registerForm = useCallback((handle: FormHandle | null) => {
            formHandleRef.current = handle
          }, []),
          ctx: StepFormCtx = useMemo(() => ({ onDirtyChange: setIsDirty, registerForm }), [registerForm])
        return (
          <div className={cn('space-y-6', className)} {...props}>
            {indicator ? (
              <StepIndicator classNames={stepIndicatorClassNames} currentIndex={currentIdx} inner={s.inner} steps={s.steps} />
            ) : null}
            {s.error ? (
              <p className='rounded-lg bg-destructive/10 p-3 text-sm text-destructive' role='alert'>
                {s.error.message}
              </p>
            ) : null}
            <form data-testid='step-form' onSubmit={handleSubmitForm}>
              {currentRender ? (
                <StepContent
                  ctx={ctx}
                  id={currentId}
                  key={currentId}
                  render={currentRender}
                  schemas={s.schemas}
                  values={currentValues}
                />
              ) : null}
              <div className='mt-6 flex justify-between'>
                {currentIsFirst ? (
                  <div />
                ) : (
                  <Button data-testid='step-prev' onClick={handlePrev} type='button' variant='outline'>
                    {prevLabel}
                  </Button>
                )}
                <Button data-testid={currentIsLast ? 'step-submit' : 'step-next'} disabled={s.isPending} type='submit'>
                  {s.isPending ? <Spinner className='mr-2' /> : null}
                  {currentIsLast ? submitLabel : nextLabel}
                </Button>
              </div>
            </form>
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
          </div>
        )
      },
      StepComponent = <Id extends StepIds<Defs>>({ id, render }: StepProps<Defs, TFields, Id>): null | ReturnType<typeof render> =>
        schemaMap[id] ? null : render(adapters.fields),
      StepForm = Object.assign(StepFormComponent, { Step: StepComponent }) as typeof StepFormComponent & {
        Step: typeof StepComponent
      }
    return {
      StepForm,
      steps: internalSteps,
      useStepper: useStepperHook
    }
  }
  return defineSteps
}

export type { DefineStepsAdapters }
export { createDefineSteps }

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
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Api } from './fields'
import type { TypedFields } from './form'

import { buildMeta } from '../react/form'
import { coerceOptionals, defaultValues as dv } from '../zod'
import { fields, FormContext } from './fields'

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

const StepFormContext = createContext<null | StepFormCtx>(null)

interface StepFormProps<Defs extends readonly StepDef[]> extends Omit<ComponentProps<'div'>, 'children'> {
  children: ReactNode
  indicator?: boolean
  nextLabel?: string
  prevLabel?: string
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
      values: prefill
    }: {
      id: Id
      render: (f: TypedFields<output<ExtractSchema<Defs, Id>>>) => ReactNode
      schemas: Record<string, ZodObject<ZodRawShape>>
      values: Partial<{ [D in Defs[number] as D['id']]?: output<D['schema']> }>
    }) => {
      const ctx = use(StepFormContext)
      if (!ctx) throw new Error('StepContent must be inside StepForm')

      const rawSchema = schemas[id]
      if (!rawSchema) throw new Error(`No schema for step: ${id}`)
      const schema = rawSchema,
        initial = prefill[id as keyof typeof prefill] as Record<string, unknown> | undefined,
        resolved = initial ?? dv(schema),
        meta = useMemo(() => buildMeta(schema), [schema]),
        instance = useTanStackForm({
          defaultValues: resolved,
          validators: { onSubmit: schema as unknown as StandardSchemaV1<output<typeof schema>, unknown> }
        }) as unknown as Api<Record<string, unknown>>,
        { isDirty } = useStore(instance.store, st => ({ isDirty: st.isDirty }))

      useEffect(() => {
        ctx.onDirtyChange(isDirty)
      }, [isDirty, ctx])

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

      return (
        // eslint-disable-next-line @eslint-react/no-unstable-context-value
        <FormContext value={{ form: instance, meta, schema, serverErrors: {} }}>
          {render(fields as TypedFields<output<ExtractSchema<Defs, Id>>>)}
        </FormContext>
      )
    },
    StepIndicator = ({
      currentIndex,
      inner,
      steps
    }: {
      currentIndex: number
      inner: CoreStepper<InternalStep[]>
      steps: InternalStep[]
    }) => (
      <nav aria-label='Step progress' className='flex items-center gap-2'>
        {steps.map((step, i) => {
          const isActive = i === currentIndex,
            isCompleted = i < currentIndex,
            status = isActive ? 'active' : isCompleted ? 'completed' : 'inactive'
          return (
            <div className='flex flex-1 items-center gap-2' data-status={status} data-step={step.id} key={step.id}>
              <button
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
                  isActive && 'bg-primary text-primary-foreground',
                  isCompleted && 'cursor-pointer bg-primary/20 text-primary',
                  !(isActive || isCompleted) && 'bg-muted text-muted-foreground'
                )}
                data-testid={`step-indicator-${step.id}`}
                disabled={!isCompleted}
                onClick={() => {
                  // biome-ignore lint/nursery/noFloatingPromises: stepperize goTo returns void
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
                  !(isActive || isCompleted) && 'text-muted-foreground'
                )}>
                {step.label}
              </span>
              {i < steps.length - 1 ? <div className='mx-2 h-px flex-1 bg-border' /> : null}
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
          // eslint-disable-next-line @typescript-eslint/no-deprecated
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
        stepRenders: Record<string, (f: TypedFields<Record<string, unknown>>) => ReactNode> = {},
        childArr = Array.isArray(children) ? children : [children]
      for (const c of childArr)
        if (c && typeof c === 'object' && 'props' in c) {
          const p = (c as { props: { id?: string; render?: (f: TypedFields<Record<string, unknown>>) => ReactNode } })
            .props
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

            const result = schema.safeParse(coerceOptionals(schema, values))
            if (!result.success) {
              formHandleRef.current.handleSubmit()
              return
            }

            stepDataRef.current[currentId] = coerceOptionals(schema, values)
            setHasSaved(true)
            // oxlint-disable-next-line promise/prefer-await-to-then
            if (currentIsLast) s.submitAll(stepDataRef.current).catch(() => null)
            // biome-ignore lint/nursery/noFloatingPromises: stepperize next returns void
            else s.inner.navigation.next()
          },
          [currentId, currentIsLast, s]
        ),
        handlePrev = useCallback(() => {
          if (formHandleRef.current) stepDataRef.current[currentId] = formHandleRef.current.values()
          // biome-ignore lint/nursery/noFloatingPromises: stepperize prev returns void
          s.inner.navigation.prev()
        }, [currentId, s.inner]),
        registerForm = useCallback((handle: FormHandle | null) => {
          formHandleRef.current = handle
        }, []),
        ctx: StepFormCtx = useMemo(() => ({ onDirtyChange: setIsDirty, registerForm }), [registerForm])

      return (
        <StepFormContext value={ctx}>
          <div className={cn('space-y-6', className)} {...props}>
            {indicator ? <StepIndicator currentIndex={currentIdx} inner={s.inner} steps={s.steps} /> : null}
            {s.error ? (
              <p className='rounded-lg bg-destructive/10 p-3 text-sm text-destructive' role='alert'>
                {s.error.message}
              </p>
            ) : null}
            <form data-testid='step-form' onSubmit={handleSubmitForm}>
              {currentRender ? (
                <StepContent
                  id={currentId}
                  key={currentId}
                  render={currentRender as never}
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
                  {/* biome-ignore lint/nursery/noLeakedRender: ternary with string values is safe */}
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
        </StepFormContext>
      )
    },
    StepComponent = <Id extends StepIds<Defs>>({ id, render }: StepProps<Defs, Id>): null | ReturnType<typeof render> =>
      schemaMap[id] ? null : render(fields as TypedFields<output<ExtractSchema<Defs, Id>>>),
    StepForm = Object.assign(StepFormComponent, { Step: StepComponent }) as typeof StepFormComponent & {
      Step: typeof StepComponent
    }

  return {
    StepForm,
    steps: internalSteps,
    useStepper: useStepperHook
  }
}

/** Exports step form factory and hook for building multi-step forms. */
export { defineSteps }

/** biome-ignore-all lint/nursery/noComponentHookFactories: factory returns hook by design */
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
/* eslint-disable complexity */
'use client'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useReducer as useStdbReducer } from 'spacetimedb/react'
import type { RetryOptions } from '../retry'
import type { UndefinedToOptional } from '../zod'
import type { MutationType } from './optimistic-store'
import { withRetry } from '../retry'
import { extractErrorData, getErrorMessage, getFirstFieldError, handleError } from '../server/helpers'
import { completeMutation, pushError, trackMutation } from './devtools'
import { makeTempId, useOptimisticStore } from './optimistic-store'
/** Options for configuring mutation wrappers and optimistic behavior. */
interface MutateOptions<A extends Record<string, unknown>, R = void> {
  getName?: (args: A) => string
  onError?: ((error: unknown) => void) | false
  onSettled?: (args: A, error: unknown, result?: R) => void
  onSuccess?: (result: R, args: A) => void
  optimistic?: boolean
  resolveId?: (args: A) => string | undefined
  retry?: number | RetryOptions
  toast?: MutateToast<A, R>
  type?: MutationType
}
/** Toast shorthand for mutation success/error messages. */
interface MutateToast<A extends Record<string, unknown>, R = void> {
  error?: ((error: unknown) => string) | string
  fieldErrors?: boolean
  success?: ((result: R, args: A) => string) | string
}
const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
/** Default mutation error handler. Toasts NOT_AUTHENTICATED and RATE_LIMITED with user-friendly messages, falls back to error message for other codes. */
const defaultOnError = (error: unknown) => {
  handleError(error, {
    NOT_AUTHENTICATED: () => {
      toast.error('Please log in')
    },
    RATE_LIMITED: () => {
      const data = extractErrorData(error)
      toast.error(
        data?.retryAfter
          ? `Too many requests, retry in ${Math.ceil(data.retryAfter / 1000)}s`
          : 'Too many requests, try again later'
      )
    },
    default: () => {
      const data = extractErrorData(error)
      const fieldErr = data?.fieldErrors ? Object.entries(data.fieldErrors)[0] : undefined
      toast.error(fieldErr ? `${fieldErr[0]}: ${fieldErr[1]}` : getErrorMessage(error))
    }
  })
}
const detectMutationType = (name: string): MutationType => {
  if (name.endsWith(':rm') || name.endsWith('.rm') || name.includes('delete') || name.includes('remove')) return 'delete'
  if (name.endsWith(':update') || name.endsWith('.update') || name.includes('patch')) return 'update'
  return 'create'
}
/** Wraps a mutation with optimistic updates, devtools tracking, and toast errors.
 * @param mutate - Mutation function to execute
 * @param options - Optimistic and error-handling options
 * @returns Stable callback that executes the mutation
 * @example
 * ```ts
 * const save = useMutate(api.posts.update, { optimistic: true })
 * ```
 */
const resolveToastError = <A extends Record<string, unknown>, R = void>(
  opts?: MutateOptions<A, R>
): ((error: unknown) => void) | undefined => {
  const t = opts?.toast
  if (opts?.onError === false) return
  if (opts?.onError) return opts.onError
  if (!t) return defaultOnError
  const fieldErrors = t.fieldErrors !== false
  return (error: unknown) => {
    if (fieldErrors) {
      const msg = getFirstFieldError(error)
      if (msg) {
        toast.error(msg)
        return
      }
    }
    const errMsg = t.error
    if (errMsg) {
      toast.error(typeof errMsg === 'function' ? errMsg(error) : errMsg)
      return
    }
    defaultOnError(error)
  }
}
const resolveToastSuccess = <A extends Record<string, unknown>, R = void>(
  opts?: MutateOptions<A, R>
): ((result: R, args: A) => void) | undefined => {
  const userCb = opts?.onSuccess
  const successMsg = opts?.toast?.success
  if (userCb || successMsg)
    return (result: R, args: A) => {
      userCb?.(result, args)
      if (successMsg) toast.success(typeof successMsg === 'function' ? successMsg(result, args) : successMsg)
    }
}
/** Wraps a mutation function with devtools tracking, error toasting, and optional retry. */
const useMutate = <A extends Record<string, unknown>, R = void>(
  mutate: (args: A) => Promise<R>,
  options?: MutateOptions<A, R>
): ((args: A) => Promise<R>) => {
  const store = useOptimisticStore()
  const isOptimistic = options?.optimistic !== false
  const errorHandler = resolveToastError(options)
  const successHandler = resolveToastSuccess(options)
  return useCallback(
    async (args: A): Promise<R> => {
      const name = options?.getName?.(args) ?? (mutate.name || 'mutation')
      const type = options?.type ?? detectMutationType(name)
      const devId = isDev ? trackMutation(name, args) : 0
      const retryOpt = options?.retry
      const exec = retryOpt
        ? async () =>
            withRetry(async () => mutate(args), typeof retryOpt === 'number' ? { maxAttempts: retryOpt } : retryOpt)
        : async () => mutate(args)
      if (!(store && isOptimistic))
        try {
          const result = await exec()
          if (isDev && devId) completeMutation(devId, 'success')
          successHandler?.(result, args)
          options?.onSettled?.(args, undefined, result)
          return result
        } catch (catchError) {
          if (isDev) {
            if (devId) completeMutation(devId, 'error')
            pushError(catchError)
          }
          if (errorHandler) errorHandler(catchError)
          options?.onSettled?.(args, catchError)
          throw catchError
        }
      const tempId = makeTempId()
      const id = options?.resolveId?.(args) ?? (typeof args.id === 'string' ? args.id : tempId)
      store.add({
        args,
        id,
        tempId,
        timestamp: Date.now(),
        type
      })
      try {
        const result = await exec()
        if (isDev && devId) completeMutation(devId, 'success')
        successHandler?.(result, args)
        options?.onSettled?.(args, undefined, result)
        return result
      } catch (catchError) {
        if (isDev) {
          if (devId) completeMutation(devId, 'error')
          pushError(catchError)
        }
        if (errorHandler) errorHandler(catchError)
        options?.onSettled?.(args, catchError)
        throw catchError
      } finally {
        store.remove(tempId)
        if (id !== tempId) store.reconcileIds([id])
      }
    },
    [errorHandler, isOptimistic, mutate, options, store, successHandler]
  )
}
const inferReducerName = (reducer: unknown): string | undefined => {
  if (typeof reducer === 'object' && reducer !== null) {
    const r = reducer as Record<string, unknown>
    if (typeof r.accessorName === 'string') return r.accessorName
    if (typeof r.name === 'string') return r.name
  }
}
const useMutation = <A extends Record<string, unknown>, R = void, D = unknown>(
  useReducerHook: (desc: D) => (args: A) => Promise<R>,
  reducer: D,
  options?: MutateOptions<A, R>
): ((args: UndefinedToOptional<A>) => Promise<R>) => {
  const inferredName = inferReducerName(reducer)
  const opts = inferredName && !options?.getName ? { ...options, getName: () => inferredName } : options
  const strict = useMutate(useReducerHook(reducer), opts)
  return async (args: UndefinedToOptional<A>) => strict(args as Record<string, unknown> as A)
}
const useMut = <A extends Record<string, unknown>, R = void>(
  reducer: unknown,
  options?: MutateOptions<A, R>
): ((args: UndefinedToOptional<A>) => Promise<R>) =>
  useMutation(useStdbReducer as unknown as (desc: unknown) => (args: A) => Promise<R>, reducer, options)
export type { MutateOptions, MutateToast }
export { defaultOnError, useMut, useMutate, useMutation }

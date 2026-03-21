/** biome-ignore-all lint/style/noProcessEnv: env detection */
/* eslint-disable complexity, @typescript-eslint/no-unsafe-return */
'use client'
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'
import { useMutation } from 'convex/react'
import { useCallback } from 'react'
import { toast } from 'sonner'
import type { RetryOptions } from '../retry'
import type { MutationType } from './optimistic-store'
import { withRetry } from '../retry'
import { extractErrorData, getErrorMessage, handleConvexError } from '../server/helpers'
import { completeMutation, pushError, trackMutation } from './devtools'
import { makeTempId, useOptimisticStore } from './optimistic-store'
interface MutateOptions<A = unknown, R = unknown> {
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
interface MutateToast<A = unknown, R = unknown> {
  error?: ((error: unknown) => string) | string
  fieldErrors?: boolean
  success?: ((result: R, args: A) => string) | string
}
type MutationRef = FunctionReference<'mutation'>
const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production',
  getMutationName = (ref: MutationRef): string =>
    typeof ref === 'string' ? ref : ((ref as { _name?: string })._name ?? 'unknown'),
  defaultOnError = (error: unknown) => {
    handleConvexError(error, {
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
        toast.error(getErrorMessage(error))
      }
    })
  },
  getFirstFieldError = (error: unknown): string | undefined => {
    const data = extractErrorData(error),
      fieldErrors = data?.fieldErrors
    if (!fieldErrors) return
    const keys = Object.keys(fieldErrors)
    for (const key of keys) {
      const message = fieldErrors[key]
      if (message) return message
    }
  },
  resolveToastError = <A = unknown, R = unknown>(
    options?: MutateOptions<A, R>
  ): ((error: unknown) => void) | undefined => {
    const toastOptions = options?.toast
    if (options?.onError === false) return
    if (options?.onError) return options.onError
    if (!toastOptions) return defaultOnError
    const useFieldErrors = toastOptions.fieldErrors !== false
    return (error: unknown) => {
      if (useFieldErrors) {
        const fieldMessage = getFirstFieldError(error)
        if (fieldMessage) {
          toast.error(fieldMessage)
          return
        }
      }
      const errMessage = toastOptions.error
      if (errMessage) {
        toast.error(typeof errMessage === 'function' ? errMessage(error) : errMessage)
        return
      }
      defaultOnError(error)
    }
  },
  resolveToastSuccess = <A = unknown, R = unknown>(
    options?: MutateOptions<A, R>
  ): ((result: R, args: A) => void) | undefined => {
    const userCb = options?.onSuccess,
      successMessage = options?.toast?.success
    if (userCb || successMessage)
      return (result: R, args: A) => {
        userCb?.(result, args)
        if (successMessage)
          toast.success(typeof successMessage === 'function' ? successMessage(result, args) : successMessage)
      }
  },
  detectMutationType = (ref: MutationRef): MutationType => {
    const name = getMutationName(ref)
    if (name.endsWith(':rm') || name.endsWith('.rm') || name.includes('delete') || name.includes('remove')) return 'delete'
    if (name.endsWith(':update') || name.endsWith('.update') || name.includes('patch')) return 'update'
    return 'create'
  },
  /**
   * Wraps a Convex mutation with optimistic store tracking, devtools integration, and default error toasting.
   *
   * By default, errors are shown as toast notifications with smart routing for auth and rate-limit errors.
   * Pass `onError: false` to disable, or `onError: (e) => {...}` for custom handling.
   *
   * @example
   * ```tsx
   * const update = useMutate(api.blog.update)
   * const remove = useMutate(api.blog.rm, { onError: false })
   * ```
   */
  useMutate = <T extends MutationRef>(
    ref: T,
    options?: MutateOptions<OptionalRestArgs<T>[0], FunctionReturnType<T>>
  ): ((args: OptionalRestArgs<T>[0]) => Promise<FunctionReturnType<T>>) => {
    const mutate = useMutation(ref),
      store = useOptimisticStore(),
      isOptimistic = options?.optimistic !== false,
      errorHandler = resolveToastError(options),
      successHandler = resolveToastSuccess(options),
      getName = options?.getName,
      onSettled = options?.onSettled,
      resolveId = options?.resolveId,
      retryOptions = options?.retry,
      type = options?.type
    return useCallback(
      async (args: OptionalRestArgs<T>[0]): Promise<FunctionReturnType<T>> => {
        const argsRecord = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {},
          mutationType = type ?? detectMutationType(ref),
          name = getName?.(args) ?? getMutationName(ref),
          devId = isDev ? trackMutation(name, argsRecord) : 0,
          exec = retryOptions
            ? async () =>
                withRetry(
                  async () => (mutate as (a: OptionalRestArgs<T>[0]) => Promise<FunctionReturnType<T>>)(args),
                  typeof retryOptions === 'number' ? { maxAttempts: retryOptions } : retryOptions
                )
            : async () => (mutate as (a: OptionalRestArgs<T>[0]) => Promise<FunctionReturnType<T>>)(args)
        if (!(store && isOptimistic))
          try {
            const result = await exec()
            if (isDev && devId) completeMutation(devId, 'success')
            successHandler?.(result, args)
            onSettled?.(args, undefined, result)
            return result
          } catch (error) {
            if (isDev) {
              if (devId) completeMutation(devId, 'error')
              pushError(error)
            }
            if (errorHandler) errorHandler(error)
            onSettled?.(args, error)
            throw error
          }
        const tempId = makeTempId(),
          id = resolveId?.(args) ?? (argsRecord.id as string | undefined)
        store.add({
          args: argsRecord,
          id: id ?? tempId,
          tempId,
          timestamp: Date.now(),
          type: mutationType
        })
        try {
          const result = await exec()
          if (isDev && devId) completeMutation(devId, 'success')
          successHandler?.(result, args)
          onSettled?.(args, undefined, result)
          return result
        } catch (error) {
          if (isDev) {
            if (devId) completeMutation(devId, 'error')
            pushError(error)
          }
          if (errorHandler) errorHandler(error)
          onSettled?.(args, error)
          throw error
        } finally {
          store.remove(tempId)
        }
      },
      [errorHandler, getName, isOptimistic, mutate, onSettled, ref, resolveId, retryOptions, store, successHandler, type]
    )
  }
export type { MutateOptions, MutateToast }
export { defaultOnError, useMutate }

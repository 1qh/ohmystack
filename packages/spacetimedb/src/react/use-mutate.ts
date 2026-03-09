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

interface MutateToast<A extends Record<string, unknown>, R = void> {
  error?: ((error: unknown) => string) | string
  fieldErrors?: boolean
  success?: ((result: R, args: A) => string) | string
}

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production',
  
  defaultOnError = (error: unknown) => {
    handleError(error, {
      default: () => {
        toast.error(getErrorMessage(error))
      },
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
      }
    })
  },
  detectMutationType = (name: string): MutationType => {
    if (name.endsWith(':rm') || name.endsWith('.rm') || name.includes('delete') || name.includes('remove')) return 'delete'
    if (name.endsWith(':update') || name.endsWith('.update') || name.includes('patch')) return 'update'
    return 'create'
  },
  
  resolveToastError = <A extends Record<string, unknown>, R = void>(
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
  },
  resolveToastSuccess = <A extends Record<string, unknown>, R = void>(
    opts?: MutateOptions<A, R>
  ): ((result: R, args: A) => void) | undefined => {
    const userCb = opts?.onSuccess,
      successMsg = opts?.toast?.success
    if (userCb || successMsg)
      return (result: R, args: A) => {
        userCb?.(result, args)
        if (successMsg) toast.success(typeof successMsg === 'function' ? successMsg(result, args) : successMsg)
      }
  },
  
  useMutate = <A extends Record<string, unknown>, R = void>(
    mutate: (args: A) => Promise<R>,
    options?: MutateOptions<A, R>
  ): ((args: A) => Promise<R>) => {
    const store = useOptimisticStore(),
      isOptimistic = options?.optimistic !== false,
      errorHandler = resolveToastError(options),
      successHandler = resolveToastSuccess(options)

    return useCallback(
      async (args: A): Promise<R> => {
        const name = options?.getName?.(args) ?? (mutate.name || 'mutation'),
          type = options?.type ?? detectMutationType(name),
          devId = isDev ? trackMutation(name, args) : 0,
          retryOpt = options?.retry,
          exec = retryOpt
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

        const tempId = makeTempId(),
          id = options?.resolveId?.(args) ?? (typeof args.id === 'string' ? args.id : tempId)
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
  },
  inferReducerName = (reducer: unknown): string | undefined => {
    if (typeof reducer === 'object' && reducer !== null) {
      const r = reducer as Record<string, unknown>
      if (typeof r.accessorName === 'string') return r.accessorName
      if (typeof r.name === 'string') return r.name
    }
  },
  useMutation = <A extends Record<string, unknown>, R = void, D = unknown>(
    useReducerHook: (desc: D) => (args: A) => Promise<R>,
    reducer: D,
    options?: MutateOptions<A, R>
  ): ((args: UndefinedToOptional<A>) => Promise<R>) => {
    const inferredName = inferReducerName(reducer),
      opts = inferredName && !options?.getName ? { ...options, getName: () => inferredName } : options,
      strict = useMutate(useReducerHook(reducer), opts)
    return async (args: UndefinedToOptional<A>) => strict(args as Record<string, unknown> as A)
  },
  useMut = <A extends Record<string, unknown>, R = void>(
    reducer: unknown,
    options?: MutateOptions<A, R>
  ): ((args: UndefinedToOptional<A>) => Promise<R>) =>
    useMutation(useStdbReducer as unknown as (desc: unknown) => (args: A) => Promise<R>, reducer, options),
  relax =
    <A extends Record<string, unknown>, R>(fn: (args: A) => Promise<R>): ((args: UndefinedToOptional<A>) => Promise<R>) =>
    async (args: UndefinedToOptional<A>) =>
      fn(args as Record<string, unknown> as A)

export type { MutateOptions, MutateToast }
export { defaultOnError, relax, useMut, useMutate, useMutation }

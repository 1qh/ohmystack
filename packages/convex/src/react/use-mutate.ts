/** biome-ignore-all lint/style/noProcessEnv: env detection */
'use client'

import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'

import { useMutation } from 'convex/react'
import { useCallback } from 'react'
import { toast } from 'sonner'

import type { MutationType } from './optimistic-store'

import { extractErrorData, getErrorMessage, handleConvexError } from '../server/helpers'
import { completeMutation, pushError, trackMutation } from './devtools'
import { makeTempId, useOptimisticStore } from './optimistic-store'

/** Options for useMutate: whether to use optimistic updates, the mutation type, and error handling. */
interface MutateOptions {
  onError?: ((error: unknown) => void) | false
  optimistic?: boolean
  type?: MutationType
}

type MutationRef = FunctionReference<'mutation'>

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production',
  getMutationName = (ref: MutationRef): string =>
    typeof ref === 'string' ? ref : ((ref as { _name?: string })._name ?? 'unknown'),
  defaultOnError = (error: unknown) => {
    handleConvexError(error, {
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
    options?: MutateOptions
  ): ((args: OptionalRestArgs<T>[0]) => Promise<FunctionReturnType<T>>) => {
    const mutate = useMutation(ref),
      store = useOptimisticStore(),
      isOptimistic = options?.optimistic !== false,
      errorHandler = options?.onError === false ? undefined : (options?.onError ?? defaultOnError)

    return useCallback(
      async (args: OptionalRestArgs<T>[0]): Promise<FunctionReturnType<T>> => {
        const type = options?.type ?? detectMutationType(ref),
          name = getMutationName(ref),
          devId = isDev ? trackMutation(name, args as Record<string, unknown>) : 0

        if (!(store && isOptimistic))
          try {
            const result = await (mutate as (a: OptionalRestArgs<T>[0]) => Promise<FunctionReturnType<T>>)(args)
            if (isDev && devId) completeMutation(devId, 'success')
            return result
          } catch (error) {
            if (isDev) {
              if (devId) completeMutation(devId, 'error')
              pushError(error)
            }
            if (errorHandler) errorHandler(error)
            throw error
          }

        const tempId = makeTempId(),
          id = (args as Record<string, unknown>).id as string | undefined
        store.add({
          args: args as Record<string, unknown>,
          id: id ?? tempId,
          tempId,
          timestamp: Date.now(),
          type
        })

        try {
          const result = await (mutate as (a: OptionalRestArgs<T>[0]) => Promise<FunctionReturnType<T>>)(args)
          if (isDev && devId) completeMutation(devId, 'success')
          return result
        } catch (error) {
          if (isDev) {
            if (devId) completeMutation(devId, 'error')
            pushError(error)
          }
          if (errorHandler) errorHandler(error)
          throw error
        } finally {
          store.remove(tempId)
        }
      },
      [errorHandler, isOptimistic, mutate, options?.type, ref, store]
    )
  }

export type { MutateOptions }
export { defaultOnError, useMutate }

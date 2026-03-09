'use client'

import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'

import { useMutation } from 'convex/react'
import { useCallback, useRef, useState } from 'react'

type Args<T extends MutationFn> = OptionalRestArgs<T>[0]
type MutationFn = FunctionReference<'mutation'>

interface OptimisticOptions<T extends MutationFn, R = FunctionReturnType<T>> {
  mutation: T
  onOptimistic?: (args: Args<T>) => void
  onRollback?: (args: Args<T>, catchError: Error) => void
  onSuccess?: (result: R, args: Args<T>) => void
}

/** Wraps a Convex mutation with optimistic callback, automatic rollback on error, and pending state. */
const useOptimisticMutation = <T extends MutationFn>({
  mutation,
  onOptimistic,
  onRollback,
  onSuccess
}: OptimisticOptions<T>) => {
  const mutate = useMutation(mutation),
    [isPending, setIsPending] = useState(false),
    [mutationError, setMutationError] = useState<Error | null>(null),
    pendingCountRef = useRef(0),
    execute = useCallback(
      async (args: Args<T>): Promise<FunctionReturnType<T> | null> => {
        pendingCountRef.current += 1
        setIsPending(true)
        setMutationError(null)
        onOptimistic?.(args)
        try {
          const result = await (mutate as (a: Args<T>) => Promise<FunctionReturnType<T>>)(args)
          onSuccess?.(result, args)
          return result
        } catch (error) {
          const err = error instanceof Error ? error : new Error('Mutation failed')
          setMutationError(err)
          onRollback?.(args, err)
          return null
        } finally {
          pendingCountRef.current -= 1
          if (pendingCountRef.current === 0) setIsPending(false)
        }
      },
      [mutate, onOptimistic, onRollback, onSuccess]
    )
  return { error: mutationError, execute, isPending }
}

export { useOptimisticMutation }

'use client'
import { useCallback, useRef, useState } from 'react'
interface OptimisticOptions<A, R = void> {
  mutate: (args: A) => Promise<R>
  onOptimistic?: (args: A) => void
  onRollback?: (args: A, catchError: Error) => void
  onSettled?: (args: A, error: unknown, result?: R) => void
  onSuccess?: (result: R, args: A) => void
}
/**
 * Executes a mutation with optimistic callbacks and rollback support.
 * @param options Mutation function and optimistic lifecycle callbacks.
 * @returns Pending state, latest error, and an `execute` callback.
 */
const useOptimisticMutation = <A, R = void>({
  mutate,
  onOptimistic,
  onRollback,
  onSettled,
  onSuccess
}: OptimisticOptions<A, R>) => {
  const [isPending, setIsPending] = useState(false),
    [mutationError, setMutationError] = useState<Error | null>(null),
    pendingCountRef = useRef(0),
    execute = useCallback(
      async (args: A): Promise<null | R> => {
        pendingCountRef.current += 1
        setIsPending(true)
        setMutationError(null)
        onOptimistic?.(args)
        try {
          const result = await mutate(args)
          onSuccess?.(result, args)
          onSettled?.(args, undefined, result)
          return result
        } catch (error) {
          const err = error instanceof Error ? error : new Error('Mutation failed')
          setMutationError(err)
          onRollback?.(args, err)
          onSettled?.(args, error)
          return null
        } finally {
          pendingCountRef.current -= 1
          if (pendingCountRef.current === 0) setIsPending(false)
        }
      },
      [mutate, onOptimistic, onRollback, onSettled, onSuccess]
    )
  return { error: mutationError, execute, isPending }
}
export type { OptimisticOptions }
export { useOptimisticMutation }

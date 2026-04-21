'use client'
import { useCallback, useRef, useState } from 'react'
interface OptimisticOptions<A, R = void> {
  mutate: (args: A) => Promise<R>
  onOptimistic?: (args: A) => void
  onRollback?: (args: A, catchError: Error) => void
  onSettled?: (args: A, error: unknown, result?: R) => void
  onSuccess?: (result: R, args: A) => void
}
const useOptimisticMutation = <A, R = void>({
  mutate,
  onOptimistic,
  onRollback,
  onSettled,
  onSuccess
}: OptimisticOptions<A, R>) => {
  const [isPending, setIsPending] = useState(false)
  const [mutationError, setMutationError] = useState<Error | null>(null)
  const pendingCountRef = useRef(0)
  const errorSourceRef = useRef(0)
  const mutationIdRef = useRef(0)
  const execute = useCallback(
    async (args: A): Promise<null | R> => {
      mutationIdRef.current += 1
      const myId = mutationIdRef.current
      pendingCountRef.current += 1
      setIsPending(true)
      if (errorSourceRef.current === 0) setMutationError(null)
      onOptimistic?.(args)
      try {
        const result = await mutate(args)
        if (errorSourceRef.current === myId) {
          errorSourceRef.current = 0
          setMutationError(null)
        }
        onSuccess?.(result, args)
        onSettled?.(args, undefined, result)
        return result
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Mutation failed')
        errorSourceRef.current = myId
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

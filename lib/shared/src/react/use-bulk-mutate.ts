'use client'
import { useCallback, useId, useState } from 'react'
import { toast } from 'sonner'
interface BulkMutateToast {
  error?: ((error: unknown) => string) | string
  loading?: ((progress: BulkProgress) => string) | string
  success?: ((count: number) => string) | string
}
interface BulkProgress {
  failed: number
  pending: number
  succeeded: number
  total: number
}
interface BulkResult<R> {
  errors: unknown[]
  results: R[]
  settled: PromiseSettledResult<R>[]
}
interface UseBulkMutateOptions {
  onError?: ((error: unknown) => void) | false
  onProgress?: (progress: BulkProgress) => void
  onSettled?: (result: BulkResult<unknown>) => void
  onSuccess?: (count: number) => void
  toast?: BulkMutateToast
}
const collectSettled = <R>(settled: PromiseSettledResult<R>[]): { errors: unknown[]; results: R[] } => {
  const results: R[] = []
  const errors: unknown[] = []
  for (const s of settled)
    if (s.status === 'fulfilled') results.push(s.value)
    else errors.push(s.reason)
  return { errors, results }
}
const resolveBulkError = (
  opts: undefined | UseBulkMutateOptions,
  defaultOnError: (error: unknown) => void
): ((error: unknown) => void) | undefined => {
  if (opts?.onError === false) return
  if (opts?.onError) return opts.onError
  const errCfg = opts?.toast?.error
  if (errCfg)
    return (error: unknown) => {
      toast.error(typeof errCfg === 'function' ? errCfg(error) : errCfg)
    }
  return defaultOnError
}
const useBulkMutate = <A, R = void>({
  bulkMax,
  defaultOnError,
  mutate,
  options,
  packageName
}: {
  bulkMax: number
  defaultOnError: (error: unknown) => void
  mutate: (args: A) => Promise<R>
  options?: UseBulkMutateOptions
  packageName: string
}) => {
  const [isPending, setIsPending] = useState(false)
  const [progress, setProgress] = useState<BulkProgress | null>(null)
  const toastId = useId()
  const errorHandler = resolveBulkError(options, defaultOnError)
  const toastCfg = options?.toast
  const run = useCallback(
    async (items: A[]): Promise<BulkResult<R>> => {
      if (items.length === 0) return { errors: [], results: [], settled: [] }
      if (items.length > bulkMax)
        throw new Error(`Bulk operation exceeds maximum of ${bulkMax} items (got ${items.length})`)
      setIsPending(true)
      const total = items.length
      let succeeded = 0
      let failed = 0
      const report = () => {
        const p: BulkProgress = { failed, pending: total - succeeded - failed, succeeded, total }
        setProgress(p)
        options?.onProgress?.(p)
        if (toastCfg?.loading) {
          const msg = typeof toastCfg.loading === 'function' ? toastCfg.loading(p) : toastCfg.loading
          toast.loading(msg, { id: toastId })
        }
      }
      report()
      try {
        const track = async (item: A): Promise<R> => {
          try {
            const result = await mutate(item)
            succeeded += 1
            report()
            return result
          } catch (trackError) {
            failed += 1
            report()
            throw trackError
          }
        }
        const tasks: Promise<R>[] = []
        for (const item of items) tasks.push(track(item))
        const settled = await Promise.allSettled(tasks)
        const { errors, results } = collectSettled(settled)
        if (toastCfg?.loading) toast.dismiss(toastId)
        if (errors.length > 0 && errorHandler) {
          errorHandler(errors[0])
          if (errors.length > 1) {
            // eslint-disable-next-line no-console
            console.error(`[${packageName}] Bulk operation: ${errors.length} of ${items.length} items failed`)
            for (let i = 1; i < errors.length; i += 1) console.error(`[${packageName}] Bulk error ${i + 1}:`, errors[i]) // eslint-disable-line no-console
          }
        }
        if (results.length > 0) {
          if (toastCfg?.success) {
            const msg = typeof toastCfg.success === 'function' ? toastCfg.success(results.length) : toastCfg.success
            toast.success(msg)
          }
          options?.onSuccess?.(results.length)
        }
        const bulkResult = { errors, results, settled }
        options?.onSettled?.(bulkResult)
        return bulkResult
      } finally {
        setIsPending(false)
        setProgress(null)
      }
    },
    [bulkMax, errorHandler, mutate, options, packageName, toastCfg, toastId]
  )
  return { isPending, progress, run }
}
export type { BulkMutateToast, BulkProgress, BulkResult, UseBulkMutateOptions }
export { collectSettled, resolveBulkError, useBulkMutate }

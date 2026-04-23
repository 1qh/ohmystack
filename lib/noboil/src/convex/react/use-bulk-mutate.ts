'use client'
import {
  collectSettled,
  resolveBulkError as resolveSharedBulkError,
  useBulkMutate as useSharedBulkMutate
} from '../../shared/react/use-bulk-mutate'
import { BULK_MAX } from '../constants'
import { defaultOnError } from './use-mutate'
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
const resolveBulkError = (opts?: UseBulkMutateOptions): ((error: unknown) => void) | undefined =>
  resolveSharedBulkError(opts, defaultOnError)
const useBulkMutate = <A, R = void>(mutate: (args: A) => Promise<R>, options?: UseBulkMutateOptions) =>
  useSharedBulkMutate({
    bulkMax: BULK_MAX,
    defaultOnError,
    mutate,
    options,
    packageName: 'noboil/convex'
  })
export type { BulkMutateToast, BulkProgress, BulkResult, UseBulkMutateOptions }
export { collectSettled, resolveBulkError, useBulkMutate }

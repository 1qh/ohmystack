// biome-ignore-all lint/performance/noAwaitInLoops: x
// biome-ignore-all lint/suspicious/useAwait: x
import { createRetryUtils, DEFAULT_OPTIONS } from '@a/shared/retry'
import { sleep } from './constants'
interface RetryOptions {
  base?: number
  initialDelayMs?: number
  maxAttempts?: number
  maxDelayMs?: number
}
const validateRetryOptions = (opts: Required<RetryOptions>) => {
  if (opts.maxAttempts < 1)
    throw new Error(
      `[@noboil/spacetimedb] withRetry: maxAttempts must be >= 1 (got ${opts.maxAttempts}). Default: ${DEFAULT_OPTIONS.maxAttempts}.`
    )
  if (opts.initialDelayMs < 0)
    throw new Error(
      `[@noboil/spacetimedb] withRetry: initialDelayMs must be >= 0 (got ${opts.initialDelayMs}). Default: ${DEFAULT_OPTIONS.initialDelayMs}ms.`
    )
  if (opts.maxDelayMs < 0)
    throw new Error(
      `[@noboil/spacetimedb] withRetry: maxDelayMs must be >= 0 (got ${opts.maxDelayMs}). Default: ${DEFAULT_OPTIONS.maxDelayMs}ms.`
    )
  if (opts.base < 1)
    throw new Error(
      `[@noboil/spacetimedb] withRetry: base must be >= 1 (got ${opts.base}). Default: ${DEFAULT_OPTIONS.base}.`
    )
}
const { fetchWithRetry, withRetry } = createRetryUtils({
  sleep,
  validateOptions: validateRetryOptions,
  wrapFinalError: (error: Error, opts: Required<RetryOptions>) =>
    new Error(`${error.message} (after ${opts.maxAttempts} attempts)`, { cause: error })
})
export type { RetryOptions }
export { fetchWithRetry, withRetry }

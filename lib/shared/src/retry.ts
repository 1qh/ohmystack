// biome-ignore-all lint/performance/noAwaitInLoops: x
// biome-ignore-all lint/suspicious/useAwait: x
/* eslint-disable no-await-in-loop */

interface RetryOptions {
  base?: number
  initialDelayMs?: number
  maxAttempts?: number
  maxDelayMs?: number
}

interface RetryFactoryOptions {
  sleep: (ms: number) => Promise<void>
  validateOptions?: (opts: Required<RetryOptions>) => void
  wrapFinalError?: (error: Error, opts: Required<RetryOptions>) => Error
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    base: 2,
    initialDelayMs: 500,
    maxAttempts: 3,
    maxDelayMs: 10_000
  },
  calculateDelay = (attempt: number, opts: Required<RetryOptions>) => {
    const JITTER_RANGE = 0.3,
      JITTER_BASE = 0.85,
      jitter = Math.random() * JITTER_RANGE + JITTER_BASE
    return Math.min(opts.initialDelayMs * opts.base ** attempt * jitter, opts.maxDelayMs)
  },
  createRetryUtils = ({ sleep, validateOptions, wrapFinalError }: RetryFactoryOptions) => {
    const withRetry = async <T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> => {
        const opts = { ...DEFAULT_OPTIONS, ...options }
        validateOptions?.(opts)
        let lastError: Error = new Error('Retry failed')
        for (let attempt = 0; attempt < opts.maxAttempts; attempt += 1)
          try {
            return await fn()
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))
            if (attempt < opts.maxAttempts - 1) await sleep(calculateDelay(attempt, opts))
          }
        if (wrapFinalError) throw wrapFinalError(lastError, opts)
        throw lastError
      },
      fetchWithRetry = async (url: string, options?: RequestInit & { retry?: RetryOptions }): Promise<Response> => {
        const { retry, ...fetchOptions } = options ?? {}
        return withRetry(async () => {
          const response = await fetch(url, fetchOptions),
            SERVER_ERROR = 500
          if (!response.ok && response.status >= SERVER_ERROR)
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          return response
        }, retry)
      }
    return { fetchWithRetry, withRetry }
  }

export type { RetryFactoryOptions, RetryOptions }
export { calculateDelay, createRetryUtils, DEFAULT_OPTIONS }

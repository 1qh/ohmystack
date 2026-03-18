/* eslint-disable no-await-in-loop */
// biome-ignore-all lint/performance/noAwaitInLoops: x
// biome-ignore-all lint/suspicious/useAwait: x

import { sleep } from './constants'

interface RetryOptions {
  base?: number
  initialDelayMs?: number
  maxAttempts?: number
  maxDelayMs?: number
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
  validateRetryOptions = (opts: Required<RetryOptions>) => {
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
  },
  /** Retries an async function with exponential backoff and jitter. */
  withRetry = async <T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> => {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    validateRetryOptions(opts)
    let lastError: Error = new Error('Retry failed')
    for (let attempt = 0; attempt < opts.maxAttempts; attempt += 1)
      try {
        return await fn()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt < opts.maxAttempts - 1) await sleep(calculateDelay(attempt, opts))
      }
    throw new Error(`${lastError.message} (after ${opts.maxAttempts} attempts)`, { cause: lastError })
  },
  /** Fetches a URL with automatic retry on server errors. */
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

export type { RetryOptions }
export { fetchWithRetry, withRetry }

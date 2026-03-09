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

export { fetchWithRetry, withRetry }

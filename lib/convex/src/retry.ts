// biome-ignore-all lint/performance/noAwaitInLoops: x
// biome-ignore-all lint/suspicious/useAwait: x
/* eslint-disable no-await-in-loop */
import { createRetryUtils } from '@a/shared/retry'
import { sleep } from './constants'

interface RetryOptions {
  base?: number
  initialDelayMs?: number
  maxAttempts?: number
  maxDelayMs?: number
}

const { fetchWithRetry, withRetry } = createRetryUtils({ sleep })

export type { RetryOptions }
export { fetchWithRetry, withRetry }

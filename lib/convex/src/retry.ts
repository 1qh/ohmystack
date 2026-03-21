import type { RetryOptions } from '@a/shared/retry'
import { createRetryUtils } from '@a/shared/retry'
import { sleep } from './constants'
const { fetchWithRetry, withRetry } = createRetryUtils({ sleep })
export type { RetryOptions }
export { fetchWithRetry, withRetry }

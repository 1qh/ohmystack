// oxlint-disable eslint-plugin-unicorn/filename-case
import { defineRateLimits } from 'convex-helpers/server/rateLimit'

import type { MutationCtx } from './_generated/server'

const RATE_LIMITS = {
    delegation: { kind: 'token bucket' as const, period: 60_000, rate: 10 },
    mcpCall: { kind: 'token bucket' as const, period: 60_000, rate: 20 },
    searchCall: { kind: 'token bucket' as const, period: 60_000, rate: 30 },
    submitMessage: { kind: 'token bucket' as const, period: 60_000, rate: 20 }
  },
  { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits(RATE_LIMITS),
  enforceRateLimit = async ({ ctx, key, name }: { ctx: MutationCtx; key: string; name: keyof typeof RATE_LIMITS }) => {
    let result: { ok: boolean; retryAt?: number }
    try {
      result = await rateLimit(ctx, { key, name })
    } catch (error) {
      const payload =
        typeof error === 'object' && error && 'data' in error
          ? (error as { data?: { kind?: string; retryAt?: number } }).data
          : undefined
      if (payload?.kind === 'RateLimited') {
        const retryAt = payload.retryAt ?? 0
        throw new Error(`rate_limited:${name}:${retryAt}`, { cause: error })
      }
      throw new Error(`rate_limited:${name}`, { cause: error })
    }
    if (!result.ok) {
      const retryAt = result.retryAt ?? 0
      throw new Error(`rate_limited:${name}:${retryAt}`)
    }
  }

export { checkRateLimit, enforceRateLimit, rateLimit, resetRateLimit }

import { defineRateLimits } from 'convex-helpers/server/rateLimit'

import type { MutationCtx } from './_generated/server'

const RATE_LIMITS = {
    delegation: { kind: 'token bucket' as const, period: 60_000, rate: 10 },
    mcpCall: { kind: 'token bucket' as const, period: 60_000, rate: 20 },
    searchCall: { kind: 'token bucket' as const, period: 60_000, rate: 30 },
    submitMessage: { kind: 'token bucket' as const, period: 60_000, rate: 20 }
  },
  { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits(RATE_LIMITS),
  enforceRateLimit = async ({
    ctx,
    key,
    name
  }: {
    ctx: MutationCtx
    key: string
    name: keyof typeof RATE_LIMITS
  }) => {
    const isTestMode = process.env.CONVEX_TEST_MODE === 'true'
    if (isTestMode) return
    try {
      await checkRateLimit(ctx, { key, name, throws: true })
    } catch (_error) {
      throw new Error(`rate_limited:${name}`)
    }
  }

export { checkRateLimit, enforceRateLimit, rateLimit, resetRateLimit }

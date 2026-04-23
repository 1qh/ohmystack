'use client'
import type { FunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
interface ConvexQuotaRefs {
  check: FunctionReference<'query'>
  consume: FunctionReference<'mutation'>
  record: FunctionReference<'mutation'>
}
interface QuotaHookResult {
  consume: () => Promise<QuotaState>
  record: () => Promise<QuotaState>
  state: QuotaState | undefined
}
interface QuotaState {
  allowed: boolean
  remaining: number
  retryAfter?: number
}
const useQuota = (refs: ConvexQuotaRefs, owner: string): QuotaHookResult => {
  const state = useQuery(refs.check, { owner }) as QuotaState | undefined
  const consumeMut = useMutation(refs.consume)
  const recordMut = useMutation(refs.record)
  return {
    consume: async () => (await consumeMut({ owner })) as QuotaState,
    record: async () => (await recordMut({ owner })) as QuotaState,
    state
  }
}
export type { ConvexQuotaRefs, QuotaHookResult, QuotaState }
export { useQuota }

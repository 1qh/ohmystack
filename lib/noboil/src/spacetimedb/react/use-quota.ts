'use client'
import { useEffect, useState } from 'react'
import { useTable } from 'spacetimedb/react'
import { useMut } from './use-mutate'
interface QuotaHookResult {
  consume: () => Promise<void>
  record: () => Promise<void>
  state: QuotaState
}
interface QuotaRowBase {
  owner: string
  timestamps: number[]
}
interface QuotaState {
  allowed: boolean
  remaining: number
  retryAfter?: number
}
interface StdbQuotaRefs {
  config: { durationMs: number; limit: number }
  consume: unknown
  record: unknown
  table: unknown
}
const compute = ({
  durationMs,
  limit,
  now,
  timestamps
}: {
  durationMs: number
  limit: number
  now: number
  timestamps: number[]
}): QuotaState => {
  const cutoff = now - durationMs
  let count = 0
  let oldest = Number.POSITIVE_INFINITY
  for (const t of timestamps)
    if (t >= cutoff) {
      count += 1
      if (t < oldest) oldest = t
    }
  const remaining = Math.max(0, limit - count)
  if (remaining > 0) return { allowed: true, remaining }
  return { allowed: false, remaining: 0, retryAfter: oldest + durationMs - now }
}
const useQuota = (refs: StdbQuotaRefs, owner: string): QuotaHookResult => {
  const [rows] = useTable(refs.table as never) as [QuotaRowBase[], boolean]
  const consumeFn = useMut<Record<string, unknown>>(refs.consume)
  const recordFn = useMut<Record<string, unknown>>(refs.record)
  const [now, setNow] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(id)
  }, [])
  const row = rows.find(r => r.owner === owner)
  const state = compute({
    durationMs: refs.config.durationMs,
    limit: refs.config.limit,
    now,
    timestamps: row?.timestamps ?? []
  })
  return {
    consume: async () => {
      await consumeFn({ owner })
    },
    record: async () => {
      await recordFn({ owner })
    },
    state
  }
}
export type { QuotaHookResult, QuotaRowBase, QuotaState, StdbQuotaRefs }
export { useQuota }

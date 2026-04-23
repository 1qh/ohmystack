import type { DbLike, Mb, MutCtx, Qb, QuotaFactoryResult, QuotaResult } from './types'
import { idx, typed } from './bridge'
import { dbInsert, dbPatch } from './helpers'
const prune = (timestamps: number[], cutoff: number): number[] => {
  const out: number[] = []
  for (const t of timestamps) if (t >= cutoff) out.push(t)
  return out
}
const compute = (timestamps: number[], limit: number, durationMs: number, now: number): QuotaResult => {
  const cutoff = now - durationMs
  const pruned = prune(timestamps, cutoff)
  const remaining = Math.max(0, limit - pruned.length)
  if (pruned.length < limit) return { allowed: true, remaining }
  const oldest = pruned[0] ?? now
  return { allowed: false, remaining: 0, retryAfter: oldest + durationMs - now }
}
const makeQuota = ({
  builders,
  durationMs,
  limit,
  table
}: {
  builders: { m: Mb; q: Qb }
  durationMs: number
  limit: number
  table: string
}): QuotaFactoryResult => {
  const byOwner = async (db: DbLike, owner: string) =>
    db
      .query(table)
      .withIndex(
        'by_owner',
        idx(o => o.eq('owner', owner))
      )
      .unique()
  const check = builders.q({
    handler: typed(async (c: MutCtx, { owner }: { owner: string }) => {
      const doc = await byOwner(c.db, owner)
      const ts = doc?.timestamps ?? []
      return compute(ts, limit, durationMs, Date.now())
    })
  })
  const record = builders.m({
    handler: typed(async (c: MutCtx, { owner }: { owner: string }) => {
      const now = Date.now()
      const cutoff = now - durationMs
      const doc = (await byOwner(c.db, owner)) as null | { _id: string; timestamps?: number[] }
      const prev = doc?.timestamps ?? []
      const pruned = prune(prev, cutoff)
      const next = [...pruned, now]
      if (doc) await dbPatch(c.db, doc._id, { timestamps: next })
      else await dbInsert(c.db, table, { owner, timestamps: next })
      return compute(next, limit, durationMs, now)
    })
  })
  const consume = builders.m({
    handler: typed(async (c: MutCtx, { owner }: { owner: string }) => {
      const now = Date.now()
      const cutoff = now - durationMs
      const doc = (await byOwner(c.db, owner)) as null | { _id: string; timestamps?: number[] }
      const prev = doc?.timestamps ?? []
      const pruned = prune(prev, cutoff)
      if (pruned.length >= limit) {
        const oldest = pruned[0] ?? now
        return { allowed: false, remaining: 0, retryAfter: oldest + durationMs - now }
      }
      const next = [...pruned, now]
      if (doc) await dbPatch(c.db, doc._id, { timestamps: next })
      else await dbInsert(c.db, table, { owner, timestamps: next })
      return { allowed: true, remaining: Math.max(0, limit - next.length) }
    })
  })
  return typed({ check, consume, record })
}
export { makeQuota }

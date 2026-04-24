/** biome-ignore-all lint/complexity/useMaxParams: destructured builder options pattern matches singleton/cache-crud */
/* oxlint-disable eslint-plugin-unicorn(prefer-ternary) */
/* eslint-disable @typescript-eslint/max-params */
import { string } from 'zod/v4'
import type { DbCtx, DbLike, Mb, Qb, QuotaFactoryResult, QuotaResult } from './types'
import { idx, typed } from './bridge'
import { dbInsert, dbPatch } from './helpers'
const prune = (timestamps: number[], cutoff: number): number[] => {
  const out: number[] = []
  for (const t of timestamps) if (t >= cutoff) out.push(t)
  return out
}
const compute = (timestamps: number[], limit: number, durationMs: number, now: number): QuotaResult => {
  const pruned = prune(timestamps, now - durationMs)
  const remaining = Math.max(0, limit - pruned.length)
  if (pruned.length < limit) return { allowed: true, remaining }
  const oldest = pruned[0] ?? now
  return { allowed: false, remaining: 0, retryAfter: oldest + durationMs - now }
}
const persist = async (
  db: DbLike,
  table: string,
  doc: null | { _id: string },
  owner: string,
  timestamps: number[]
): Promise<void> => {
  if (doc) await dbPatch(db, doc._id, { timestamps })
  else await dbInsert(db, table, { owner, timestamps })
}
interface QuotaRow {
  _id: string
  timestamps?: number[]
}
const makeQuota = ({
  builders: b,
  durationMs,
  limit,
  table
}: {
  builders: { m: Mb; q: Qb }
  durationMs: number
  limit: number
  table: string
}): QuotaFactoryResult => {
  const byOwner = async (db: DbLike, owner: string): Promise<null | QuotaRow> =>
    (await db
      .query(table)
      .withIndex(
        'by_owner',
        idx(o => o.eq('owner', owner))
      )
      .unique()) as null | QuotaRow
  const ownerArgs = { owner: string() }
  const check = b.q({
    args: typed({ ...ownerArgs }),
    handler: typed(async (c: DbCtx, { owner }: { owner: string }) => {
      const doc = await byOwner(c.db, owner)
      return compute(doc?.timestamps ?? [], limit, durationMs, Date.now())
    })
  })
  const record = b.m({
    args: typed({ ...ownerArgs }),
    handler: typed(async (c: DbCtx, { owner }: { owner: string }) => {
      const now = Date.now()
      const doc = await byOwner(c.db, owner)
      const pruned = prune(doc?.timestamps ?? [], now - durationMs)
      const next = [...pruned, now]
      await persist(c.db, table, doc, owner, next)
      return compute(next, limit, durationMs, now)
    })
  })
  const consume = b.m({
    args: typed({ ...ownerArgs }),
    handler: typed(async (c: DbCtx, { owner }: { owner: string }) => {
      const now = Date.now()
      const doc = await byOwner(c.db, owner)
      const pruned = prune(doc?.timestamps ?? [], now - durationMs)
      if (pruned.length >= limit) {
        const oldest = pruned[0] ?? now
        return { allowed: false, remaining: 0, retryAfter: oldest + durationMs - now }
      }
      const next = [...pruned, now]
      await persist(c.db, table, doc, owner, next)
      return { allowed: true, remaining: Math.max(0, limit - next.length) }
    })
  })
  return typed({ check, consume, record })
}
export { makeQuota }

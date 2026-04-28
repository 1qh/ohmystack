/** biome-ignore-all lint/performance/noAwaitInLoops: sequential delete-by-creation-time */
/* eslint-disable no-await-in-loop */
/* oxlint-disable eslint(no-await-in-loop), eslint-plugin-unicorn(prefer-ternary), eslint(max-params), eslint-plugin-unicorn(useAwait) */
/* eslint-disable @typescript-eslint/max-params */
/** biome-ignore-all lint/suspicious/useAwait: handlers return thenable chains */
/** biome-ignore-all lint/complexity/useMaxParams: internal helper */
import { boolean, optional, string } from 'zod/v4'
import type { DbCtx, DbLike, HookCtx, Mb, MutCtx, Qb } from './types'
import { idx, typed } from './bridge'
import { dbInsert } from './helpers'
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const PRUNE_BATCH = 5000
const LIST_DEFAULT_LIMIT = 100
const LIST_MAX_LIMIT = 1000
interface AuditAppendInput {
  action: string
  actor: string
  args?: string
  mode?: string
  ok: boolean
  traceId?: string
}
interface AuditExports {
  append: ReturnType<Mb>
  listByActor: ReturnType<Qb>
  listByTrace: ReturnType<Qb>
  pruneStale: ReturnType<Mb>
  recent: ReturnType<Qb>
}
interface AuditHooks {
  afterAppend?: (ctx: HookCtx, args: { row: AuditAppendInput }) => Promise<void> | void
  afterPrune?: (ctx: HookCtx, args: { deleted: number }) => Promise<void> | void
  beforeAppend?: (ctx: HookCtx, args: { row: AuditAppendInput }) => Promise<void> | void
}
interface AuditRow {
  _creationTime: number
  _id: string
  action: string
  actor: string
  args?: string
  mode?: string
  ok: boolean
  traceId?: string
}
const hk = (c: MutCtx): HookCtx => ({ db: c.db, storage: c.storage, userId: c.user._id as string })
const queryRecent = async (db: DbLike, table: string, limit: number): Promise<AuditRow[]> =>
  (await db.query(table).order('desc').take(limit)) as unknown as AuditRow[]
const queryByActor = async (db: DbLike, table: string, actor: string, limit: number): Promise<AuditRow[]> =>
  (await db
    .query(table)
    .withIndex(
      'by_actor',
      idx(o => o.eq('actor', actor))
    )
    .order('desc')
    .take(limit)) as unknown as AuditRow[]
const queryByTrace = async (db: DbLike, table: string, traceId: string, limit: number): Promise<AuditRow[]> =>
  (await db
    .query(table)
    .withIndex(
      'by_trace',
      idx(o => o.eq('traceId', traceId))
    )
    .order('asc')
    .take(limit)) as unknown as AuditRow[]
const clampLimit = (n: number | undefined): number => {
  if (n === undefined) return LIST_DEFAULT_LIMIT
  return Math.max(1, Math.min(LIST_MAX_LIMIT, Math.floor(n)))
}
const makeAudit = ({
  builders: b,
  hooks,
  table,
  ttlMs = DEFAULT_TTL_MS
}: {
  builders: { m: Mb; q: Qb }
  hooks?: AuditHooks
  table: string
  ttlMs?: number
}): AuditExports => {
  const append = b.m({
    args: typed({
      action: string(),
      actor: string(),
      args: optional(string()),
      mode: optional(string()),
      ok: boolean(),
      traceId: optional(string())
    }),
    handler: typed(async (c: MutCtx, row: AuditAppendInput): Promise<void> => {
      if (hooks?.beforeAppend) await hooks.beforeAppend(hk(c), { row })
      await dbInsert(c.db, table, row as unknown as Record<string, unknown>)
      if (hooks?.afterAppend) await hooks.afterAppend(hk(c), { row })
    })
  })
  const recent = b.q({
    args: typed({ limit: optional(string()) }),
    handler: typed(async (c: DbCtx, args: { limit?: string }): Promise<AuditRow[]> => {
      const lim = clampLimit(args.limit ? Number(args.limit) : undefined)
      return queryRecent(c.db, table, lim)
    })
  })
  const listByActor = b.q({
    args: typed({ actor: string(), limit: optional(string()) }),
    handler: typed(async (c: DbCtx, args: { actor: string; limit?: string }): Promise<AuditRow[]> => {
      const lim = clampLimit(args.limit ? Number(args.limit) : undefined)
      return queryByActor(c.db, table, args.actor, lim)
    })
  })
  const listByTrace = b.q({
    args: typed({ limit: optional(string()), traceId: string() }),
    handler: typed(async (c: DbCtx, args: { limit?: string; traceId: string }): Promise<AuditRow[]> => {
      const lim = clampLimit(args.limit ? Number(args.limit) : undefined)
      return queryByTrace(c.db, table, args.traceId, lim)
    })
  })
  const pruneStale = b.m({
    args: typed({}),
    handler: typed(async (c: MutCtx): Promise<{ deleted: number }> => {
      const cutoff = Date.now() - ttlMs
      const old = (await c.db.query(table).order('asc').take(PRUNE_BATCH)) as unknown as AuditRow[]
      let deleted = 0
      for (const row of old) {
        if (row._creationTime >= cutoff) break
        await c.db.delete(row._id)
        deleted += 1
      }
      if (hooks?.afterPrune) await hooks.afterPrune(hk(c), { deleted })
      return { deleted }
    })
  })
  return typed({ append, listByActor, listByTrace, pruneStale, recent })
}
export type { AuditAppendInput, AuditExports, AuditHooks, AuditRow }
export { makeAudit }

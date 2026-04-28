/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
/* oxlint-disable eslint/no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB mutations */
/* eslint-disable no-await-in-loop */
/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
/* oxlint-disable eslint(no-underscore-dangle) */
import type { GenericDataModel } from 'convex/server'
import type { ZodObject, ZodRawShape } from 'zod/v4'
import { zodOutputToConvexFields as z2c, zid } from 'convex-helpers/server/zod4'
import { anyApi } from 'convex/server'
import { v } from 'convex/values'
import { boolean, number } from 'zod/v4'
import type { ActionCtxLike, CacheBuilders, CacheCrudResult, CacheHooks, DbCtx, RateLimitInput, Rec } from './types'
import { BULK_MAX } from '../constants'
import { flt, idx as idxBridge, typed } from './bridge'
import { isTestMode } from './env'
import {
  checkRateLimit,
  dbDelete,
  dbInsert,
  dbPatch,
  err,
  noFetcher,
  normalizeRateLimit,
  pgOpts,
  pickFields,
  SEVEN_DAYS_MS,
  time
} from './helpers'
const chk = (c: DbCtx) => ({ db: c.db })
const makeCacheCrud = <S extends ZodRawShape, K extends string, DM extends GenericDataModel = GenericDataModel>({
  builders: b,
  fetcher,
  hooks,
  key,
  rateLimit: rlInput,
  schema,
  staleWhileRevalidate: swr,
  table,
  ttl = SEVEN_DAYS_MS
}: {
  builders: CacheBuilders<DM>
  fetcher?: (c: unknown, key: unknown) => Promise<unknown>
  hooks?: CacheHooks
  key: K
  rateLimit?: RateLimitInput
  schema: ZodObject<S>
  staleWhileRevalidate?: boolean
  table: string
  ttl?: number
}): CacheCrudResult<S> => {
  const rl = rlInput ? normalizeRateLimit(rlInput) : undefined
  const keys = Object.keys(schema.shape)
  const pick = (d: Rec) => pickFields(d, keys)
  const valid = (d: Rec) => ((d.updatedAt as number | undefined) ?? (d._creationTime as number)) + ttl > Date.now()
  const partial = schema.partial()
  const indexName = `by_${key}` as const
  const kArgs = z2c(typed({ [key]: schema.shape[key] })) as Rec
  const idArgs = { id: zid(table) }
  const expArgs = { includeExpired: boolean().optional() }
  const listArgs = { includeExpired: boolean().optional(), paginationOpts: pgOpts }
  const retFields = z2c(schema.extend({ cacheHit: boolean() }).shape) as Rec
  const kVal = kArgs[key] ?? err('INVALID_WHERE')
  const byK = (x: unknown) => idxBridge(i => i.eq(key, x))
  const getInt = b.internalQuery({
    args: typed(kArgs),
    handler: typed(async (c: DbCtx, a: Rec) => c.db.query(table).withIndex(indexName, byK(a[key])).first())
  })
  const get = b.query({
    args: typed(kArgs),
    handler: typed(async (c: DbCtx, a: Rec) => {
      const d = await Promise.resolve(c.db.query(table).withIndex(indexName, byK(a[key])).first())
      if (!d) return null
      if (valid(d)) return { ...d, cacheHit: true, stale: false }
      return swr ? { ...d, cacheHit: true, stale: true } : null
    })
  })
  const read = b.cq({ args: idArgs, handler: typed(async (c: DbCtx, { id }: { id: string }) => c.db.get(id)) })
  const all = b.cq({
    args: expArgs,
    handler: typed(async (c: DbCtx, { includeExpired: ie }: { includeExpired?: boolean }) => {
      const d = await c.db.query(table).order('desc').collect()
      return ie ? d : d.filter(valid)
    })
  })
  const list = b.cq({
    args: listArgs,
    handler: typed(
      async (c: DbCtx, { includeExpired: ie, paginationOpts: op }: { includeExpired?: boolean; paginationOpts: Rec }) => {
        const qr = c.db.query(table).order('desc')
        if (ie) return qr.paginate(op)
        const target = op.numItems as number
        const collected: Rec[] = []
        let cursor = op.cursor as string | undefined
        let isDone = false
        while (collected.length < target && !isDone) {
          const {
            continueCursor,
            isDone: done,
            page
          } = await qr.paginate({
            ...op,
            cursor,
            numItems: target * 2
          })
          for (const item of page) if (collected.length < target && valid(item)) collected.push(item)
          cursor = continueCursor
          isDone = done
        }
        return { continueCursor: cursor ?? '', isDone, page: collected }
      }
    )
  })
  const upsert = async (c: DbCtx, data: Rec) => {
    const ex = await Promise.resolve(c.db.query(table).withIndex(indexName, byK(data[key])).first())
    const wt = { ...data, ...time() }
    if (ex) {
      await dbPatch(c.db, ex._id as string, wt)
      return ex._id
    }
    return dbInsert(c.db, table, wt)
  }
  const set = b.internalMutation({
    args: { data: v.object(typed(z2c(schema.shape))) },
    handler: typed(async (c: DbCtx, { data }: { data: Rec }) => {
      await upsert(c, pick(data))
    })
  })
  const create = b.cm({
    args: schema.shape,
    handler: typed(async (c: DbCtx, d: Rec) => {
      if (rl && !isTestMode()) await checkRateLimit(c.db, { config: rl, key: `global:${table}`, table })
      let data = d
      if (hooks?.beforeCreate) data = await hooks.beforeCreate(chk(c), { data })
      const id = await upsert(c, data)
      if (hooks?.afterCreate) await hooks.afterCreate(chk(c), { data, id: id as string })
      return id
    })
  })
  const checkRL = rl
    ? b.internalMutation({
        args: {},
        handler: typed(async (c: DbCtx) => {
          await checkRateLimit(c.db, { config: rl, key: `global:${table}`, table })
        })
      })
    : undefined
  const update = b.cm({
    args: { ...idArgs, ...partial.shape },
    handler: typed(async (c: DbCtx, a: Rec) => {
      const { id, ...d } = a as Rec & { id: string }
      const ex = await c.db.get(id)
      const t = time()
      if (!ex) return err('NOT_FOUND')
      let patch = d
      if (hooks?.beforeUpdate) patch = await hooks.beforeUpdate(chk(c), { id, patch, prev: ex })
      await dbPatch(c.db, id, { ...patch, ...t })
      const result = { ...ex, ...patch, ...t }
      if (hooks?.afterUpdate) await hooks.afterUpdate(chk(c), { id, patch, prev: ex })
      return result
    })
  })
  const rm = b.cm({
    args: idArgs,
    handler: typed(async (c: DbCtx, { id }: { id: string }) => {
      const d = await c.db.get(id)
      if (d) {
        if (hooks?.beforeDelete) await hooks.beforeDelete(chk(c), { doc: d, id })
        await c.db.delete(id)
        if (hooks?.afterDelete) await hooks.afterDelete(chk(c), { doc: d, id })
      }
      return d
    })
  })
  const invalidate = b.mutation({
    args: typed(kArgs),
    handler: typed(async (c: DbCtx, a: Rec) => {
      const d = await Promise.resolve(c.db.query(table).withIndex(indexName, byK(a[key])).first())
      if (d) await dbDelete(c.db, d._id as string)
      return d
    })
  })
  const purge = b.cm({
    args: { batchSize: number().optional() },
    handler: typed(async (c: DbCtx, { batchSize }: { batchSize?: number }) => {
      const cut = Date.now() - ttl
      const limit = Math.min(batchSize ?? BULK_MAX, BULK_MAX)
      const exp = await c.db
        .query(table)
        .filter(flt(qr => qr.lt(qr.field('_creationTime'), cut)))
        .take(limit)
      for (const d of exp) await dbDelete(c.db, d._id as string)
      return exp.length
    })
  })
  const tPath = (anyApi as Rec)[table] as Rec
  const tKArgs = { [key]: kVal } as Rec
  const doFetch = async (c: ActionCtxLike, kv: unknown) => {
    let d = pick((await fetcher?.(c, kv)) as Rec)
    if (hooks?.onFetch) d = await hooks.onFetch(d)
    await c.runMutation(tPath.set as string, { data: d })
    return { ...d, cacheHit: false }
  }
  const load = fetcher
    ? b.action({
        args: typed(tKArgs),
        handler: typed(async (c: ActionCtxLike, a: Rec) => {
          const kv = a[key]
          const d = await c.runQuery(tPath.getInternal as string, { [key]: kv })
          if (d && valid(d as Rec)) return { ...pick(d as Rec), cacheHit: true }
          if (checkRL && !isTestMode()) await c.runMutation(tPath.checkRL as string, {})
          return doFetch(c, kv)
        }),
        returns: v.object(typed(retFields))
      })
    : b.action(typed(noFetcher))
  const refresh = fetcher
    ? b.action({
        args: typed(tKArgs),
        handler: typed(async (c: ActionCtxLike, a: Rec) => {
          if (checkRL && !isTestMode()) await c.runMutation(tPath.checkRL as string, {})
          const kv = a[key]
          await c.runMutation(tPath.invalidate as string, { [key]: kv })
          return doFetch(c, kv)
        }),
        returns: v.object(typed(retFields))
      })
    : b.action(typed(noFetcher))
  return {
    all,
    checkRL,
    create,
    get,
    getInternal: getInt,
    invalidate,
    list,
    load,
    purge,
    read,
    refresh,
    rm,
    set,
    update
  }
}
export { makeCacheCrud }

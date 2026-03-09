/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
import type { GenericDataModel } from 'convex/server'
import type { ZodObject, ZodRawShape } from 'zod/v4'

import { zodOutputToConvexFields as z2c, zid } from 'convex-helpers/server/zod4'
import { anyApi } from 'convex/server'
import { v } from 'convex/values'
import { boolean, number } from 'zod/v4'

import type { ActionCtxLike, CacheBuilders, CacheCrudResult, CacheHooks, DbCtx, RateLimitConfig, Rec } from './types'

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
  pgOpts,
  pickFields,
  SEVEN_DAYS_MS,
  time
} from './helpers'

const chk = (c: DbCtx) => ({ db: c.db }),
  makeCacheCrud = <S extends ZodRawShape, K extends string, DM extends GenericDataModel = GenericDataModel>({
    builders: b,
    fetcher,
    hooks,
    key,
    rateLimit: rl,
    schema,
    staleWhileRevalidate: swr,
    table,
    ttl = SEVEN_DAYS_MS
  }: {
    builders: CacheBuilders<DM>
    fetcher?: (c: unknown, key: unknown) => Promise<unknown>
    hooks?: CacheHooks
    key: K
    rateLimit?: RateLimitConfig
    schema: ZodObject<S>
    staleWhileRevalidate?: boolean
    table: string
    ttl?: number
  }): CacheCrudResult<S> => {
    const keys = Object.keys(schema.shape),
      pick = (d: Rec) => pickFields(d, keys),
      valid = (d: Rec) => ((d.updatedAt as number | undefined) ?? (d._creationTime as number)) + ttl > Date.now(),
      partial = schema.partial(),
      indexName = `by_${key}` as const,
      kArgs = z2c(typed({ [key]: schema.shape[key] })) as Rec,
      idArgs = { id: zid(table) },
      expArgs = { includeExpired: boolean().optional() },
      listArgs = { includeExpired: boolean().optional(), paginationOpts: pgOpts },
      retFields = z2c(schema.extend({ cacheHit: boolean() }).shape) as Rec,
      kVal = kArgs[key] ?? err('INVALID_WHERE'),
      byK = (x: unknown) => idxBridge(i => i.eq(key, x)),
      getInt = b.internalQuery({
        args: typed(kArgs),
        handler: typed(async (c: DbCtx, a: Rec) => c.db.query(table).withIndex(indexName, byK(a[key])).first())
      }),
      get = b.query({
        args: typed(kArgs),
        handler: typed(async (c: DbCtx, a: Rec) => {
          const d = await Promise.resolve(c.db.query(table).withIndex(indexName, byK(a[key])).first())
          if (!d) return null
          if (valid(d)) return { ...d, cacheHit: true, stale: false }
          return swr ? { ...d, cacheHit: true, stale: true } : null
        })
      }),
      read = b.cq({ args: idArgs, handler: typed(async (c: DbCtx, { id }: { id: string }) => c.db.get(id)) }),
      all = b.cq({
        args: expArgs,
        handler: typed(async (c: DbCtx, { includeExpired: ie }: { includeExpired?: boolean }) => {
          const d = await c.db.query(table).order('desc').collect()
          return ie ? d : d.filter(valid)
        })
      }),
      list = b.cq({
        args: listArgs,
        handler: typed(
          async (
            c: DbCtx,
            { includeExpired: ie, paginationOpts: op }: { includeExpired?: boolean; paginationOpts: Rec }
          ) => {
            const qr = c.db.query(table).order('desc')
            if (ie) return qr.paginate(op)
            const { page, ...rest } = await qr.paginate({ ...op, numItems: (op.numItems as number) * 2 })
            return { ...rest, page: page.filter(valid).slice(0, op.numItems as number) }
          }
        )
      }),
      upsert = async (c: DbCtx, data: Rec) => {
        const ex = await Promise.resolve(c.db.query(table).withIndex(indexName, byK(data[key])).first()),
          wt = { ...data, ...time() }
        if (ex) {
          await dbPatch(c.db, ex._id as string, wt)
          return ex._id
        }
        return dbInsert(c.db, table, wt)
      },
      set = b.internalMutation({
        args: { data: v.object(typed(z2c(schema.shape))) },
        handler: typed(async (c: DbCtx, { data }: { data: Rec }) => {
          await upsert(c, pick(data))
        })
      }),
      create = b.cm({
        args: schema.shape,
        handler: typed(async (c: DbCtx, d: Rec) => {
          if (rl && !isTestMode()) await checkRateLimit(c.db, { config: rl, key: `global:${table}`, table })
          let data = d
          if (hooks?.beforeCreate) data = await hooks.beforeCreate(chk(c), { data })
          const id = await upsert(c, data)
          if (hooks?.afterCreate) await hooks.afterCreate(chk(c), { data, id: id as string })
          return id
        })
      }),
      checkRL = rl
        ? b.internalMutation({
            args: {},
            handler: typed(async (c: DbCtx) => {
              await checkRateLimit(c.db, { config: rl, key: `global:${table}`, table })
            })
          })
        : undefined,
      update = b.cm({
        args: { ...idArgs, ...partial.shape },
        handler: typed(async (c: DbCtx, a: Rec) => {
          const { id, ...d } = a as Rec & { id: string },
            ex = await c.db.get(id),
            t = time()
          if (!ex) return err('NOT_FOUND')
          let patch = d as Rec
          if (hooks?.beforeUpdate) patch = await hooks.beforeUpdate(chk(c), { id, patch, prev: ex })
          await dbPatch(c.db, id, { ...patch, ...t })
          const result = { ...ex, ...patch, ...t }
          if (hooks?.afterUpdate) await hooks.afterUpdate(chk(c), { id, patch, prev: ex })
          return result
        })
      }),
      rm = b.cm({
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
      }),
      invalidate = b.mutation({
        args: typed(kArgs),
        handler: typed(async (c: DbCtx, a: Rec) => {
          const d = await Promise.resolve(c.db.query(table).withIndex(indexName, byK(a[key])).first())
          if (d) await dbDelete(c.db, d._id as string)
          return d
        })
      }),
      purge = b.cm({
        args: { batchSize: number().optional() },
        handler: typed(async (c: DbCtx, { batchSize }: { batchSize?: number }) => {
          const cut = Date.now() - ttl,
            limit = Math.min(batchSize ?? BULK_MAX, BULK_MAX),
            exp = await c.db
              .query(table)
              .filter(flt(qr => qr.lt(qr.field('_creationTime'), cut)))
              .take(limit)
          // biome-ignore lint/performance/noAwaitInLoops: x
          for (const d of exp) await dbDelete(c.db, d._id as string)
          return exp.length
        })
      }),
      tPath = (anyApi as Rec)[table] as Rec,
      tKArgs = { [key]: kVal } as Rec,
      doFetch = async (c: ActionCtxLike, kv: unknown) => {
        let d = pick((await fetcher?.(c, kv)) as Rec)
        if (hooks?.onFetch) d = await hooks.onFetch(d)
        await c.runMutation(tPath.set as string, { data: d })
        return { ...d, cacheHit: false }
      },
      load = fetcher
        ? b.action({
            args: typed(tKArgs),
            handler: typed(async (c: ActionCtxLike, a: Rec) => {
              const kv = a[key],
                d = await c.runQuery(tPath.getInternal as string, { [key]: kv })
              if (d && valid(d as Rec)) return { ...pick(d as Rec), cacheHit: true }
              if (checkRL && !isTestMode()) await c.runMutation(tPath.checkRL as string, {})
              return doFetch(c, kv)
            }),
            returns: v.object(typed(retFields))
          })
        : b.action(typed(noFetcher)),
      refresh = fetcher
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
    } as unknown as CacheCrudResult<S>
  }

export { makeCacheCrud }

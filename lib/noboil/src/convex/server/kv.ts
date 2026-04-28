/** biome-ignore-all lint/suspicious/useAwait: handlers return thenable chains */
/* oxlint-disable typescript-eslint(no-unnecessary-condition) */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type { ZodObject, ZodRawShape } from 'zod/v4'
import { number, string } from 'zod/v4'
import type { CrudHooks, DbCtx, DbLike, HookCtx, KvFactoryResult, Mb, MutCtx, Qb, RateLimitConfig, Rec } from './types'
import { idx, typed } from './bridge'
import { isTestMode } from './env'
import {
  addUrls,
  checkRateLimit,
  cleanFiles,
  dbDelete,
  dbInsert,
  dbPatch,
  detectFiles,
  err,
  errValidation,
  pgOpts,
  time
} from './helpers'
const hk = (c: MutCtx): HookCtx => ({ db: c.db, storage: c.storage, userId: c.user._id as string })
const isSoftDeleted = (doc: null | Rec): boolean => doc?.deletedAt !== undefined
const makeKv = <S extends ZodRawShape>({
  builders: b,
  hooks,
  keys,
  rateLimit,
  schema,
  softDelete,
  table,
  writeRole
}: {
  builders: { m: Mb; q: Qb }
  hooks?: CrudHooks
  keys?: readonly string[]
  rateLimit?: RateLimitConfig
  schema: ZodObject<S>
  softDelete?: boolean
  table: string
  writeRole?: ((ctx: DbCtx) => boolean | Promise<boolean>) | boolean
}): KvFactoryResult<S> => {
  const fileFs = detectFiles(schema.shape)
  const addFileUrls = async (doc: null | Rec, storage: unknown): Promise<null | Rec> =>
    doc ? addUrls({ doc, fileFields: fileFs, storage: storage as never }) : doc
  const byKey = async (db: DbLike, key: string): Promise<null | Rec> =>
    db
      .query(table)
      .withIndex(
        'by_key',
        idx(o => o.eq('key', key))
      )
      .unique()
  const assertKey = (key: string) => (keys && !keys.includes(key) ? err('INVALID_KEY') : null)
  const assertWrite = async (c: MutCtx) => {
    if (writeRole === true) return null
    if (typeof writeRole === 'function') {
      const ok = await writeRole(c)
      if (ok) return null
    }
    return err('FORBIDDEN')
  }
  const rl = async (c: MutCtx) => {
    if (rateLimit && !isTestMode()) await checkRateLimit(c.db, { config: rateLimit, key: c.user._id as string, table })
  }
  const keyArgs = { key: string() }
  const setArgs = { expectedUpdatedAt: number().optional(), key: string(), payload: schema }
  const get = b.q({
    args: typed({ ...keyArgs }),
    handler: typed(async (c: DbCtx & { storage: unknown }, { key }: { key: string }) => {
      const bad = assertKey(key)
      if (bad) return bad
      const doc = await byKey(c.db, key)
      if (softDelete && isSoftDeleted(doc)) return null
      return addFileUrls(doc, c.storage)
    })
  })
  const list = b.q({
    args: typed({ paginationOpts: pgOpts }),
    handler: typed(async (c: DbCtx & { storage: unknown }, { paginationOpts: op }: { paginationOpts: Rec }) => {
      const page = (await c.db.query(table).paginate(op)) as unknown as { page: Rec[] }
      const filtered = softDelete ? page.page.filter(r => !isSoftDeleted(r)) : page.page
      const withUrls = await Promise.all(filtered.map(async r => addFileUrls(r, c.storage)))
      return { ...page, page: withUrls }
    })
  })
  const set = b.m({
    args: typed({ ...setArgs }),
    handler: typed(
      async (
        c: MutCtx,
        { expectedUpdatedAt, key, payload }: { expectedUpdatedAt?: number; key: string; payload: Rec }
      ) => {
        const gate = await assertWrite(c)
        if (gate) return gate
        const bad = assertKey(key)
        if (bad) return bad
        await rl(c)
        const parsed = schema.safeParse(payload)
        if (!parsed.success) return errValidation('VALIDATION_FAILED', parsed.error)
        let data = parsed.data as Rec
        const now = time()
        const existing = await byKey(c.db, key)
        if (existing) {
          if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) return err('CONFLICT')
          const prev = existing
          if (hooks?.beforeUpdate) data = await hooks.beforeUpdate(hk(c), { id: prev._id as string, patch: data, prev })
          const patch = softDelete && isSoftDeleted(prev) ? { ...data, deletedAt: undefined } : data
          await dbPatch(c.db, prev._id as string, { ...patch, ...now })
          await cleanFiles({ doc: prev, fileFields: fileFs, next: patch, storage: c.storage })
          const next = { ...prev, ...data, ...now, key }
          if (hooks?.afterUpdate) await hooks.afterUpdate(hk(c), { id: prev._id as string, patch: data, prev })
          return next
        }
        if (hooks?.beforeCreate) data = await hooks.beforeCreate(hk(c), { data })
        const id = await dbInsert(c.db, table, { ...data, ...now, key })
        if (hooks?.afterCreate) await hooks.afterCreate(hk(c), { data, id })
        const doc = await c.db.get(id)
        if (!doc) return err('NOT_FOUND')
        return doc
      }
    )
  })
  const rm = b.m({
    args: typed({ ...keyArgs }),
    handler: typed(async (c: MutCtx, { key }: { key: string }) => {
      const gate = await assertWrite(c)
      if (gate) return gate
      const bad = assertKey(key)
      if (bad) return bad
      await rl(c)
      const doc = await byKey(c.db, key)
      if (!doc) return { deleted: false }
      if (hooks?.beforeDelete) await hooks.beforeDelete(hk(c), { doc, id: doc._id as string })
      if (softDelete) await dbPatch(c.db, doc._id as string, { deletedAt: Date.now() })
      else {
        await dbDelete(c.db, doc._id as string)
        await cleanFiles({ doc, fileFields: fileFs, storage: c.storage })
      }
      if (hooks?.afterDelete) await hooks.afterDelete(hk(c), { doc, id: doc._id as string })
      return { deleted: true, soft: Boolean(softDelete) }
    })
  })
  const restore = softDelete
    ? b.m({
        args: typed({ key: string() }),
        handler: typed(async (c: MutCtx, { key }: { key: string }) => {
          const gate = await assertWrite(c)
          if (gate) return gate
          const bad = assertKey(key)
          if (bad) return bad
          const doc = await byKey(c.db, key)
          if (!(doc && isSoftDeleted(doc))) return { restored: false }
          await dbPatch(c.db, doc._id as string, { deletedAt: undefined })
          return { restored: true }
        })
      })
    : undefined
  const endpoints: Record<string, unknown> = { get, list, rm, set }
  if (restore) endpoints.restore = restore
  return typed(endpoints)
}
export { makeKv }

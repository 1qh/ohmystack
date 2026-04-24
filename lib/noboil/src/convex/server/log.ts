/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB deletes/inserts */
/** biome-ignore-all lint/suspicious/useAwait: handlers return thenable chains */
/** biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: factory with many optional features */
/* oxlint-disable eslint(no-await-in-loop), eslint(complexity) */
/* eslint-disable complexity, no-await-in-loop */
import type { ZodObject, ZodRawShape } from 'zod/v4'
import { zid } from 'convex-helpers/server/zod4'
import { array, boolean, number, string } from 'zod/v4'
import type {
  CrudHooks,
  DbLike,
  FilterLike,
  HookCtx,
  LogFactoryResult,
  Mb,
  MutCtx,
  Qb,
  QueryLike,
  RateLimitConfig,
  ReadCtx,
  Rec,
  SearchLike
} from './types'
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
  matchW,
  pgOpts
} from './helpers'
const DEFAULT_LIMIT = 500
const BULK_MAX = 100
interface LogRow {
  _id: string
  idempotencyKey?: string
  parent: string
  seq: number
}
const hk = (c: MutCtx): HookCtx => ({ db: c.db, storage: c.storage, userId: c.user._id as string })
const notDeleted = (f: FilterLike): unknown => f.eq(f.field('deletedAt'), undefined)
const makeLog = <S extends ZodRawShape>({
  auth: authOpt,
  builders: b,
  hooks,
  pub,
  rateLimit,
  schema,
  search: searchOpt,
  softDelete,
  table
}: {
  auth?: { where?: Rec }
  builders: { m: Mb; q: Qb }
  hooks?: CrudHooks
  pub?: boolean | string | { where?: Rec }
  rateLimit?: RateLimitConfig
  schema: ZodObject<S>
  search?: boolean | string | { field?: string; index?: string }
  softDelete?: boolean
  table: string
}): LogFactoryResult<S> => {
  const pubField = typeof pub === 'string' ? pub : null
  const pubWhereOpt = typeof pub === 'object' && 'where' in pub ? pub.where : undefined
  const pubEnabled = pub === true || Boolean(pubField) || Boolean(pubWhereOpt)
  const authWhereDefault = authOpt?.where
  const partial = schema.partial()
  const wgSchema = partial.extend({ own: boolean().optional() })
  const wSchema = wgSchema.extend({ or: array(wgSchema).optional() })
  const searchCfg =
    searchOpt === true
      ? { field: 'text', index: 'search_field' }
      : typeof searchOpt === 'string'
        ? { field: searchOpt, index: 'search_field' }
        : typeof searchOpt === 'object'
          ? { field: searchOpt.field ?? 'text', index: searchOpt.index ?? 'search_field' }
          : null
  const fileFs = detectFiles(schema.shape)
  const enrich = async (c: ReadCtx, docs: { userId: string }[]) => {
    const withAuthored = await c.withAuthor(docs)
    return Promise.all(withAuthored.map(async d => addUrls({ doc: d, fileFields: fileFs, storage: c.storage })))
  }
  const byParent = (db: DbLike, p: string): QueryLike => {
    const base = db.query(table).withIndex(
      'by_parent',
      idx(o => o.eq('parent', p))
    )
    return softDelete ? base.filter(notDeleted) : base
  }
  const byIdempotency = async (db: DbLike, p: string, key: string): Promise<LogRow | null> =>
    db
      .query(table)
      .withIndex(
        'by_idempotency',
        idx(o => o.eq('parent', p).eq('idempotencyKey', key))
      )
      .first() as Promise<LogRow | null>
  const byParentSeq = async (db: DbLike, p: string): Promise<LogRow | null> =>
    db
      .query(table)
      .withIndex(
        'by_parent_seq',
        idx(o => o.eq('parent', p))
      )
      .order('desc')
      .first() as Promise<LogRow | null>
  const appendArgs = {
    idempotencyKey: string().optional(),
    items: array(schema.extend({ idempotencyKey: string().optional() }))
      .max(BULK_MAX)
      .optional(),
    parent: string(),
    payload: schema.optional()
  }
  const listAfterArgs = { limit: number().optional(), parent: string(), seq: number() }
  const listArgs = { parent: string() }
  const purgeArgs = { parent: string() }
  const rl = async (c: MutCtx) => {
    if (rateLimit && !isTestMode()) await checkRateLimit(c.db, { config: rateLimit, key: c.user._id as string, table })
  }
  const appendOne = async ({
    c,
    keyArg,
    p,
    payload
  }: {
    c: MutCtx
    keyArg: string | undefined
    p: string
    payload: Rec
  }): Promise<{ created: boolean; id?: string; seq: number }> => {
    if (keyArg) {
      const existing = await byIdempotency(c.db, p, keyArg)
      if (existing) return { created: false, seq: existing.seq }
    }
    const parsed = schema.safeParse(payload)
    if (!parsed.success) return errValidation('VALIDATION_FAILED', parsed.error)
    let data = parsed.data as Rec
    if (hooks?.beforeCreate) data = await hooks.beforeCreate(hk(c), { data })
    const last = await byParentSeq(c.db, p)
    const seq = (last?.seq ?? 0) + 1
    const id = await dbInsert(c.db, table, {
      ...data,
      idempotencyKey: keyArg,
      parent: p,
      seq,
      userId: c.user._id
    })
    if (hooks?.afterCreate) await hooks.afterCreate(hk(c), { data, id })
    return { created: true, id, seq }
  }
  const append = b.m({
    args: typed({ ...appendArgs }),
    handler: typed(async (c: MutCtx, args: { idempotencyKey?: string; items?: Rec[]; parent: string; payload?: Rec }) => {
      const { idempotencyKey: key, items, parent: p, payload } = args
      await rl(c)
      if (items) {
        const results: { created: boolean; id?: string; seq: number }[] = []
        for (const item of items) {
          const { idempotencyKey: ik, ...rest } = item as Rec & { idempotencyKey?: string }
          results.push(await appendOne({ c, keyArg: ik, p, payload: rest }))
        }
        return results
      }
      if (!payload) return err('VALIDATION_FAILED')
      return appendOne({ c, keyArg: key, p, payload })
    })
  })
  const listAfter = b.q({
    args: typed({ ...listAfterArgs }),
    handler: typed(async (c: ReadCtx, { limit, parent: p, seq }: { limit?: number; parent: string; seq: number }) => {
      const base = c.db.query(table).withIndex(
        'by_parent_seq',
        idx(o => o.eq('parent', p).gt('seq', seq))
      )
      const q = softDelete ? base.filter(notDeleted) : base
      const rows = (await q.order('asc').take(limit ?? DEFAULT_LIMIT)) as { userId: string }[]
      return enrich(c, rows)
    })
  })
  const listFilter = (c: ReadCtx, q: QueryLike, mode: 'auth' | 'pub'): QueryLike => {
    if (mode === 'pub' && pubField) return q.filter((f: FilterLike) => f.eq(f.field(pubField), true))
    if (mode === 'auth' && pubField)
      return q.filter((f: FilterLike) => f.or(f.eq(f.field(pubField), true), f.eq(f.field('userId'), c.viewerId)))
    if (mode === 'auth') return q.filter((f: FilterLike) => f.eq(f.field('userId'), c.viewerId))
    return q
  }
  const wArgs = { where: wSchema.optional() }
  const makeListHandler =
    (mode: 'auth' | 'pub') =>
    async (c: ReadCtx, { paginationOpts: op, parent: p, where }: { paginationOpts: Rec; parent: string; where?: Rec }) => {
      const q = listFilter(c, byParent(c.db, p), mode)
      const page = (await q.order('desc').paginate(op)) as unknown as { page: (Rec & { userId: string })[] }
      const defaultW = mode === 'auth' ? authWhereDefault : pubWhereOpt
      const userW = where ?? defaultW
      const filtered = userW ? page.page.filter(d => matchW(d, userW, c.viewerId)) : page.page
      const enriched = await enrich(c, filtered)
      return { ...page, page: enriched }
    }
  const authList = b.q({
    args: typed({ ...listArgs, ...wArgs, paginationOpts: pgOpts }),
    handler: typed(makeListHandler('auth'))
  })
  const pubList = pubEnabled
    ? b.q({
        args: typed({ ...listArgs, ...wArgs, paginationOpts: pgOpts }),
        handler: typed(makeListHandler('pub'))
      })
    : undefined
  const list = pubEnabled ? pubList : authList
  const purgeByParent = b.m({
    args: typed({ purge: number().optional(), ...purgeArgs }),
    handler: typed(async (c: MutCtx, { parent: p, purge }: { parent: string; purge?: number }) => {
      await rl(c)
      let deleted = 0
      const docs = (await byParent(c.db, p).collect()) as { _id: string }[]
      const hard = !softDelete || purge === 1
      for (const doc of docs) {
        if (hooks?.beforeDelete) await hooks.beforeDelete(hk(c), { doc, id: doc._id })
        if (hard) {
          await dbDelete(c.db, doc._id)
          await cleanFiles({ doc, fileFields: fileFs, storage: c.storage })
        } else await dbPatch(c.db, doc._id, { deletedAt: Date.now() })
        if (hooks?.afterDelete) await hooks.afterDelete(hk(c), { doc, id: doc._id })
        deleted += 1
      }
      return { deleted, soft: !hard }
    })
  })
  const restoreByParent = softDelete
    ? b.m({
        args: typed({ parent: string() }),
        handler: typed(async (c: MutCtx, { parent: p }: { parent: string }) => {
          await rl(c)
          const rows = (await c.db
            .query(table)
            .withIndex(
              'by_parent',
              idx(o => o.eq('parent', p))
            )
            .filter((f: FilterLike) => f.neq(f.field('deletedAt'), undefined))
            .collect()) as { _id: string }[]
          for (const r of rows) await dbPatch(c.db, r._id, { deletedAt: undefined })
          return { restored: rows.length }
        })
      })
    : undefined
  const makeSearchHandler =
    (ownOnly: boolean) =>
    async (c: ReadCtx, { parent: p, query }: { parent: string; query: string }) => {
      if (!searchCfg) throw new Error('search not configured')
      let q = c.db
        .query(table)
        .withSearchIndex(searchCfg.index, (sb: SearchLike) => sb.search(searchCfg.field, query))
        .filter((f: FilterLike) => f.eq(f.field('parent'), p))
      if (ownOnly) q = q.filter((f: FilterLike) => f.eq(f.field('userId'), c.viewerId))
      const rows = (await q.collect()) as { userId: string }[]
      return enrich(c, rows)
    }
  const authSearch = searchCfg
    ? b.q({ args: typed({ parent: string(), query: string() }), handler: typed(makeSearchHandler(true)) })
    : undefined
  const pubSearch =
    searchCfg && pub
      ? b.q({ args: typed({ parent: string(), query: string() }), handler: typed(makeSearchHandler(false)) })
      : undefined
  const searchEndpoint = pub ? pubSearch : authSearch
  const rmOne = b.m({
    args: typed({ id: zid(table) }),
    handler: typed(async (c: MutCtx, { id }: { id: string }) => {
      await rl(c)
      const doc = await c.db.get(id)
      if (!doc) return { deleted: false }
      if (hooks?.beforeDelete) await hooks.beforeDelete(hk(c), { doc, id })
      if (softDelete) await dbPatch(c.db, id, { deletedAt: Date.now() })
      else {
        await dbDelete(c.db, id)
        await cleanFiles({ doc, fileFields: fileFs, storage: c.storage })
      }
      if (hooks?.afterDelete) await hooks.afterDelete(hk(c), { doc, id })
      return { deleted: true, soft: Boolean(softDelete) }
    })
  })
  const read = b.q({
    args: typed({ id: zid(table) }),
    handler: typed(async (c: ReadCtx, { id }: { id: string }) => {
      const doc = (await c.db.get(id)) as null | { userId: string }
      if (!doc) return null
      if (softDelete && (doc as unknown as Rec).deletedAt !== undefined) return null
      const [enriched] = await enrich(c, [doc])
      return enriched
    })
  })
  const authApi: Record<string, unknown> = { list: authList, read }
  if (authSearch) authApi.search = authSearch
  const pubApi: Record<string, unknown> | undefined = pubList ? { list: pubList, read } : undefined
  if (pubApi && pubSearch) pubApi.search = pubSearch
  const endpoints: Record<string, unknown> = {
    append,
    auth: authApi,
    list,
    listAfter,
    purgeByParent,
    read,
    rm: rmOne
  }
  if (pubApi) endpoints.pub = pubApi
  if (searchEndpoint) endpoints.search = searchEndpoint
  if (restoreByParent) endpoints.restoreByParent = restoreByParent
  return typed(endpoints)
}
export { makeLog }

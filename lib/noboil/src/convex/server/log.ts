/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB deletes/inserts */
/** biome-ignore-all lint/suspicious/useAwait: handlers return thenable chains */
/* oxlint-disable eslint(no-await-in-loop) */
/* eslint-disable no-await-in-loop */
import type { ZodObject, ZodRawShape } from 'zod/v4'
import { array, number, string } from 'zod/v4'
import type {
  CrudHooks,
  DbLike,
  HookCtx,
  LogFactoryResult,
  Mb,
  MutCtx,
  Qb,
  QueryLike,
  RateLimitConfig,
  ReadCtx,
  Rec
} from './types'
import { idx, typed } from './bridge'
import { isTestMode } from './env'
import { checkRateLimit, dbDelete, dbInsert, err, errValidation, pgOpts } from './helpers'
const DEFAULT_LIMIT = 500
const BULK_MAX = 100
interface LogRow {
  _id: string
  idempotencyKey?: string
  parent: string
  seq: number
}
const hk = (c: MutCtx): HookCtx => ({ db: c.db, storage: c.storage, userId: c.user._id as string })
const makeLog = <S extends ZodRawShape>({
  builders: b,
  hooks,
  rateLimit,
  schema,
  table
}: {
  builders: { m: Mb; q: Qb }
  hooks?: CrudHooks
  rateLimit?: RateLimitConfig
  schema: ZodObject<S>
  table: string
}): LogFactoryResult<S> => {
  const byParent = (db: DbLike, p: string): QueryLike =>
    db.query(table).withIndex(
      'by_parent',
      idx(o => o.eq('parent', p))
    )
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
      const rows = (await c.db
        .query(table)
        .withIndex(
          'by_parent_seq',
          idx(o => o.eq('parent', p).gt('seq', seq))
        )
        .order('asc')
        .take(limit ?? DEFAULT_LIMIT)) as { userId: string }[]
      return c.withAuthor(rows)
    })
  })
  const list = b.q({
    args: typed({ ...listArgs, paginationOpts: pgOpts }),
    handler: typed(async (c: ReadCtx, { paginationOpts: op, parent: p }: { paginationOpts: Rec; parent: string }) => {
      const page = (await byParent(c.db, p).order('desc').paginate(op)) as unknown as {
        page: { userId: string }[]
      }
      const enriched = await c.withAuthor(page.page)
      return { ...page, page: enriched }
    })
  })
  const purgeByParent = b.m({
    args: typed({ ...purgeArgs }),
    handler: typed(async (c: MutCtx, { parent: p }: { parent: string }) => {
      await rl(c)
      let deleted = 0
      const docs = (await byParent(c.db, p).collect()) as { _id: string }[]
      for (const doc of docs) {
        if (hooks?.beforeDelete) await hooks.beforeDelete(hk(c), { doc, id: doc._id })
        await dbDelete(c.db, doc._id)
        if (hooks?.afterDelete) await hooks.afterDelete(hk(c), { doc, id: doc._id })
        deleted += 1
      }
      return { deleted }
    })
  })
  return typed({ append, list, listAfter, purgeByParent })
}
export { makeLog }

/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB deletes */
/** biome-ignore-all lint/suspicious/useAwait: handlers return thenable chains */
/* oxlint-disable eslint(no-await-in-loop) */
/* eslint-disable no-await-in-loop */
import type { ZodObject, ZodRawShape } from 'zod/v4'
import { number, string } from 'zod/v4'
import type { DbCtx, DbLike, LogFactoryResult, Mb, Qb, QueryLike, Rec } from './types'
import { idx, typed } from './bridge'
import { dbDelete, dbInsert, errValidation, pgOpts } from './helpers'
const DEFAULT_LIMIT = 500
interface LogRow {
  _id: string
  idempotencyKey?: string
  parent: string
  seq: number
}
const makeLog = <S extends ZodRawShape>({
  builders: b,
  schema,
  table
}: {
  builders: { m: Mb; q: Qb }
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
  const appendArgs = { idempotencyKey: string().optional(), parent: string(), payload: schema }
  const listAfterArgs = { limit: number().optional(), parent: string(), seq: number() }
  const listArgs = { parent: string() }
  const purgeArgs = { parent: string() }
  const append = b.m({
    args: typed({ ...appendArgs }),
    handler: typed(async (c: DbCtx, args: { idempotencyKey?: string; parent: string; payload: Rec }) => {
      const { idempotencyKey: key, parent: p, payload } = args
      if (key) {
        const existing = await byIdempotency(c.db, p, key)
        if (existing) return { created: false, seq: existing.seq }
      }
      const parsed = schema.safeParse(payload)
      if (!parsed.success) return errValidation('VALIDATION_FAILED', parsed.error)
      const last = await byParentSeq(c.db, p)
      const seq = (last?.seq ?? 0) + 1
      await dbInsert(c.db, table, { ...parsed.data, idempotencyKey: key, parent: p, seq })
      return { created: true, seq }
    })
  })
  const listAfter = b.q({
    args: typed({ ...listAfterArgs }),
    handler: typed(async (c: DbCtx, { limit, parent: p, seq }: { limit?: number; parent: string; seq: number }) =>
      c.db
        .query(table)
        .withIndex(
          'by_parent_seq',
          idx(o => o.eq('parent', p).gt('seq', seq))
        )
        .order('asc')
        .take(limit ?? DEFAULT_LIMIT)
    )
  })
  const list = b.q({
    args: typed({ ...listArgs, paginationOpts: pgOpts }),
    handler: typed(async (c: DbCtx, { paginationOpts: op, parent: p }: { paginationOpts: Rec; parent: string }) =>
      byParent(c.db, p).order('desc').paginate(op)
    )
  })
  const purgeByParent = b.m({
    args: typed({ ...purgeArgs }),
    handler: typed(async (c: DbCtx, { parent: p }: { parent: string }) => {
      let deleted = 0
      const docs = (await byParent(c.db, p).collect()) as { _id: string }[]
      for (const doc of docs) {
        await dbDelete(c.db, doc._id)
        deleted += 1
      }
      return { deleted }
    })
  })
  return typed({ append, list, listAfter, purgeByParent })
}
export { makeLog }

/** biome-ignore-all lint/performance/noAwaitInLoops: sequential deletes in purgeByParent */
/** biome-ignore-all lint/suspicious/useAwait: handlers return thenable chains */
/* oxlint-disable eslint(no-await-in-loop) */
/* eslint-disable no-await-in-loop */
import type { PaginationOptions } from 'convex/server'
import type { ZodObject, ZodRawShape } from 'zod/v4'
import type { DbLike, LogFactoryResult, Mb, MutCtx, Qb, QueryLike, Rec } from './types'
import { idx, typed } from './bridge'
import { dbDelete, dbInsert, errValidation } from './helpers'
const DEFAULT_LIMIT = 500
interface LogRow {
  _id: string
  idempotencyKey?: string
  parent: string
  seq: number
}
const makeLog = <S extends ZodRawShape>({
  builders,
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
  const maxSeq = async (db: DbLike, p: string): Promise<LogRow | null> =>
    db
      .query(table)
      .withIndex(
        'by_parent_seq',
        idx(o => o.eq('parent', p))
      )
      .order('desc')
      .first() as Promise<LogRow | null>
  const append = builders.m({
    handler: typed(async (c: MutCtx, args: { idempotencyKey?: string; parent: string; payload: Rec }) => {
      const { idempotencyKey: key, parent: p, payload } = args
      if (key) {
        const existing = await byIdempotency(c.db, p, key)
        if (existing) return { created: false, seq: existing.seq }
      }
      const parsed = schema.safeParse(payload)
      if (!parsed.success) return errValidation('VALIDATION_FAILED', parsed.error)
      const last = await maxSeq(c.db, p)
      const seq = (last?.seq ?? 0) + 1
      await dbInsert(c.db, table, { ...parsed.data, idempotencyKey: key, parent: p, seq })
      return { created: true, seq }
    })
  })
  const listAfter = builders.q({
    handler: typed(async (c: MutCtx, { limit, parent: p, seq }: { limit?: number; parent: string; seq: number }) =>
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
  const list = builders.q({
    handler: typed(
      async (c: MutCtx, { paginationOpts, parent: p }: { paginationOpts: PaginationOptions; parent: string }) => {
        const optsAsRec = paginationOpts as unknown as Rec
        return byParent(c.db, p).order('desc').paginate(optsAsRec)
      }
    )
  })
  const purgeByParent = builders.m({
    handler: typed(async (c: MutCtx, { parent: p }: { parent: string }) => {
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

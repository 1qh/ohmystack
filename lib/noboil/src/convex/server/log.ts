import type { PaginationOptions } from 'convex/server'
import type { ZodObject, ZodRawShape } from 'zod/v4'
import type { DbLike, LogFactoryResult, Mb, MutCtx, Qb, Rec } from './types'
import { idx, typed } from './bridge'
import { dbDelete, dbInsert, errValidation } from './helpers'
const DEFAULT_LIMIT = 500
const makeLog = <S extends ZodRawShape>({
  builders,
  parent,
  schema,
  table
}: {
  builders: { m: Mb; q: Qb }
  parent: string
  schema: ZodObject<S>
  table: string
}): LogFactoryResult<S> => {
  const byParent = (db: DbLike, p: string) =>
    db.query(table).withIndex(
      'by_parent',
      idx(o => o.eq('parent', p))
    )
  const byIdempotency = async (db: DbLike, p: string, key: string) =>
    db
      .query(table)
      .withIndex(
        'by_idempotency',
        idx(o => o.eq('parent', p).eq('idempotencyKey', key))
      )
      .first()
  const maxSeq = async (db: DbLike, p: string): Promise<number> => {
    const last = db
      .query(table)
      .withIndex(
        'by_parent_seq',
        idx(o => o.eq('parent', p))
      )
      .order('desc')
      .first() as null | { seq?: number }
    return last?.seq ?? 0
  }
  const append = builders.m({
    args: schema.extend({ idempotencyKey: schema.shape.idempotencyKey ?? schema.shape.idempotencyKey }).partial(),
    handler: typed(async (c: MutCtx, args: Rec & { idempotencyKey?: string; parent: string; payload: Rec }) => {
      const p = args.parent
      const key = args.idempotencyKey
      if (key) {
        const existing = await byIdempotency(c.db, p, key)
        if (existing) return { created: false, seq: existing.seq ?? 0 }
      }
      const parsed = schema.safeParse(args.payload)
      if (!parsed.success) return errValidation('VALIDATION_FAILED', parsed.error)
      const seq = (await maxSeq(c.db, p)) + 1
      await dbInsert(c.db, table, { ...parsed.data, idempotencyKey: key, parent: p, seq })
      return { created: true, seq }
    })
  })
  const listAfter = builders.q({
    handler: typed(async (c: MutCtx, { limit, parent: p, seq }: { limit?: number; parent: string; seq: number }) => {
      const docs = await c.db
        .query(table)
        .withIndex(
          'by_parent_seq',
          idx(o => o.eq('parent', p).gt('seq', seq))
        )
        .order('asc')
        .take(limit ?? DEFAULT_LIMIT)
      return docs
    })
  })
  const list = builders.q({
    handler: typed(
      async (c: MutCtx, { paginationOpts, parent: p }: { paginationOpts: PaginationOptions; parent: string }) =>
        byParent(c.db, p).order('desc').paginate(paginationOpts)
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
  undefined
  return typed({ append, list, listAfter, purgeByParent })
}
export { makeLog }

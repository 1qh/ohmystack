import type { ZodObject, ZodRawShape } from 'zod/v4'
import type { DbLike, KvFactoryResult, Mb, MutCtx, Qb, Rec } from './types'
import { idx, typed } from './bridge'
import { dbDelete, dbInsert, dbPatch, err, errValidation, time } from './helpers'
const makeKv = <S extends ZodRawShape>({
  builders,
  keys,
  schema,
  table,
  writeRole
}: {
  builders: { m: Mb; q: Qb }
  keys?: readonly string[]
  schema: ZodObject<S>
  table: string
  writeRole?: ((ctx: MutCtx) => boolean | Promise<boolean>) | boolean
}): KvFactoryResult<S> => {
  const byKey = async (db: DbLike, key: string) =>
    db
      .query(table)
      .withIndex(
        'by_key',
        idx(o => o.eq('key', key))
      )
      .unique()
  const assertKey = (key: string) => {
    if (keys && !keys.includes(key)) return err('INVALID_KEY')
    return null
  }
  const assertWrite = async (c: MutCtx) => {
    if (writeRole === true) return null
    if (typeof writeRole === 'function') {
      const ok = await writeRole(c)
      if (ok) return null
    }
    return err('FORBIDDEN')
  }
  const get = builders.q({
    handler: typed(async (c: MutCtx, { key }: { key: string }) => {
      const bad = assertKey(key)
      if (bad) return bad
      return byKey(c.db, key)
    })
  })
  const list = builders.q({
    handler: typed(async (c: MutCtx) => c.db.query(table).collect())
  })
  const set = builders.m({
    handler: typed(async (c: MutCtx, { key, payload }: { key: string; payload: Rec }) => {
      const gate = await assertWrite(c)
      if (gate) return gate
      const bad = assertKey(key)
      if (bad) return bad
      const parsed = schema.safeParse(payload)
      if (!parsed.success) return errValidation('VALIDATION_FAILED', parsed.error)
      const now = time()
      const existing = (await byKey(c.db, key)) as null | { _id: string }
      if (existing) {
        await dbPatch(c.db, existing._id, { ...parsed.data, ...now })
        return { ...existing, ...parsed.data, ...now, key }
      }
      const id = await dbInsert(c.db, table, { ...parsed.data, ...now, key })
      const doc = await c.db.get(id)
      if (!doc) return err('NOT_FOUND')
      return doc
    })
  })
  const rm = builders.m({
    handler: typed(async (c: MutCtx, { key }: { key: string }) => {
      const gate = await assertWrite(c)
      if (gate) return gate
      const bad = assertKey(key)
      if (bad) return bad
      const doc = (await byKey(c.db, key)) as null | { _id: string }
      if (!doc) return { deleted: false }
      await dbDelete(c.db, doc._id)
      return { deleted: true }
    })
  })
  return typed({ get, list, rm, set })
}
export { makeKv }

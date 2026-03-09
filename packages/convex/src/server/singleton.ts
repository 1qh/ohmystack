/* eslint-disable @typescript-eslint/non-nullable-type-assertion-style */
import type { ZodObject, ZodRawShape } from 'zod/v4'

import { number } from 'zod/v4'

import type { DbLike, Mb, MutCtx, Qb, Rec, SingletonCrudResult, SingletonOptions } from './types'

import { idx, typed } from './bridge'
import { addUrls, checkRateLimit, cleanFiles, dbInsert, dbPatch, detectFiles, err, errValidation, time } from './helpers'

const makeSingletonCrud = <S extends ZodRawShape>({
  builders,
  options,
  schema,
  table
}: {
  builders: { m: Mb; q: Qb }
  options?: SingletonOptions
  schema: ZodObject<S>
  table: string
}): SingletonCrudResult<S> => {
  const fileFs = detectFiles(schema.shape),
    byUser = async (db: DbLike, userId: string) =>
      db
        .query(table)
        .withIndex(
          'by_user',
          idx(o => o.eq('userId', userId))
        )
        .unique(),
    get = builders.q({
      handler: typed(async (c: MutCtx) => {
        const doc = await byUser(c.db, c.user._id as string)
        if (!doc) return null
        return addUrls({ doc, fileFields: fileFs, storage: c.storage })
      })
    }),
    upsert = builders.m({
      args: schema.partial().extend({ expectedUpdatedAt: number().optional() }),
      handler: typed(async (c: MutCtx, { expectedUpdatedAt, ...data }: Rec & { expectedUpdatedAt?: number }) => {
        if (options?.rateLimit) await checkRateLimit(c.db, { config: options.rateLimit, key: c.user._id as string, table })

        const existing = await byUser(c.db, c.user._id as string)

        if (existing) {
          if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) return err('CONFLICT')
          await cleanFiles({ doc: existing, fileFields: fileFs, next: data, storage: c.storage })
          const now = time()
          await dbPatch(c.db, existing._id as string, { ...data, ...now })
          const updated = { ...existing, ...data, ...now }
          return addUrls({ doc: updated, fileFields: fileFs, storage: c.storage })
        }

        const parsed = schema.safeParse(data)
        if (!parsed.success) return errValidation('VALIDATION_FAILED', parsed.error)
        const now = time(),
          id = await dbInsert(c.db, table, { ...parsed.data, userId: c.user._id, ...now }),
          doc = await c.db.get(id)
        return addUrls({ doc: doc as Rec, fileFields: fileFs, storage: c.storage })
      })
    })

  return typed({ get, upsert })
}

export { makeSingletonCrud }

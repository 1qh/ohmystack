// oxlint-disable promise/prefer-await-to-then
/* eslint-disable complexity */
/* eslint-disable @eslint-react/no-unused-props, max-depth */
// biome-ignore-all lint/suspicious/useAwait: x
// biome-ignore-all lint/performance/noAwaitInLoops: x
import type { ZodObject, ZodRawShape } from 'zod/v4'

import { zid } from 'convex-helpers/server/zod4'
import { array, boolean, number, string } from 'zod/v4'

import type {
  CrudBuilders,
  CrudOptions,
  CrudResult,
  DbLike,
  EnrichedDoc,
  FilterLike,
  HookCtx,
  MutCtx,
  Qb,
  ReadCtx,
  Rec,
  StorageLike
} from './types'

import { BULK_MAX } from '../constants'
import { idx, sch, typed } from './bridge'
import { isTestMode } from './env'
import {
  addUrls,
  checkRateLimit,
  cleanFiles,
  dbDelete,
  dbPatch,
  detectFiles,
  err,
  errValidation,
  groupList,
  isComparisonOp,
  log,
  matchW,
  pgOpts,
  warnLargeFilterSet
} from './helpers'

interface CrudMCtx extends MutCtx {
  create: (t: string, d: Rec) => Promise<string>
  delete: (id: string) => Promise<unknown>
  get: (id: string) => Promise<Rec>
  patch: (id: string, data: Rec, expectedUpdatedAt?: number) => Promise<Rec>
}

const hk = (c: CrudMCtx): HookCtx => ({ db: c.db, storage: c.storage, userId: c.user._id as string }),
  makeCrud = <S extends ZodRawShape>({
    builders,
    options: opt,
    schema,
    strictFilter,
    table
  }: {
    builders: CrudBuilders
    options?: CrudOptions<S>
    schema: ZodObject<S>
    strictFilter?: boolean
    table: string
  }) => {
    type WG = Rec & { own?: boolean }
    type W = WG & { or?: WG[] }
    const { m, pq, q } = builders,
      hooks = opt?.hooks,
      searchCfg =
        opt?.search === true
          ? { field: 'text', index: 'search_field' }
          : typeof opt?.search === 'string'
            ? { field: opt.search, index: 'search_field' }
            : typeof opt?.search === 'object'
              ? { field: opt.search.field ?? 'text', index: opt.search.index ?? 'search_field' }
              : null,
      partial = schema.partial(),
      bulkIdsSchema = array(zid(table)).max(BULK_MAX),
      fileFs = detectFiles(schema.shape),
      wgSchema = partial.extend({ own: boolean().optional() }),
      wSchema = wgSchema.extend({ or: array(wgSchema).optional() }),
      wArgs = { where: wSchema.optional() },
      ownArg = { own: boolean().optional() },
      idArgs = { id: zid(table) },
      parseW = (i: unknown, fb?: W): undefined | W => {
        if (i === undefined) return fb
        const r = wSchema.safeParse(i)
        return r.success ? (r.data as W) : errValidation('INVALID_WHERE', r.error)
      },
      defaults = { auth: parseW(opt?.auth?.where), pub: parseW(opt?.pub?.where) },
      enrich = async (c: ReadCtx, docs: Rec[]) =>
        Promise.all(
          (await c.withAuthor(docs as { userId: string }[])).map(async d =>
            addUrls({ doc: d, fileFields: fileFs, storage: c.storage })
          )
        ) as Promise<EnrichedDoc<S>[]>,
      buildExpr = (fb: FilterLike, w: WG, vid: null | string) => {
        let e: unknown = null
        const and = (x: unknown) => {
          e = e ? fb.and(e, x) : x
        }
        // biome-ignore lint/nursery/noForIn: x
        for (const k in w)
          if (k !== 'own') {
            const fv = w[k]
            if (fv !== undefined) {
              const field = fb.field(k)
              if (isComparisonOp(fv)) {
                if (fv.$gt !== undefined) and(fb.gt(field, fv.$gt))
                if (fv.$gte !== undefined) and(fb.gte(field, fv.$gte))
                if (fv.$lt !== undefined) and(fb.lt(field, fv.$lt))
                if (fv.$lte !== undefined) and(fb.lte(field, fv.$lte))
                if (fv.$between !== undefined) {
                  and(fb.gte(field, fv.$between[0]))
                  and(fb.lte(field, fv.$between[1]))
                }
              } else and(fb.eq(field, fv))
            }
          }

        if (w.own) and(vid ? fb.eq(fb.field('userId'), vid) : fb.eq(true, false))
        return e
      },
      canUseOwnIndex = (w: undefined | W): boolean => {
        if (!w || (w.or?.length ?? 0) > 0) return false
        const gs = groupList(w)
        return gs.length === 1 && gs[0]?.own === true
      },
      startQ = (c: ReadCtx, w: undefined | W) =>
        canUseOwnIndex(w) && c.viewerId
          ? c.db.query(table).withIndex(
              'by_user',
              idx(o => o.eq('userId', c.viewerId))
            )
          : c.db.query(table),
      applyW = (qr: ReturnType<ReadCtx['db']['query']>, w: undefined | W, vid: null | string) => {
        let qry = qr
        // oxlint-disable-next-line unicorn/no-useless-undefined
        if (opt?.softDelete) qry = qry.filter((fb: FilterLike) => fb.eq(fb.field('deletedAt'), undefined))
        const gs = groupList(w)
        if (gs.length === 0) return qry
        return qry.filter((f: FilterLike) => {
          let e: unknown = null
          for (const g of gs) {
            const ge = buildExpr(f, g, vid)
            if (ge) e = e ? f.or(e, ge) : ge
          }
          return e ?? true
        })
      },
      listH =
        (fb?: W) =>
        async (
          c: ReadCtx,
          {
            paginationOpts: op,
            where
          }: {
            paginationOpts: unknown
            where?: unknown
          }
        ) => {
          const w = parseW(where, fb),
            { page, ...rest } = await applyW(startQ(c, w), w, c.viewerId)
              .order('desc')
              .paginate(op as Rec)
          return { ...rest, page: await enrich(c, page) }
        },
      readH =
        (fb?: W) =>
        async (
          c: ReadCtx,
          {
            id,
            own,
            where
          }: {
            id: string
            own?: boolean
            where?: unknown
          }
        ) => {
          const doc = await c.db.get(id),
            w = parseW(where, fb)
          if (!doc) return null
          if (!matchW(doc, w, c.viewerId)) return null
          if (own) {
            if (!c.viewerId) return null
            if ((doc as { userId?: string }).userId !== c.viewerId) return null
          }
          return (await enrich(c, [doc]))[0] ?? null
        },
      searchIndexed = async (c: ReadCtx, qry: string, w: undefined | W) => {
        const sIdx = searchCfg?.index ?? 'search_field',
          sField = searchCfg?.field ?? 'text',
          results = await c.db
            .query(table)
            .withSearchIndex(
              sIdx,
              sch(sb => sb.search(sField, qry))
            )
            .collect()
        warnLargeFilterSet(results.length, table, 'search', strictFilter)
        const filtered = results.filter(d => matchW(d, w, c.viewerId))
        if (opt?.softDelete)
          return enrich(
            c,
            filtered.filter((d: Rec) => !d.deletedAt)
          )
        return enrich(c, filtered)
      },
      searchH =
        (fb?: W) =>
        async (
          c: ReadCtx,
          {
            query: qry,
            where
          }: {
            query: string
            where?: unknown
          }
        ) => {
          const w = parseW(where, fb)
          return searchIndexed(c, qry, w)
        },
      readApi = (wrap: Qb, fb?: W) => ({
        list: wrap({ args: { paginationOpts: pgOpts, ...wArgs }, handler: typed(listH(fb)) }),
        read: wrap({ args: { ...idArgs, ...ownArg, ...wArgs }, handler: typed(readH(fb)) }),
        ...(searchCfg
          ? {
              search: wrap({
                args: { query: string(), ...wArgs },
                handler: typed(searchH(fb))
              })
            }
          : {})
      }),
      indexedH =
        (fb?: W) =>
        async (
          c: ReadCtx,
          {
            index,
            key,
            value,
            where
          }: {
            index: string
            key: string
            value: string
            where?: unknown
          }
        ) => {
          const w = parseW(where, fb),
            docs = await applyW(
              c.db.query(table).withIndex(
                index,
                idx(i => i.eq(key, value))
              ),
              w,
              c.viewerId
            )
              .order('desc')
              .collect()
          warnLargeFilterSet(docs.length, table, 'indexed', strictFilter)
          return enrich(c, docs)
        },
      rmHandler = async (
        c: {
          db: DbLike
          delete: (id: string) => Promise<unknown>
          storage: StorageLike
          user?: Rec
        },
        { id }: { id: string }
      ) => {
        if (opt?.softDelete) {
          const doc = await c.db.get(id)
          if (!doc) {
            log('warn', 'crud:not_found', { id, table })
            return err('NOT_FOUND', `${table}:rm`)
          }
          if (hooks?.beforeDelete)
            await hooks.beforeDelete({ db: c.db, storage: c.storage, userId: (c.user?._id ?? '') as string }, { doc, id })
          await dbPatch(c.db, id, { deletedAt: Date.now() })
          if (hooks?.afterDelete)
            await hooks.afterDelete({ db: c.db, storage: c.storage, userId: (c.user?._id ?? '') as string }, { doc, id })
          log('info', 'crud:delete', { id, soft: true, table })
          return doc
        }
        const doc = await c.db.get(id)
        if (hooks?.beforeDelete && doc)
          await hooks.beforeDelete({ db: c.db, storage: c.storage, userId: (c.user?._id ?? '') as string }, { doc, id })
        if (opt?.cascade)
          for (const { foreignKey: fk, table: tbl } of opt.cascade)
            for (const r of await c.db
              .query(tbl)
              .filter((f: FilterLike) => f.eq(f.field(fk), id))
              .collect())
              await dbDelete(c.db, r._id as string)
        const d = await c.delete(id)
        await cleanFiles({ doc: d as Rec, fileFields: fileFs, storage: c.storage })
        if (hooks?.afterDelete)
          await hooks.afterDelete(
            { db: c.db, storage: c.storage, userId: (c.user?._id ?? '') as string },
            { doc: d as Rec, id }
          )
        log('info', 'crud:delete', { id, table })
        return d
      }
    return {
      auth: readApi(q, defaults.auth),
      authIndexed: q({
        args: { index: string(), key: string(), value: string(), ...wArgs },
        handler: typed(indexedH(defaults.auth))
      }),
      bulkCreate: m({
        args: { items: array(schema).max(BULK_MAX) },
        handler: typed(async (c: CrudMCtx, a: Rec) => {
          const items = a.items as Rec[]
          if (items.length > 100) return err('LIMIT_EXCEEDED', `${table}:bulkCreate`)
          const ids: string[] = []
          for (const item of items) {
            let data = item
            if (hooks?.beforeCreate) data = await hooks.beforeCreate(hk(c), { data })
            const id = await c.create(table, data)
            if (hooks?.afterCreate) await hooks.afterCreate(hk(c), { data, id })
            ids.push(id)
          }
          return ids
        })
      }),
      bulkRm: m({
        args: { ids: bulkIdsSchema },
        handler: typed(async (c: CrudMCtx, { ids }: { ids: string[] }) => {
          if (ids.length > 100) return err('LIMIT_EXCEEDED', `${table}:bulkRm`)
          let deleted = 0
          for (const id of ids) {
            await rmHandler(typed(c), { id })
            deleted += 1
          }
          return deleted
        })
      }),
      bulkUpdate: m({
        args: { data: partial, ids: bulkIdsSchema },
        handler: typed(async (c: CrudMCtx, args: Rec) => {
          const { data, ids } = args as { data: Rec; ids: string[] }
          if (ids.length > 100) return err('LIMIT_EXCEEDED', `${table}:bulkUpdate`)
          const results: unknown[] = []
          for (const id of ids) {
            const prev = await c.get(id),
              ret = await c.patch(id, data)
            await cleanFiles({ doc: prev, fileFields: fileFs, next: data, storage: c.storage })
            results.push(ret)
          }
          return results
        })
      }),
      create: m({
        args: schema.shape,
        handler: typed(async (c: CrudMCtx, a: Rec) => {
          if (opt?.rateLimit && !isTestMode())
            await checkRateLimit(c.db, { config: opt.rateLimit, key: c.user._id as string, table })
          let data = a
          if (hooks?.beforeCreate) data = await hooks.beforeCreate(hk(c), { data })
          const id = await c.create(table, data)
          if (hooks?.afterCreate) await hooks.afterCreate(hk(c), { data, id })
          log('info', 'crud:create', { table, userId: c.user._id })
          return id
        })
      }),
      pub: readApi(pq, defaults.pub),
      pubIndexed: pq({
        args: { index: string(), key: string(), value: string(), ...wArgs },
        handler: typed(indexedH(defaults.pub))
      }),
      restore: opt?.softDelete
        ? m({
            args: idArgs,
            handler: typed(async (c: CrudMCtx, { id }: { id: string }) => {
              const doc = await c.get(id)
              await dbPatch(c.db, id, { deletedAt: undefined })
              return { ...doc, deletedAt: undefined }
            })
          })
        : undefined,
      rm: m({
        args: idArgs,
        handler: typed(async (c: CrudMCtx, { id }: { id: string }) => rmHandler(typed(c), { id }))
      }),
      update: m({
        args: { ...idArgs, ...partial.shape, expectedUpdatedAt: number().optional() },
        handler: typed(async (c: CrudMCtx, a: Rec) => {
          const { expectedUpdatedAt, id, ...rest } = a as Rec & {
              expectedUpdatedAt?: number
              id: string
            },
            prev = await c.get(id)
          let patch = rest as Rec
          if (hooks?.beforeUpdate) patch = await hooks.beforeUpdate(hk(c), { id, patch, prev })
          const ret = await c.patch(id, patch, expectedUpdatedAt)
          await cleanFiles({ doc: prev, fileFields: fileFs, next: patch, storage: c.storage })
          if (hooks?.afterUpdate) await hooks.afterUpdate(hk(c), { id, patch, prev })
          log('info', 'crud:update', { id, table })
          return ret
        })
      })
    } as unknown as CrudResult<S>
  },
  /**
   * Creates a cascade configuration for owned child tables, used with crud's cascade option.
   * @param _schema - The child table's Zod schema (used for type inference only)
   * @param config - Object with foreignKey and table name
   * @returns Cascade config object with foreignKey and table
   */
  ownedCascade = <S extends ZodRawShape>(
    _schema: ZodObject<S>,
    config: { foreignKey: keyof S & string; table: string }
  ): { foreignKey: string; table: string } => config

export { makeCrud, ownedCascade }

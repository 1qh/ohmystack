/* eslint-disable complexity */
// biome-ignore-all lint/performance/noAwaitInLoops: x
import type { ZodObject, ZodRawShape } from 'zod/v4'

import { zid } from 'convex-helpers/server/zod4'
import { array, number } from 'zod/v4'

import type {
  BaseBuilders,
  ChildCrudResult,
  CrudHooks,
  DbReadLike,
  GlobalHooks,
  HookCtx,
  MutCtx,
  Rec,
  UserCtx
} from './types'

import { BULK_MAX } from '../constants'
import { idx, typed } from './bridge'
import { cleanFiles, dbDelete, dbInsert, dbPatch, detectFiles, err, pickFields, time } from './helpers'

interface ChildCrudOptions<PS extends ZodRawShape = ZodRawShape> {
  hooks?: CrudHooks
  pub?: { parentField: keyof PS & string }
}

interface ChildMeta<S extends ZodRawShape = ZodRawShape, PS extends ZodRawShape = ZodRawShape> {
  foreignKey: string
  index: string
  parent: string
  parentSchema?: ZodObject<PS>
  schema: ZodObject<S>
}

const chk = (ctx: UserCtx): HookCtx => ({
    db: ctx.db,
    storage: (ctx as unknown as { storage: unknown }).storage as HookCtx['storage'],
    userId: ctx.user._id as string
  }),
  checkParentField = async (db: DbReadLike, parentId: string, field: string) => {
    const p = await db.get(parentId)
    return p?.[field] ? p : null
  },
  mergeChildHooks = (gh: GlobalHooks | undefined, fh: CrudHooks | undefined, table: string): CrudHooks | undefined => {
    if (!(gh || fh)) return
    const merged: CrudHooks = {}
    if (gh?.beforeCreate ?? fh?.beforeCreate)
      merged.beforeCreate = async (ctx: HookCtx, args: { data: Rec }) => {
        let { data } = args
        if (gh?.beforeCreate) data = await gh.beforeCreate({ ...ctx, table }, { data })
        if (fh?.beforeCreate) data = await fh.beforeCreate(ctx, { data })
        return data
      }
    if (gh?.afterCreate ?? fh?.afterCreate)
      merged.afterCreate = async (ctx: HookCtx, args: { data: Rec; id: string }) => {
        if (gh?.afterCreate) await gh.afterCreate({ ...ctx, table }, args)
        if (fh?.afterCreate) await fh.afterCreate(ctx, args)
      }
    if (gh?.beforeUpdate ?? fh?.beforeUpdate)
      merged.beforeUpdate = async (ctx: HookCtx, args: { id: string; patch: Rec; prev: Rec }) => {
        let { patch } = args
        if (gh?.beforeUpdate) patch = await gh.beforeUpdate({ ...ctx, table }, { ...args, patch })
        if (fh?.beforeUpdate) patch = await fh.beforeUpdate(ctx, { ...args, patch })
        return patch
      }
    if (gh?.afterUpdate ?? fh?.afterUpdate)
      merged.afterUpdate = async (ctx: HookCtx, args: { id: string; patch: Rec; prev: Rec }) => {
        if (gh?.afterUpdate) await gh.afterUpdate({ ...ctx, table }, args)
        if (fh?.afterUpdate) await fh.afterUpdate(ctx, args)
      }
    if (gh?.beforeDelete ?? fh?.beforeDelete)
      merged.beforeDelete = async (ctx: HookCtx, args: { doc: Rec; id: string }) => {
        if (gh?.beforeDelete) await gh.beforeDelete({ ...ctx, table }, args)
        if (fh?.beforeDelete) await fh.beforeDelete(ctx, args)
      }
    if (gh?.afterDelete ?? fh?.afterDelete)
      merged.afterDelete = async (ctx: HookCtx, args: { doc: Rec; id: string }) => {
        if (gh?.afterDelete) await gh.afterDelete({ ...ctx, table }, args)
        if (fh?.afterDelete) await fh.afterDelete(ctx, args)
      }
    return merged
  },
  makeChildCrud = <S extends ZodRawShape, PS extends ZodRawShape = ZodRawShape>({
    builders,
    globalHooks: gh,
    meta,
    options,
    table
  }: {
    builders: BaseBuilders
    globalHooks?: GlobalHooks
    meta: ChildMeta<S, PS>
    options?: ChildCrudOptions<PS>
    table: string
  }): ChildCrudResult<S> => {
    const { m, pq, q } = builders,
      hooks = mergeChildHooks(gh, options?.hooks, table),
      { foreignKey, index, parent, schema } = meta,
      getFK = (doc: Rec): string => doc[foreignKey] as string,
      schemaKeys = Object.keys(schema.shape),
      partial = schema.partial(),
      fileFs = detectFiles(schema.shape),
      idArgs = { id: zid(table) },
      bulkIdsSchema = array(zid(table)).max(BULK_MAX),
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      verifyParentOwnership = async (ctx: UserCtx, parentId: string) => {
        const p = await ctx.db.get(parentId)
        return p && p.userId === ctx.user._id ? p : null
      },
      create = m({
        args: { ...schema.shape, [foreignKey]: zid(parent) },
        handler: typed(async (ctx: UserCtx, a: Rec) => {
          const args = a,
            parentId = args[foreignKey] as string
          let data = schema.parse(pickFields(args, schemaKeys)) as Rec
          if (!(await verifyParentOwnership(ctx, parentId))) return err('NOT_FOUND', `${table}:create`)
          if (hooks?.beforeCreate) data = await hooks.beforeCreate(chk(ctx), { data })
          const id = await dbInsert(ctx.db, table, { ...data, [foreignKey]: parentId, ...time() })
          if (hooks?.afterCreate) await hooks.afterCreate(chk(ctx), { data, id })
          return id
        })
      }),
      update = m({
        args: { ...idArgs, ...partial.shape },
        handler: typed(async (ctx: MutCtx, a: Rec) => {
          const { id, ...rest } = a as Rec & { id: string },
            doc = await ctx.db.get(id)
          if (!doc) return err('NOT_FOUND', `${table}:update`)
          if (!(await verifyParentOwnership(ctx, getFK(doc)))) return err('NOT_FOUND', `${table}:update`)
          let patch = partial.parse(pickFields(rest, schemaKeys)) as Rec
          if (hooks?.beforeUpdate) patch = await hooks.beforeUpdate(chk(ctx), { id, patch, prev: doc })
          const now = time()
          await cleanFiles({ doc, fileFields: fileFs, next: patch, storage: ctx.storage })
          await dbPatch(ctx.db, id, { ...patch, ...now })
          if (hooks?.afterUpdate) await hooks.afterUpdate(chk(ctx), { id, patch, prev: doc })
          return { ...doc, ...patch, ...now }
        })
      }),
      rm = m({
        args: idArgs,
        handler: typed(async (ctx: MutCtx, { id }: { id: string }) => {
          const doc = await ctx.db.get(id)
          if (!doc) return err('NOT_FOUND', `${table}:rm`)
          const parentId = getFK(doc)
          if (!(await verifyParentOwnership(ctx, parentId))) return err('NOT_FOUND', `${table}:rm`)
          if (hooks?.beforeDelete) await hooks.beforeDelete(chk(ctx), { doc, id })
          await dbDelete(ctx.db, id)
          await cleanFiles({ doc, fileFields: fileFs, storage: ctx.storage })
          if (hooks?.afterDelete) await hooks.afterDelete(chk(ctx), { doc, id })
          return doc
        })
      }),
      bulkCreate = m({
        args: { [foreignKey]: zid(parent), items: array(schema).max(BULK_MAX) },
        handler: typed(async (ctx: UserCtx, a: Rec) => {
          const parentId = a[foreignKey] as string,
            items = a.items as Rec[]
          if (items.length > 100) return err('LIMIT_EXCEEDED', `${table}:bulkCreate`)
          if (!(await verifyParentOwnership(ctx, parentId))) return err('NOT_FOUND', `${table}:bulkCreate`)
          const ids: string[] = []
          for (const item of items) {
            let data = schema.parse(pickFields(item, schemaKeys)) as Rec
            if (hooks?.beforeCreate) data = await hooks.beforeCreate(chk(ctx), { data })
            const id = await dbInsert(ctx.db, table, { ...data, [foreignKey]: parentId, ...time() })
            if (hooks?.afterCreate) await hooks.afterCreate(chk(ctx), { data, id })
            ids.push(id)
          }
          return ids
        })
      }),
      bulkRm = m({
        args: { ids: bulkIdsSchema },
        handler: typed(async (ctx: MutCtx, a: Rec) => {
          const ids = a.ids as string[]
          if (ids.length > 100) return err('LIMIT_EXCEEDED', `${table}:bulkRm`)
          let deleted = 0
          for (const id of ids) {
            const doc = await ctx.db.get(id)
            if (doc && (await verifyParentOwnership(ctx, getFK(doc)))) {
              if (hooks?.beforeDelete) await hooks.beforeDelete(chk(ctx), { doc, id })
              await dbDelete(ctx.db, id)
              await cleanFiles({ doc, fileFields: fileFs, storage: ctx.storage })
              if (hooks?.afterDelete) await hooks.afterDelete(chk(ctx), { doc, id })
              deleted += 1
            }
          }
          return deleted
        })
      }),
      bulkUpdate = m({
        args: { data: partial, ids: bulkIdsSchema },
        handler: typed(async (ctx: MutCtx, a: Rec) => {
          const { data, ids } = a as { data: Rec; ids: string[] }
          if (ids.length > 100) return err('LIMIT_EXCEEDED', `${table}:bulkUpdate`)
          const results: Rec[] = []
          for (const id of ids) {
            const doc = await ctx.db.get(id)
            if (doc && (await verifyParentOwnership(ctx, getFK(doc)))) {
              let patch = partial.parse(pickFields(data, schemaKeys)) as Rec
              if (hooks?.beforeUpdate) patch = await hooks.beforeUpdate(chk(ctx), { id, patch, prev: doc })
              const now = time()
              await cleanFiles({ doc, fileFields: fileFs, next: patch, storage: ctx.storage })
              await dbPatch(ctx.db, id, { ...patch, ...now })
              if (hooks?.afterUpdate) await hooks.afterUpdate(chk(ctx), { id, patch, prev: doc })
              results.push({ ...doc, ...patch, ...now })
            }
          }
          return results
        })
      }),
      list = q({
        args: { [foreignKey]: zid(parent), limit: number().optional() },
        handler: typed(async (ctx: UserCtx, a: Rec) => {
          const args = a,
            parentId = args[foreignKey] as string
          if (!(await verifyParentOwnership(ctx, parentId))) return err('NOT_AUTHORIZED', `${table}:list`)
          const qry = ctx.db
            .query(table)
            .withIndex(
              index,
              idx(i => i.eq(foreignKey, parentId))
            )
            .order('asc')
          return args.limit ? qry.take(args.limit as number) : qry.collect()
        })
      }),
      get = q({
        args: idArgs,
        handler: typed(async (ctx: UserCtx, { id }: { id: string }) => {
          const doc = await ctx.db.get(id)
          if (!doc) return null
          const parentId = getFK(doc)
          if (!(await verifyParentOwnership(ctx, parentId))) return err('NOT_AUTHORIZED', `${table}:get`)
          return doc
        })
      }),
      pubField = options?.pub?.parentField,
      pub =
        pubField && pq
          ? {
              get: pq({
                args: idArgs,
                handler: typed(async (ctx: { db: DbReadLike }, { id }: { id: string }) => {
                  const doc = await ctx.db.get(id)
                  if (!doc) return null
                  if (!(await checkParentField(ctx.db, getFK(doc), pubField))) return err('NOT_FOUND', `${table}:pub.get`)
                  return doc
                })
              }),
              list: pq({
                args: { [foreignKey]: zid(parent), limit: number().optional() },
                handler: typed(async (ctx: { db: DbReadLike }, a: Rec) => {
                  const parentId = a[foreignKey] as string
                  if (!(await checkParentField(ctx.db, parentId, pubField))) return err('NOT_FOUND', `${table}:pub.list`)
                  const qry = ctx.db
                    .query(table)
                    .withIndex(
                      index,
                      idx(i => i.eq(foreignKey, parentId))
                    )
                    .order('asc')
                  return a.limit ? qry.take(a.limit as number) : qry.collect()
                })
              })
            }
          : undefined
    return {
      bulkCreate,
      bulkRm,
      bulkUpdate,
      create,
      get,
      list,
      ...(pub ? { pub } : {}),
      rm,
      update
    } as unknown as ChildCrudResult<S>
  }

export { makeChildCrud }

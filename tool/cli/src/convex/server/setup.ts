/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
/* eslint-disable complexity, @typescript-eslint/max-params */
import type { GenericDataModel, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import type { ZodObject, ZodRawShape } from 'zod/v4'
import { customCtx } from 'convex-helpers/server/customFunctions'
import { zCustomMutation, zCustomQuery } from 'convex-helpers/server/zod4'
import type { OrgCrudOptions } from './org-crud'
import type {
  BaseSchema,
  CacheHookCtx,
  CacheHooks,
  CrudHooks,
  CrudOptions,
  DbLike,
  GlobalHooks,
  HookCtx,
  OrgSchema,
  OwnedSchema,
  Rec,
  SetupConfig,
  SingletonOptions,
  SingletonSchema
} from './types'
import { typed } from './bridge'
import { makeCacheCrud } from './cache-crud'
import { makeChildCrud } from './child'
import { makeCrud } from './crud'
import { dbInsert, dbPatch, err, getUser, makeUnique, ownGet, readCtx, time } from './helpers'
import { composeMiddleware } from './middleware'
import { makeOrg } from './org'
import { makeOrgCrud } from './org-crud'
import { makeSingletonCrud } from './singleton'
const mergeGlobalHooks = (a: GlobalHooks | undefined, b: GlobalHooks | undefined): GlobalHooks | undefined => {
  if (!(a || b)) return
  if (!a) return b
  if (!b) return a
  const merged: GlobalHooks = {}
  if (a.beforeCreate ?? b.beforeCreate)
    merged.beforeCreate = async (ctx, args) => {
      let { data } = args
      if (a.beforeCreate) data = await a.beforeCreate(ctx, { data })
      if (b.beforeCreate) data = await b.beforeCreate(ctx, { data })
      return data
    }
  if (a.afterCreate ?? b.afterCreate)
    merged.afterCreate = async (ctx, args) => {
      if (a.afterCreate) await a.afterCreate(ctx, args)
      if (b.afterCreate) await b.afterCreate(ctx, args)
    }
  if (a.beforeUpdate ?? b.beforeUpdate)
    merged.beforeUpdate = async (ctx, args) => {
      let { patch } = args
      if (a.beforeUpdate) patch = await a.beforeUpdate(ctx, { ...args, patch })
      if (b.beforeUpdate) patch = await b.beforeUpdate(ctx, { ...args, patch })
      return patch
    }
  if (a.afterUpdate ?? b.afterUpdate)
    merged.afterUpdate = async (ctx, args) => {
      if (a.afterUpdate) await a.afterUpdate(ctx, args)
      if (b.afterUpdate) await b.afterUpdate(ctx, args)
    }
  if (a.beforeDelete ?? b.beforeDelete)
    merged.beforeDelete = async (ctx, args) => {
      if (a.beforeDelete) await a.beforeDelete(ctx, args)
      if (b.beforeDelete) await b.beforeDelete(ctx, args)
    }
  if (a.afterDelete ?? b.afterDelete)
    merged.afterDelete = async (ctx, args) => {
      if (a.afterDelete) await a.afterDelete(ctx, args)
      if (b.afterDelete) await b.afterDelete(ctx, args)
    }
  return merged
}
const mergeHooks = (gh: GlobalHooks | undefined, fh: CrudHooks | undefined, table: string): CrudHooks | undefined => {
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
}
const mergeCacheHooks = (
  gh: GlobalHooks | undefined,
  fh: CacheHooks | undefined,
  table: string
): CacheHooks | undefined => {
  if (!(gh || fh)) return
  const merged: CacheHooks = {}
  if (fh?.onFetch) merged.onFetch = fh.onFetch
  if (gh?.beforeCreate ?? fh?.beforeCreate)
    merged.beforeCreate = async (ctx: CacheHookCtx, args: { data: Rec }) => {
      let { data } = args
      if (gh?.beforeCreate) data = await gh.beforeCreate({ ...ctx, table }, { data })
      if (fh?.beforeCreate) data = await fh.beforeCreate(ctx, { data })
      return data
    }
  if (gh?.afterCreate ?? fh?.afterCreate)
    merged.afterCreate = async (ctx: CacheHookCtx, args: { data: Rec; id: string }) => {
      if (gh?.afterCreate) await gh.afterCreate({ ...ctx, table }, args)
      if (fh?.afterCreate) await fh.afterCreate(ctx, args)
    }
  if (gh?.beforeUpdate ?? fh?.beforeUpdate)
    merged.beforeUpdate = async (ctx: CacheHookCtx, args: { id: string; patch: Rec; prev: Rec }) => {
      let { patch } = args
      if (gh?.beforeUpdate) patch = await gh.beforeUpdate({ ...ctx, table }, { ...args, patch })
      if (fh?.beforeUpdate) patch = await fh.beforeUpdate(ctx, { ...args, patch })
      return patch
    }
  if (gh?.afterUpdate ?? fh?.afterUpdate)
    merged.afterUpdate = async (ctx: CacheHookCtx, args: { id: string; patch: Rec; prev: Rec }) => {
      if (gh?.afterUpdate) await gh.afterUpdate({ ...ctx, table }, args)
      if (fh?.afterUpdate) await fh.afterUpdate(ctx, args)
    }
  if (gh?.beforeDelete ?? fh?.beforeDelete)
    merged.beforeDelete = async (ctx: CacheHookCtx, args: { doc: Rec; id: string }) => {
      if (gh?.beforeDelete) await gh.beforeDelete({ ...ctx, table }, args)
      if (fh?.beforeDelete) await fh.beforeDelete(ctx, args)
    }
  if (gh?.afterDelete ?? fh?.afterDelete)
    merged.afterDelete = async (ctx: CacheHookCtx, args: { doc: Rec; id: string }) => {
      if (gh?.afterDelete) await gh.afterDelete({ ...ctx, table }, args)
      if (fh?.afterDelete) await fh.afterDelete(ctx, args)
    }
  return merged
}
/**
 * Initializes noboil/convex by wiring Convex builders, auth, hooks, and middleware into factory functions.
 * @param config - Convex query/mutation/action builders, getAuthUserId, optional hooks, middleware, and org config
 * @returns Object containing `crud`, `orgCrud`, `childCrud`, `cacheCrud`, `singletonCrud`, custom builders (`pq`, `q`, `m`), and `org` endpoints
 * @example
 * const { crud, orgCrud, pq, q, m } = setup({
 *   query, mutation, action, internalQuery, internalMutation, getAuthUserId
 * })
 *
 * // Then generate endpoints:
 * export const { create, update, rm, pub: { list, read } } = crud('blog', owned.blog)
 */
const setup = <DM extends GenericDataModel>(config: SetupConfig<DM>) => {
  type QCtx = GenericQueryCtx<DM>
  type MCtx = GenericMutationCtx<DM>
  const { getAuthUserId } = config
  const mwHooks = config.middleware && config.middleware.length > 0 ? composeMiddleware(...config.middleware) : undefined
  const gh = mergeGlobalHooks(config.hooks, mwHooks)
  const authId = async (c: unknown) => getAuthUserId(typed(c))
  const asDb = (c: { db: unknown }) => typed(c.db) as DbLike
  const pq = zCustomQuery(
    config.query,
    customCtx(async (c: QCtx) => {
      const vid = await authId(c)
      const { withAuthor } = readCtx({ db: asDb(c), storage: typed(c.storage), viewerId: vid })
      return { viewerId: vid, withAuthor }
    })
  )
  const q = zCustomQuery(
    config.query,
    customCtx(async (c: QCtx) => {
      const db = asDb(c)
      const user = await getUser({ ctx: typed(c), db, getAuthUserId })
      const { viewerId, withAuthor } = readCtx({ db, storage: typed(c.storage), viewerId: user._id })
      return {
        get: ownGet(db, user._id),
        user,
        viewerId,
        withAuthor
      }
    })
  )
  const m = zCustomMutation(
    config.mutation,
    customCtx(async (c: MCtx) => {
      const db = asDb(c)
      const user = await getUser({ ctx: typed(c), db, getAuthUserId })
      const get = ownGet(db, user._id)
      return {
        create: async (t: string, d: Rec) => dbInsert(db, t, { ...d, ...time(), userId: user._id }),
        delete: async (id: string) => {
          const d = await get(id)
          await db.delete(id)
          return d
        },
        get,
        patch: async (
          id: string,
          data: ((doc: Rec) => Partial<Rec> | Promise<Partial<Rec>>) | Partial<Rec>,
          expectedUpdatedAt?: number
        ) => {
          const doc = await get(id)
          if (expectedUpdatedAt !== undefined && doc.updatedAt !== expectedUpdatedAt) return err('CONFLICT')
          const up = typeof data === 'function' ? await data(doc) : data
          const now = time()
          await dbPatch(db, id, { ...up, ...now })
          return { ...doc, ...up, ...now }
        },
        user
      }
    })
  )
  const cq = zCustomQuery(
    config.query,
    customCtx(() => ({}))
  )
  const cm = zCustomMutation(
    config.mutation,
    customCtx(() => ({}))
  )
  const crud = <S extends ZodRawShape>(table: keyof DM & string, schema: OwnedSchema<S>, opt?: CrudOptions<S>) =>
    makeCrud({
      builders: { cm, cq, m: typed(m), pq: typed(pq), q: typed(q) },
      options: opt
        ? { ...opt, hooks: mergeHooks(gh, opt.hooks, table) }
        : gh
          ? { hooks: mergeHooks(gh, undefined, table) }
          : undefined,
      schema,
      strictFilter: config.strictFilter,
      table
    })
  const childCrud = <S extends ZodRawShape, PS extends ZodRawShape = ZodRawShape>(
    table: keyof DM & string,
    meta: { foreignKey: string; index: string; parent: string; parentSchema?: ZodObject<PS>; schema: ZodObject<S> },
    opt?: { pub?: { parentField: keyof PS & string } }
  ) =>
    makeChildCrud({
      builders: { m: typed(m), pq: typed(pq), q: typed(q) },
      globalHooks: gh,
      meta,
      options: opt,
      table
    })
  const orgCrud = <S extends ZodRawShape>(table: keyof DM & string, schema: OrgSchema<S>, opt?: OrgCrudOptions<S>) =>
    makeOrgCrud({
      builders: { m: typed(m), q: typed(q) },
      options: opt
        ? { ...opt, hooks: mergeHooks(gh, opt.hooks, table) }
        : gh
          ? { hooks: mergeHooks(gh, undefined, table) }
          : undefined,
      schema,
      table
    })
  const cacheCrud = <S extends ZodRawShape, K extends keyof S & string>(opts: {
    fetcher?: (c: unknown, key: unknown) => Promise<unknown>
    hooks?: CacheHooks
    key: K
    rateLimit?: { max: number; window: number }
    schema: BaseSchema<S>
    staleWhileRevalidate?: boolean
    table: keyof DM & string
    ttl?: number
  }) =>
    makeCacheCrud({
      ...opts,
      builders: {
        action: config.action,
        cm,
        cq,
        internalMutation: config.internalMutation,
        internalQuery: config.internalQuery,
        mutation: config.mutation,
        query: config.query
      },
      hooks: mergeCacheHooks(gh, opts.hooks, opts.table)
    })
  const singletonCrud = <S extends ZodRawShape>(
    table: keyof DM & string,
    schema: SingletonSchema<S>,
    opt?: SingletonOptions
  ) =>
    makeSingletonCrud({
      builders: { m: typed(m), q: typed(q) },
      options: opt,
      schema,
      table
    })
  const uniqueCheck = <S extends ZodRawShape>(
    _schema: ZodObject<S>,
    table: keyof DM & string,
    field: keyof S & string,
    index?: string
  ) => makeUnique({ field, index, pq: typed(pq), table })
  const normCascade = config.orgCascadeTables?.map(t => (typeof t === 'string' ? { table: t } : t))
  const org = config.orgSchema
    ? makeOrg({
        cascadeTables: normCascade,
        getAuthUserId: config.getAuthUserId,
        mutation: config.mutation,
        query: config.query,
        schema: config.orgSchema
      })
    : undefined
  const user = { me: q({ handler: (c: Rec) => c.user }) }
  return { cacheCrud, childCrud, cm, cq, crud, m, org, orgCrud, pq, q, singletonCrud, uniqueCheck, user }
}
export { mergeCacheHooks, mergeGlobalHooks, mergeHooks, setup }

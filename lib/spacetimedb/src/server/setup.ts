/** biome-ignore-all lint/nursery/useConsistentMethodSignatures: bivariant method syntax needed for SDK compat */
/* eslint-disable @typescript-eslint/max-params */
import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ReducerExport, TypeBuilder } from 'spacetimedb/server'
import type { ZodRawShape } from 'zod/v4'

import { t } from 'spacetimedb/server'

import type { OrgFieldBuilders } from './org'
import type { FieldBuilder, ZodBridgeT } from './stdb-tables'
import type {
  BaseSchema,
  GlobalHookCtx,
  GlobalHooks,
  Middleware,
  OrgDefSchema,
  OrgSchema,
  OwnedSchema,
  RateLimitInput,
  Rec,
  SingletonSchema
} from './types'
import type { CacheFieldBuilders, CacheOptions } from './types/cache'
import type { CrudFieldBuilders, CrudHooks, CrudOptions } from './types/crud'
import type { FileUploadFields } from './types/file'
import type { OrgCrudFieldBuilders, OrgCrudOptions } from './types/org-crud'
import type { SingletonFieldBuilders, SingletonHooks, SingletonOptions } from './types/singleton'

import { makeCacheCrud } from './cache-crud'
import { makeChildCrud } from './child'
import { makeCrud } from './crud'
import { makeFileUpload } from './file'
import { err, normalizeRateLimit } from './helpers'
import { composeMiddleware } from './middleware'
import { makeOrg, makeOrgTables } from './org'
import { makeOrgCrud } from './org-crud'
import { RLS_COL, RLS_TBL, rlsChildSql, rlsSql, rlsWhereSender } from './rls'
import { makeSingletonCrud } from './singleton'
import { makeSchema, zodToStdbFields } from './stdb-tables'

interface CrudDefaults {
  expectedUpdatedAtField?: TypeBuilder<unknown, AlgebraicTypeType>
  foreignKeyField?: TypeBuilder<unknown, AlgebraicTypeType>
  idField?: TypeBuilder<unknown, AlgebraicTypeType>
  orgIdField?: TypeBuilder<unknown, AlgebraicTypeType>
  t?: ZodBridgeT
}

interface OrgTypeBuilders {
  bool: () => TypeBuilder<unknown, AlgebraicTypeType>
  identity: () => TypeBuilder<unknown, AlgebraicTypeType>
  string: () => TypeBuilder<unknown, AlgebraicTypeType>
}

type ReducerExportRecord = Record<string, ReducerExport<never, never>>

interface RegisterAllSchemas {
  base?: Record<string, ZodLike>
  children?: Record<string, { foreignKey: string; parent: string; schema: ZodLike }>
  file?: boolean | string
  orgScoped?: Record<string, ZodLike>
  owned?: Record<string, ZodLike>
  singleton?: Record<string, ZodLike>
}

interface SetupConfig {
  hooks?: GlobalHooks
  middleware?: Middleware[]
}

interface SpacetimeDbLike {
  // eslint-disable-next-line @typescript-eslint/method-signature-style
  reducer(...args: unknown[]): unknown
}

interface ZodLike {
  shape: Record<string, unknown>
  type: 'object'
}

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
    if (!value || typeof value !== 'object') return false
    const { then } = value as { then?: unknown }
    return typeof then === 'function'
  },
  requireSync = <T>(value: Promise<T> | T, hookName: string): T => {
    if (isPromiseLike(value))
      return err('VALIDATION_FAILED', {
        message: `Hook "${hookName}" must be synchronous in SpacetimeDB reducers`
      })
    return value
  },
  toGlobalCtx = (
    table: string,
    {
      db,
      sender,
      timestamp
    }: {
      db: unknown
      sender: GlobalHookCtx['sender']
      timestamp: GlobalHookCtx['timestamp']
    }
  ): GlobalHookCtx => ({ db, sender, table, timestamp }),
  hasGlobalHooks = (hooks: GlobalHooks): boolean =>
    Boolean(
      hooks.beforeCreate ??
        hooks.afterCreate ??
        hooks.beforeUpdate ??
        hooks.afterUpdate ??
        hooks.beforeDelete ??
        hooks.afterDelete
    ),
  mergeGlobalBeforeCreate = (left: GlobalHooks, right: GlobalHooks): GlobalHooks['beforeCreate'] => {
    if (!(left.beforeCreate || right.beforeCreate)) return
    return (ctx, { data: initialData }) => {
      let data = initialData
      if (left.beforeCreate) data = requireSync(left.beforeCreate(ctx, { data }), 'global.beforeCreate:left')
      if (right.beforeCreate) data = requireSync(right.beforeCreate(ctx, { data }), 'global.beforeCreate:right')
      return data
    }
  },
  mergeGlobalAfterCreate = (left: GlobalHooks, right: GlobalHooks): GlobalHooks['afterCreate'] => {
    if (!(left.afterCreate || right.afterCreate)) return
    return (ctx, args) => {
      if (left.afterCreate) requireSync(left.afterCreate(ctx, args), 'global.afterCreate:left')
      if (right.afterCreate) requireSync(right.afterCreate(ctx, args), 'global.afterCreate:right')
    }
  },
  mergeGlobalBeforeUpdate = (left: GlobalHooks, right: GlobalHooks): GlobalHooks['beforeUpdate'] => {
    if (!(left.beforeUpdate || right.beforeUpdate)) return
    return (ctx, { patch: initialPatch, prev }) => {
      let patch = initialPatch
      if (left.beforeUpdate) patch = requireSync(left.beforeUpdate(ctx, { patch, prev }), 'global.beforeUpdate:left')
      if (right.beforeUpdate) patch = requireSync(right.beforeUpdate(ctx, { patch, prev }), 'global.beforeUpdate:right')
      return patch
    }
  },
  mergeGlobalAfterUpdate = (left: GlobalHooks, right: GlobalHooks): GlobalHooks['afterUpdate'] => {
    if (!(left.afterUpdate || right.afterUpdate)) return
    return (ctx, args) => {
      if (left.afterUpdate) requireSync(left.afterUpdate(ctx, args), 'global.afterUpdate:left')
      if (right.afterUpdate) requireSync(right.afterUpdate(ctx, args), 'global.afterUpdate:right')
    }
  },
  mergeGlobalBeforeDelete = (left: GlobalHooks, right: GlobalHooks): GlobalHooks['beforeDelete'] => {
    if (!(left.beforeDelete || right.beforeDelete)) return
    return (ctx, args) => {
      if (left.beforeDelete) requireSync(left.beforeDelete(ctx, args), 'global.beforeDelete:left')
      if (right.beforeDelete) requireSync(right.beforeDelete(ctx, args), 'global.beforeDelete:right')
    }
  },
  mergeGlobalAfterDelete = (left: GlobalHooks, right: GlobalHooks): GlobalHooks['afterDelete'] => {
    if (!(left.afterDelete || right.afterDelete)) return
    return (ctx, args) => {
      if (left.afterDelete) requireSync(left.afterDelete(ctx, args), 'global.afterDelete:left')
      if (right.afterDelete) requireSync(right.afterDelete(ctx, args), 'global.afterDelete:right')
    }
  },
  mergeGlobalHooks = (left: GlobalHooks | undefined, right: GlobalHooks | undefined): GlobalHooks | undefined => {
    if (!(left || right)) return
    if (!left) return right
    if (!right) return left

    const merged: GlobalHooks = {
      afterCreate: mergeGlobalAfterCreate(left, right),
      afterDelete: mergeGlobalAfterDelete(left, right),
      afterUpdate: mergeGlobalAfterUpdate(left, right),
      beforeCreate: mergeGlobalBeforeCreate(left, right),
      beforeDelete: mergeGlobalBeforeDelete(left, right),
      beforeUpdate: mergeGlobalBeforeUpdate(left, right)
    }

    if (!hasGlobalHooks(merged)) return
    return merged
  },
  hasCrudHooks = <DB, Row extends Rec, CreateArgs extends Rec, UpdatePatch extends Rec>(
    hooks: CrudHooks<DB, Row, CreateArgs, UpdatePatch>
  ): boolean =>
    Boolean(
      hooks.beforeCreate ??
        hooks.afterCreate ??
        hooks.beforeUpdate ??
        hooks.afterUpdate ??
        hooks.beforeDelete ??
        hooks.afterDelete
    ),
  mergeCrudBeforeCreate = <DB, Row extends Rec, CreateArgs extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: CrudHooks<DB, Row, CreateArgs, UpdatePatch> | undefined
  ): CrudHooks<DB, Row, CreateArgs, UpdatePatch>['beforeCreate'] => {
    if (!(globalHooks?.beforeCreate || localHooks?.beforeCreate)) return
    return (ctx, { data: initialData }) => {
      let data = initialData
      if (globalHooks?.beforeCreate)
        data = requireSync(
          globalHooks.beforeCreate(toGlobalCtx(table, ctx), {
            data: data as Rec
          }),
          'crud.beforeCreate:global'
        ) as CreateArgs
      if (localHooks?.beforeCreate) data = requireSync(localHooks.beforeCreate(ctx, { data }), 'crud.beforeCreate:local')
      return data
    }
  },
  mergeCrudAfterCreate = <DB, Row extends Rec, CreateArgs extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: CrudHooks<DB, Row, CreateArgs, UpdatePatch> | undefined
  ): CrudHooks<DB, Row, CreateArgs, UpdatePatch>['afterCreate'] => {
    if (!(globalHooks?.afterCreate || localHooks?.afterCreate)) return
    return (ctx, { data, row }) => {
      if (globalHooks?.afterCreate)
        requireSync(
          globalHooks.afterCreate(toGlobalCtx(table, ctx), {
            data: data as Rec,
            row: row as Rec
          }),
          'crud.afterCreate:global'
        )
      if (localHooks?.afterCreate) requireSync(localHooks.afterCreate(ctx, { data, row }), 'crud.afterCreate:local')
    }
  },
  mergeCrudBeforeUpdate = <DB, Row extends Rec, CreateArgs extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: CrudHooks<DB, Row, CreateArgs, UpdatePatch> | undefined
  ): CrudHooks<DB, Row, CreateArgs, UpdatePatch>['beforeUpdate'] => {
    if (!(globalHooks?.beforeUpdate || localHooks?.beforeUpdate)) return
    return (ctx, { patch: initialPatch, prev }) => {
      let patch = initialPatch
      if (globalHooks?.beforeUpdate)
        patch = requireSync(
          globalHooks.beforeUpdate(toGlobalCtx(table, ctx), {
            patch: patch as Rec,
            prev: prev as Rec
          }),
          'crud.beforeUpdate:global'
        ) as UpdatePatch
      if (localHooks?.beforeUpdate)
        patch = requireSync(localHooks.beforeUpdate(ctx, { patch, prev }), 'crud.beforeUpdate:local')
      return patch
    }
  },
  mergeCrudAfterUpdate = <DB, Row extends Rec, CreateArgs extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: CrudHooks<DB, Row, CreateArgs, UpdatePatch> | undefined
  ): CrudHooks<DB, Row, CreateArgs, UpdatePatch>['afterUpdate'] => {
    if (!(globalHooks?.afterUpdate || localHooks?.afterUpdate)) return
    return (ctx, { next, patch, prev }) => {
      if (globalHooks?.afterUpdate)
        requireSync(
          globalHooks.afterUpdate(toGlobalCtx(table, ctx), {
            next: next as Rec,
            patch: patch as Rec,
            prev: prev as Rec
          }),
          'crud.afterUpdate:global'
        )
      if (localHooks?.afterUpdate)
        requireSync(localHooks.afterUpdate(ctx, { next, patch, prev }), 'crud.afterUpdate:local')
    }
  },
  mergeCrudBeforeDelete = <DB, Row extends Rec, CreateArgs extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: CrudHooks<DB, Row, CreateArgs, UpdatePatch> | undefined
  ): CrudHooks<DB, Row, CreateArgs, UpdatePatch>['beforeDelete'] => {
    if (!(globalHooks?.beforeDelete || localHooks?.beforeDelete)) return
    return (ctx, { row }) => {
      if (globalHooks?.beforeDelete)
        requireSync(
          globalHooks.beforeDelete(toGlobalCtx(table, ctx), {
            row: row as Rec
          }),
          'crud.beforeDelete:global'
        )
      if (localHooks?.beforeDelete) requireSync(localHooks.beforeDelete(ctx, { row }), 'crud.beforeDelete:local')
    }
  },
  mergeCrudAfterDelete = <DB, Row extends Rec, CreateArgs extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: CrudHooks<DB, Row, CreateArgs, UpdatePatch> | undefined
  ): CrudHooks<DB, Row, CreateArgs, UpdatePatch>['afterDelete'] => {
    if (!(globalHooks?.afterDelete || localHooks?.afterDelete)) return
    return (ctx, { row }) => {
      if (globalHooks?.afterDelete)
        requireSync(globalHooks.afterDelete(toGlobalCtx(table, ctx), { row: row as Rec }), 'crud.afterDelete:global')
      if (localHooks?.afterDelete) requireSync(localHooks.afterDelete(ctx, { row }), 'crud.afterDelete:local')
    }
  },
  mergeCrudHooks = <DB, Row extends Rec, CreateArgs extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: CrudHooks<DB, Row, CreateArgs, UpdatePatch> | undefined
  ): CrudHooks<DB, Row, CreateArgs, UpdatePatch> | undefined => {
    if (!(globalHooks || localHooks)) return
    const merged: CrudHooks<DB, Row, CreateArgs, UpdatePatch> = {
      afterCreate: mergeCrudAfterCreate(table, globalHooks, localHooks),
      afterDelete: mergeCrudAfterDelete(table, globalHooks, localHooks),
      afterUpdate: mergeCrudAfterUpdate(table, globalHooks, localHooks),
      beforeCreate: mergeCrudBeforeCreate(table, globalHooks, localHooks),
      beforeDelete: mergeCrudBeforeDelete(table, globalHooks, localHooks),
      beforeUpdate: mergeCrudBeforeUpdate(table, globalHooks, localHooks)
    }
    if (!hasCrudHooks(merged)) return
    return merged
  },
  hasSingletonHooks = <DB, Row extends Rec, UpdatePatch extends Rec>(
    hooks: SingletonHooks<DB, Row, UpdatePatch>
  ): boolean =>
    Boolean(hooks.beforeCreate ?? hooks.afterCreate ?? hooks.beforeUpdate ?? hooks.afterUpdate ?? hooks.beforeRead),
  mergeSingletonBeforeCreate = <DB, Row extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: SingletonHooks<DB, Row, UpdatePatch> | undefined
  ): SingletonHooks<DB, Row, UpdatePatch>['beforeCreate'] => {
    if (!(globalHooks?.beforeCreate || localHooks?.beforeCreate)) return
    return (ctx, { data: initialData }) => {
      let data = initialData
      if (globalHooks?.beforeCreate)
        data = requireSync(
          globalHooks.beforeCreate(toGlobalCtx(table, ctx), {
            data: data as Rec
          }),
          'singleton.beforeCreate:global'
        ) as UpdatePatch
      if (localHooks?.beforeCreate)
        data = requireSync(localHooks.beforeCreate(ctx, { data }), 'singleton.beforeCreate:local')
      return data
    }
  },
  mergeSingletonAfterCreate = <DB, Row extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: SingletonHooks<DB, Row, UpdatePatch> | undefined
  ): SingletonHooks<DB, Row, UpdatePatch>['afterCreate'] => {
    if (!(globalHooks?.afterCreate || localHooks?.afterCreate)) return
    return (ctx, { data, row }) => {
      if (globalHooks?.afterCreate)
        requireSync(
          globalHooks.afterCreate(toGlobalCtx(table, ctx), {
            data: data as Rec,
            row: row as Rec
          }),
          'singleton.afterCreate:global'
        )
      if (localHooks?.afterCreate) requireSync(localHooks.afterCreate(ctx, { data, row }), 'singleton.afterCreate:local')
    }
  },
  mergeSingletonBeforeUpdate = <DB, Row extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: SingletonHooks<DB, Row, UpdatePatch> | undefined
  ): SingletonHooks<DB, Row, UpdatePatch>['beforeUpdate'] => {
    if (!(globalHooks?.beforeUpdate || localHooks?.beforeUpdate)) return
    return (ctx, { patch: initialPatch, prev }) => {
      let patch = initialPatch
      if (globalHooks?.beforeUpdate)
        patch = requireSync(
          globalHooks.beforeUpdate(toGlobalCtx(table, ctx), {
            patch: patch as Rec,
            prev: prev as Rec
          }),
          'singleton.beforeUpdate:global'
        ) as UpdatePatch
      if (localHooks?.beforeUpdate)
        patch = requireSync(localHooks.beforeUpdate(ctx, { patch, prev }), 'singleton.beforeUpdate:local')
      return patch
    }
  },
  mergeSingletonAfterUpdate = <DB, Row extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: SingletonHooks<DB, Row, UpdatePatch> | undefined
  ): SingletonHooks<DB, Row, UpdatePatch>['afterUpdate'] => {
    if (!(globalHooks?.afterUpdate || localHooks?.afterUpdate)) return
    return (ctx, { next, patch, prev }) => {
      if (globalHooks?.afterUpdate)
        requireSync(
          globalHooks.afterUpdate(toGlobalCtx(table, ctx), {
            next: next as Rec,
            patch: patch as Rec,
            prev: prev as Rec
          }),
          'singleton.afterUpdate:global'
        )
      if (localHooks?.afterUpdate)
        requireSync(localHooks.afterUpdate(ctx, { next, patch, prev }), 'singleton.afterUpdate:local')
    }
  },
  mergeSingletonHooks = <DB, Row extends Rec, UpdatePatch extends Rec>(
    table: string,
    globalHooks: GlobalHooks | undefined,
    localHooks: SingletonHooks<DB, Row, UpdatePatch> | undefined
  ): SingletonHooks<DB, Row, UpdatePatch> | undefined => {
    if (!(globalHooks || localHooks)) return
    const merged: SingletonHooks<DB, Row, UpdatePatch> = {
      afterCreate: mergeSingletonAfterCreate(table, globalHooks, localHooks),
      afterUpdate: mergeSingletonAfterUpdate(table, globalHooks, localHooks),
      beforeCreate: mergeSingletonBeforeCreate(table, globalHooks, localHooks),
      beforeRead: localHooks?.beforeRead,
      beforeUpdate: mergeSingletonBeforeUpdate(table, globalHooks, localHooks)
    }
    if (!hasSingletonHooks(merged)) return
    return merged
  },
  registerExports = (target: ReducerExportRecord, next: ReducerExportRecord) => {
    const names = Object.keys(next)
    for (const name of names) {
      const reducer = next[name]
      if (reducer) target[name] = reducer
    }
  },
  /** Low-level factory that creates CRUD builders from shared SpacetimeDB config. */
  setup = (spacetimedb: SpacetimeDbLike, config: SetupConfig = {}) => {
    const middlewareHooks =
        config.middleware && config.middleware.length > 0 ? composeMiddleware(...config.middleware) : undefined,
      globalHooks = mergeGlobalHooks(config.hooks, middlewareHooks),
      accumulatedExports: ReducerExportRecord = {},
      crud = (factoryConfig: Parameters<typeof makeCrud>[1]) => {
        const mergedHooks = mergeCrudHooks(
            factoryConfig.tableName,
            globalHooks,
            factoryConfig.options?.hooks as CrudHooks<unknown, Rec, Rec, Rec> | undefined
          ),
          nextConfig = mergedHooks
            ? {
                ...factoryConfig,
                options: {
                  ...factoryConfig.options,
                  hooks: mergedHooks
                }
              }
            : factoryConfig,
          result = makeCrud(spacetimedb, nextConfig as Parameters<typeof makeCrud>[1])
        registerExports(accumulatedExports, result.exports)
        return result
      },
      orgCrud = (factoryConfig: Parameters<typeof makeOrgCrud>[1]) => {
        const mergedHooks = mergeCrudHooks(
            factoryConfig.tableName,
            globalHooks,
            factoryConfig.options?.hooks as CrudHooks<unknown, Rec, Rec, Rec> | undefined
          ),
          nextConfig = mergedHooks
            ? {
                ...factoryConfig,
                options: {
                  ...factoryConfig.options,
                  hooks: mergedHooks
                }
              }
            : factoryConfig,
          result = makeOrgCrud(spacetimedb, nextConfig as Parameters<typeof makeOrgCrud>[1])
        registerExports(accumulatedExports, result.exports)
        return result
      },
      childCrud = (factoryConfig: Parameters<typeof makeChildCrud>[1]) => {
        const mergedHooks = mergeCrudHooks(
            factoryConfig.tableName,
            globalHooks,
            factoryConfig.options?.hooks as CrudHooks<unknown, Rec, Rec, Rec> | undefined
          ),
          nextConfig = mergedHooks
            ? {
                ...factoryConfig,
                options: {
                  ...factoryConfig.options,
                  hooks: mergedHooks
                }
              }
            : factoryConfig,
          result = makeChildCrud(spacetimedb, nextConfig as Parameters<typeof makeChildCrud>[1])
        registerExports(accumulatedExports, result.exports)
        return result
      },
      singletonCrud = (factoryConfig: Parameters<typeof makeSingletonCrud>[1]) => {
        const mergedHooks = mergeSingletonHooks(
            factoryConfig.tableName,
            globalHooks,
            factoryConfig.options?.hooks as SingletonHooks<unknown, Rec, Rec> | undefined
          ),
          nextConfig = mergedHooks
            ? {
                ...factoryConfig,
                options: {
                  ...factoryConfig.options,
                  hooks: mergedHooks
                }
              }
            : factoryConfig,
          result = makeSingletonCrud(spacetimedb, nextConfig as Parameters<typeof makeSingletonCrud>[1])
        registerExports(accumulatedExports, result.exports)
        return result
      },
      cacheCrud = (factoryConfig: Parameters<typeof makeCacheCrud>[1]) => {
        const result = makeCacheCrud(spacetimedb, factoryConfig)
        registerExports(accumulatedExports, result.exports)
        return result
      },
      org = (factoryConfig: Parameters<typeof makeOrg>[1]) => {
        const result = makeOrg(spacetimedb as unknown as Parameters<typeof makeOrg>[0], factoryConfig)
        registerExports(accumulatedExports, result.exports)
        return result
      },
      allExports = (): ReducerExportRecord => ({ ...accumulatedExports })

    return {
      allExports,
      cacheCrud,
      childCrud,
      crud,
      exports: accumulatedExports,
      org,
      orgCrud,
      singletonCrud
    }
  }

type TableAccessor = (db: unknown) => unknown

const dbTable: (db: unknown, name: string) => unknown = (db, name) => (db as Record<string, unknown>)[name],
  pkById = (tbl: unknown) => (tbl as Record<string, unknown>).id,
  pkByKey = (name: string) => (tbl: unknown) => (tbl as Record<string, unknown>)[name],
  tblOf =
    (name: string): TableAccessor =>
    db =>
      dbTable(db, name),
  isZodObject = (v: unknown): v is ZodLike =>
    typeof v === 'object' &&
    v !== null &&
    'type' in v &&
    (v as { type: unknown }).type === 'object' &&
    'shape' in v &&
    typeof (v as { shape: unknown }).shape === 'object' &&
    (v as { shape: unknown }).shape !== null,
  resolveCrudFields = (fields: unknown, tableName: string, defaults: CrudDefaults): unknown =>
    isZodObject(fields) && defaults.t ? zodToStdbFields(fields.shape, defaults.t, tableName) : fields

interface RegCtx {
  defaults: CrudDefaults
  expectedUpdatedAtField: TypeBuilder<unknown, AlgebraicTypeType>
  fkField: TypeBuilder<unknown, AlgebraicTypeType>
  idField: TypeBuilder<unknown, AlgebraicTypeType>
  opts: RegTableOpts
  orgIdField: TypeBuilder<unknown, AlgebraicTypeType>
  s: SetupResult
}
type RegTableOpts = Record<string, CacheOptions & CrudOptions & OrgCrudOptions & { key?: string }> | undefined

type SetupResult = ReturnType<typeof setup>

const regOwned = (schemas: Record<string, ZodLike>, ctx: RegCtx) => {
    const names = Object.keys(schemas)
    for (const name of names) {
      const fields = schemas[name]
      if (fields)
        ctx.s.crud({
          expectedUpdatedAtField: ctx.expectedUpdatedAtField as never,
          fields: resolveCrudFields(fields, name, ctx.defaults) as CrudFieldBuilders,
          idField: ctx.idField as never,
          options: (ctx.opts?.[name] ?? undefined) as never,
          pk: pkById as never,
          table: tblOf(name) as never,
          tableName: name
        })
    }
  },
  regOrgScoped = (schemas: Record<string, ZodLike>, ctx: RegCtx) => {
    const names = Object.keys(schemas)
    for (const name of names) {
      const fields = schemas[name]
      if (fields)
        ctx.s.orgCrud({
          expectedUpdatedAtField: ctx.expectedUpdatedAtField as never,
          fields: resolveCrudFields(fields, name, ctx.defaults) as OrgCrudFieldBuilders,
          idField: ctx.idField as never,
          options: (ctx.opts?.[name] ?? undefined) as never,
          orgIdField: ctx.orgIdField as never,
          orgMemberTable: tblOf('orgMember') as never,
          pk: pkById as never,
          table: tblOf(name) as never,
          tableName: name
        })
    }
  },
  regSingleton = (schemas: Record<string, ZodLike>, ctx: RegCtx) => {
    const names = Object.keys(schemas)
    for (const name of names) {
      const fields = schemas[name]
      if (fields)
        ctx.s.singletonCrud({
          fields: resolveCrudFields(fields, name, ctx.defaults) as SingletonFieldBuilders,
          options: (ctx.opts?.[name] ?? undefined) as never,
          table: tblOf(name) as never,
          tableName: name
        })
    }
  },
  regBase = (schemas: Record<string, ZodLike>, ctx: RegCtx) => {
    const names = Object.keys(schemas)
    for (const name of names) {
      const fields = schemas[name]
      if (fields) {
        const tableOpts = ctx.opts?.[name],
          keyName = tableOpts?.key ?? 'id'
        ctx.s.cacheCrud({
          fields: resolveCrudFields(fields, name, ctx.defaults) as CacheFieldBuilders,
          keyField: ctx.idField as never,
          keyName,
          options: tableOpts?.ttl === undefined ? undefined : { ttl: tableOpts.ttl },
          pk: pkByKey(keyName) as never,
          table: tblOf(name) as never,
          tableName: name
        })
      }
    }
  },
  regChildren = (schemas: Record<string, { foreignKey: string; parent: string; schema: ZodLike }>, ctx: RegCtx) => {
    const names = Object.keys(schemas)
    for (const name of names) {
      const entry = schemas[name]
      if (entry)
        ctx.s.childCrud({
          expectedUpdatedAtField: ctx.expectedUpdatedAtField as never,
          fields: resolveCrudFields(entry.schema, name, ctx.defaults) as CrudFieldBuilders,
          foreignKeyField: ctx.fkField as never,
          foreignKeyName: entry.foreignKey,
          idField: ctx.idField as never,
          options: (ctx.opts?.[name] ?? undefined) as never,
          parentPk: pkById as never,
          parentTable: tblOf(entry.parent) as never,
          pk: pkById as never,
          table: tblOf(name) as never,
          tableName: name
        })
    }
  },
  regFile = (file: boolean | string, ctx: RegCtx & { spacetimedb: SpacetimeDbLike; stdbT: ZodBridgeT }) => {
    const namespace = typeof file === 'string' ? file : 'file',
      resolvedFields = {
        contentType: ctx.stdbT.string(),
        filename: ctx.stdbT.string(),
        size: ctx.stdbT.number(),
        storageKey: ctx.stdbT.string()
      } as FileUploadFields,
      result = makeFileUpload(ctx.spacetimedb as Parameters<typeof makeFileUpload>[0], {
        fields: resolvedFields,
        idField: ctx.idField as never,
        namespace,
        pk: pkById as never,
        table: tblOf(namespace) as never
      })
    registerExports(ctx.s.exports, result.exports)
  },
  /** Convenience wrapper around setup with shared field defaults. */
  setupCrud = (spacetimedb: SpacetimeDbLike, defaults: CrudDefaults = {}, config?: SetupConfig) => {
    const s = setup(spacetimedb, config),
      resolvedDefaults: Required<CrudDefaults> = {
        expectedUpdatedAtField: defaults.expectedUpdatedAtField ?? t.timestamp(),
        foreignKeyField: defaults.foreignKeyField ?? defaults.idField ?? t.u32(),
        idField: defaults.idField ?? t.u32(),
        orgIdField: defaults.orgIdField ?? defaults.idField ?? t.u32(),
        t: defaults.t ?? t
      },
      { expectedUpdatedAtField, idField } = resolvedDefaults,
      fkField = resolvedDefaults.foreignKeyField,
      oIdField = resolvedDefaults.orgIdField,
      stdbT = resolvedDefaults.t

    return {
      allExports: s.allExports,

      cacheCrud: (
        tableName: string,
        keyName: string,
        fields: CacheFieldBuilders | ZodLike,
        options?: CacheOptions & {
          keyField?: TypeBuilder<unknown, AlgebraicTypeType>
        }
      ) => {
        const resolvedFields = resolveCrudFields(fields, tableName, resolvedDefaults)
        return s.cacheCrud({
          fields: resolvedFields as CacheFieldBuilders,
          keyField: (options?.keyField ?? idField) as never,
          keyName,
          options: options?.ttl === undefined ? undefined : { ttl: options.ttl },
          pk: pkByKey(keyName) as never,
          table: tblOf(tableName) as never,
          tableName
        })
      },

      childCrud: (
        tableName: string,
        parent: { foreignKey: string; table: string },
        fields: CrudFieldBuilders | ZodLike,
        options?: CrudOptions
      ) => {
        const resolvedFields = resolveCrudFields(fields, tableName, resolvedDefaults)
        return s.childCrud({
          expectedUpdatedAtField: expectedUpdatedAtField as never,
          fields: resolvedFields as CrudFieldBuilders,
          foreignKeyField: fkField as never,
          foreignKeyName: parent.foreignKey,
          idField: idField as never,
          options: options as never,
          parentPk: pkById as never,
          parentTable: tblOf(parent.table) as never,
          pk: pkById as never,
          table: tblOf(tableName) as never,
          tableName
        })
      },

      crud: (tableName: string, fields: CrudFieldBuilders | ZodLike, options?: CrudOptions) => {
        const resolvedFields = resolveCrudFields(fields, tableName, resolvedDefaults)
        return s.crud({
          expectedUpdatedAtField: expectedUpdatedAtField as never,
          fields: resolvedFields as CrudFieldBuilders,
          idField: idField as never,
          options: options as never,
          pk: pkById as never,
          table: tblOf(tableName) as never,
          tableName
        })
      },

      exports: s.exports,

      fileUpload: (
        namespace: string,
        tableName: string = namespace,
        fields?: FileUploadFields,
        options?: { allowedTypes?: Set<string>; maxFileSize?: number }
      ) => {
        const resolvedFields =
            fields ??
            ({
              contentType: stdbT.string(),
              filename: stdbT.string(),
              size: stdbT.number(),
              storageKey: stdbT.string()
            } as FileUploadFields),
          result = makeFileUpload(spacetimedb as Parameters<typeof makeFileUpload>[0], {
            ...options,
            fields: resolvedFields,
            idField: idField as never,
            namespace,
            pk: pkById as never,
            table: tblOf(tableName) as never
          })
        registerExports(s.exports, result.exports)
        return result
      },

      m: (
        name: string,
        params: CrudFieldBuilders,
        handler: (ctx: { db: unknown; sender: Identity; timestamp: Timestamp }, args: unknown) => void
      ) => {
        const reducer = spacetimedb.reducer({ name }, params as never, (ctxRaw: unknown, args: unknown) => {
          const ctx = ctxRaw as {
            db: unknown
            sender?: Identity
            timestamp: Timestamp
          }
          if (!ctx.sender) throw new Error(`NOT_AUTHENTICATED: ${name}`)
          handler({ db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }, args)
        }) as ReducerExport<never, never>
        registerExports(s.exports, { [name]: reducer })
        return reducer
      },

      org: (
        orgFields: OrgFieldBuilders | ZodLike,
        orgOpts?: {
          cascadeTables?: string[]
          t?: OrgTypeBuilders
        }
      ) => {
        const orgTypes = orgOpts?.t ?? stdbT,
          resolvedOrgFields = resolveCrudFields(orgFields, 'org', resolvedDefaults) as OrgFieldBuilders,
          cascadeConfigs: {
            deleteById: (db: unknown, id: unknown) => boolean
            rowsByOrg: (db: unknown, orgId: unknown) => Iterable<{ id: unknown }>
          }[] = []

        if (orgOpts?.cascadeTables)
          for (const tableName of orgOpts.cascadeTables)
            cascadeConfigs.push({
              deleteById: (db: unknown, id: unknown) =>
                (
                  dbTable(db, tableName) as {
                    id: { delete: (id: unknown) => boolean }
                  }
                ).id.delete(id),
              rowsByOrg: (db: unknown, orgId: unknown) =>
                (
                  dbTable(db, tableName) as {
                    orgId: {
                      filter: (orgId: unknown) => Iterable<{ id: unknown }>
                    }
                  }
                ).orgId.filter(orgId)
            })

        return s.org({
          builders: {
            email: orgTypes.string(),
            inviteId: idField,
            isAdmin: orgTypes.bool(),
            memberId: idField,
            message: orgTypes.string(),
            newOwnerId: orgTypes.identity(),
            orgId: oIdField,
            requestId: idField,
            token: orgTypes.string()
          },
          cascadeTables: cascadeConfigs.length > 0 ? cascadeConfigs : undefined,
          fields: resolvedOrgFields,
          ...makeOrgTables({
            org: tblOf('org'),
            orgInvite: tblOf('orgInvite'),
            orgJoinRequest: tblOf('orgJoinRequest'),
            orgMember: tblOf('orgMember')
          } as never)
        } as never)
      },

      orgCrud: (
        tableName: string,
        fields: OrgCrudFieldBuilders | ZodLike,
        options?: OrgCrudOptions & {
          orgMemberTable?: TableAccessor
        }
      ) => {
        const resolvedFields = resolveCrudFields(fields, tableName, resolvedDefaults)
        return s.orgCrud({
          expectedUpdatedAtField: expectedUpdatedAtField as never,
          fields: resolvedFields as OrgCrudFieldBuilders,
          idField: idField as never,
          options: options as never,
          orgIdField: oIdField as never,
          orgMemberTable: (options?.orgMemberTable ?? tblOf('orgMember')) as never,
          pk: pkById as never,
          table: tblOf(tableName) as never,
          tableName
        })
      },

      register: (exports: Record<string, ReducerExport<never, never>>) => {
        registerExports(s.exports, exports)
      },

      registerAll: (
        schemas: RegisterAllSchemas,
        tableOptions?: Record<string, CacheOptions & CrudOptions & OrgCrudOptions & { key?: string }>
      ) => {
        const ctx: RegCtx = {
          defaults: resolvedDefaults,
          expectedUpdatedAtField,
          fkField,
          idField,
          opts: tableOptions,
          orgIdField: oIdField,
          s
        }
        if (schemas.owned) regOwned(schemas.owned, ctx)
        if (schemas.orgScoped) regOrgScoped(schemas.orgScoped, ctx)
        if (schemas.singleton) regSingleton(schemas.singleton, ctx)
        if (schemas.base) regBase(schemas.base, ctx)
        if (schemas.children) regChildren(schemas.children, ctx)
        if (schemas.file) regFile(schemas.file, { ...ctx, spacetimedb, stdbT })
      },

      singletonCrud: (tableName: string, fields: SingletonFieldBuilders | ZodLike, options?: SingletonOptions) => {
        const resolvedFields = resolveCrudFields(fields, tableName, resolvedDefaults)
        return s.singletonCrud({
          fields: resolvedFields as SingletonFieldBuilders,
          options: options as never,
          table: tblOf(tableName) as never,
          tableName
        })
      }
    }
  }

type BaseBranded = BaseSchema<ZodRawShape>
interface BsCtx {
  baseZ: Record<string, ZodLike>
  cascades: string[]
  childZ: Record<string, { foreignKey: string; parent: string; schema: ZodLike }>
  orgScopedZ: Record<string, ZodLike>
  ownedZ: Record<string, ZodLike>
  singletonZ: Record<string, ZodLike>
  tblOpts: Record<string, CacheOptions & CrudOptions & OrgCrudOptions & { key?: string }>
}
interface BsTable {
  __bs: BsTag
  table: unknown
}
interface BsTag {
  cascade?: boolean
  category: 'base' | 'children' | 'file' | 'org' | 'orgScoped' | 'owned' | 'singleton'
  childFk?: string
  childParent?: string
  keyName?: string
  pub?: boolean | string
  rateLimit?: { max: number; window: number }
  softDelete?: boolean
  ttl?: number
  zod?: ZodLike
}
interface ChildLike {
  foreignKey: string
  parent: string
  schema: unknown
}

type OrgDefBranded = OrgDefSchema<ZodRawShape>

type OrgScopedBranded = OrgSchema<ZodRawShape>

interface OrgScopedOpts<F = unknown> extends OwnedOpts<F> {
  cascade?: boolean
  compoundIndex?: ('orgId' | ZodKeys<F>)[]
  indexes?: {
    accessor: string
    algorithm: 'btree' | 'hash'
    columns: string[]
  }[]
}

interface OrgTableOpts<F = unknown> {
  extra?: Record<string, FieldBuilder>
  index?: ZodKeys<F>[]
  unique?: ZodKeys<F>[]
}

type OwnedBranded = OwnedSchema<ZodRawShape>

interface OwnedOpts<F = unknown> {
  extra?: Record<string, FieldBuilder>
  index?: ZodKeys<F>[]
  pub?: boolean | ZodKeys<F>
  rateLimit?: RateLimitInput
  softDelete?: boolean
  unique?: ZodKeys<F>[]
}

type RuntimeSchemaBrand = 'base' | 'org' | 'orgDef' | 'owned' | 'singleton'

type SchemaHelpers = ReturnType<typeof makeSchema>

type SingletonBranded = SingletonSchema<ZodRawShape>

type TableArgInput = BaseBranded | ChildLike | OrgDefBranded | OrgScopedBranded | OwnedBranded | SingletonBranded

type TableArgs<F> = F extends ChildLike
  ? [childDef: F]
  : F extends BaseBranded
    ? [fields: F, opts: { key: string; ttl?: number }]
    : F extends SingletonBranded
      ? [fields: F]
      : F extends TableArgInput
        ? [fields: F, opts?: TableOpts<F>]
        : never

interface TableFn {
  <F extends TableArgInput>(...args: TableArgs<F>): BsTable
  file: () => BsTable
}

type TableOpts<F> = F extends OwnedBranded
  ? OwnedOpts<F>
  : F extends OrgScopedBranded
    ? OrgScopedOpts<F>
    : F extends OrgDefBranded
      ? OrgTableOpts<F>
      : F extends BaseBranded
        ? { key: string; ttl?: number }
        : F extends SingletonBranded
          ? undefined
          : never

type TblChild = Parameters<SchemaHelpers['childTable']>[1]

type TblInput = Parameters<SchemaHelpers['ownedTable']>[0]

type TblKey = Parameters<SchemaHelpers['cacheTable']>[0]

type ZodKeys<F> = F extends { shape: infer S extends Record<string, unknown> } ? keyof S & string : string

const compoundIndexToEntry = (columns: string[]): { accessor: string; algorithm: 'btree'; columns: string[] } => ({
    accessor: columns.map((c, i) => (i === 0 ? c : c.charAt(0).toUpperCase() + c.slice(1))).join(''),
    algorithm: 'btree',
    columns
  }),
  fkSuffix = /Id$/u,
  isChildObj = (v: unknown): v is ChildLike =>
    typeof v === 'object' && v !== null && 'foreignKey' in v && 'parent' in v && 'schema' in v,
  readSchemaBrand = (v: unknown): RuntimeSchemaBrand | undefined => {
    if (!(typeof v === 'object' && v !== null && '__bs' in v)) return
    const rawBrand = (v as { __bs?: unknown }).__bs
    if (
      rawBrand === 'owned' ||
      rawBrand === 'org' ||
      rawBrand === 'orgDef' ||
      rawBrand === 'base' ||
      rawBrand === 'singleton'
    )
      return rawBrand
  },
  bsOf = (meta: BsTag, table: unknown): BsTable => ({ __bs: meta, table }),
  bsZod = (fields: unknown): undefined | ZodLike => (isZodObject(fields) ? fields : undefined),
  oKeys = (obj: object): string[] => Object.keys(obj),
  withPubIndex = (index: string[] | undefined, pub: boolean | string | undefined): string[] | undefined => {
    if (typeof pub !== 'string') return index
    if (!index) return [pub]
    for (const i of index) if (i === pub) return index

    return [...index, pub]
  },
  applyMod = (field: FieldBuilder, mod: 'index' | 'unique'): FieldBuilder => {
    const record = field as unknown as Record<string, unknown>
    if (typeof record[mod] === 'function') return (record[mod] as () => FieldBuilder)()
    return field
  },
  applyModFields = (
    resolved: Record<string, FieldBuilder>,
    names: string[],
    mod: 'index' | 'unique',
    out: Record<string, FieldBuilder>
  ): boolean => {
    let changed = false
    for (const name of names) {
      const field = resolved[name]
      if (field) {
        out[name] = applyMod(field, mod)
        changed = true
      }
    }
    return changed
  },
  mergeModifierExtra = (
    fields: unknown,
    bridgeT: ZodBridgeT,
    mods: {
      extra?: Record<string, FieldBuilder>
      index?: string[]
      unique?: string[]
    }
  ): Record<string, FieldBuilder> | undefined => {
    const { extra, index: indexFields, unique: uniqueFields } = mods,
      result: Record<string, FieldBuilder> = {},
      hasIndex = indexFields ? indexFields.length > 0 : false,
      hasUnique = uniqueFields ? uniqueFields.length > 0 : false,
      hasModifiers = hasIndex ? true : hasUnique,
      zod = hasModifiers ? bsZod(fields) : undefined
    let hasFields = false
    if (zod?.shape) {
      const resolved = zodToStdbFields(zod.shape, bridgeT, '')
      if (indexFields && applyModFields(resolved, indexFields, 'index', result)) hasFields = true
      if (uniqueFields && applyModFields(resolved, uniqueFields, 'unique', result)) hasFields = true
    }
    if (extra) {
      const names = oKeys(extra)
      for (const name of names) {
        const val = extra[name]
        if (val) {
          result[name] = val
          hasFields = true
        }
      }
    }
    return hasFields ? result : undefined
  },
  collectBsOpts = (name: string, m: BsTag, ctx: BsCtx) => {
    const o: Record<string, unknown> = {}
    if (m.rateLimit) o.rateLimit = m.rateLimit
    if (m.softDelete) o.softDelete = m.softDelete
    if (m.ttl !== undefined) o.ttl = m.ttl
    if (m.keyName) o.key = m.keyName
    if (oKeys(o).length > 0) ctx.tblOpts[name] = o as never
  },
  collectBsSchema = (name: string, m: BsTag, ctx: BsCtx): { fileNs?: boolean | string; orgZod?: ZodLike } => {
    if (m.category === 'owned' && m.zod) ctx.ownedZ[name] = m.zod
    if (m.category === 'orgScoped') {
      if (m.zod) ctx.orgScopedZ[name] = m.zod
      if (m.cascade) ctx.cascades.push(name)
    }
    if (m.category === 'singleton' && m.zod) ctx.singletonZ[name] = m.zod
    if (m.category === 'base' && m.zod) ctx.baseZ[name] = m.zod
    if (m.category === 'children' && m.zod && m.childFk && m.childParent)
      ctx.childZ[name] = {
        foreignKey: m.childFk,
        parent: m.childParent,
        schema: m.zod
      }
    if (m.category === 'file') return { fileNs: name === 'file' ? true : name }
    if (m.category === 'org') return { orgZod: m.zod }
    return {}
  },
  buildBsSchemas = (ctx: BsCtx): RegisterAllSchemas => {
    const schemas: RegisterAllSchemas = {}
    if (oKeys(ctx.ownedZ).length > 0) schemas.owned = ctx.ownedZ
    if (oKeys(ctx.orgScopedZ).length > 0) schemas.orgScoped = ctx.orgScopedZ
    if (oKeys(ctx.singletonZ).length > 0) schemas.singleton = ctx.singletonZ
    if (oKeys(ctx.baseZ).length > 0) schemas.base = ctx.baseZ
    if (oKeys(ctx.childZ).length > 0) schemas.children = ctx.childZ
    return schemas
  },
  makeBsHelpers = (raw: SchemaHelpers) => {
    const cacheTable = (keyFieldOrName: string | TblKey, fields: TblInput, options?: { ttl?: number }): BsTable => {
        const keyName = typeof keyFieldOrName === 'string' ? keyFieldOrName : keyFieldOrName.name
        return bsOf(
          { category: 'base', keyName, ttl: options?.ttl, zod: bsZod(fields) },
          raw.cacheTable(keyFieldOrName, fields)
        )
      },
      childTable = (fkOrChild: ChildLike | string, schema?: TblChild): BsTable => {
        if (isChildObj(fkOrChild))
          return bsOf(
            {
              category: 'children',
              childFk: fkOrChild.foreignKey,
              childParent: fkOrChild.parent,
              zod: bsZod(fkOrChild.schema)
            },
            raw.childTable(fkOrChild.foreignKey, fkOrChild.schema as never)
          )
        return bsOf(
          {
            category: 'children',
            childFk: fkOrChild,
            childParent: fkOrChild.replace(fkSuffix, ''),
            zod: bsZod(schema)
          },
          raw.childTable(fkOrChild, schema as never)
        )
      },
      fileTable = (): BsTable => bsOf({ category: 'file' }, raw.fileTable()),
      orgScopedTable = <F extends TblInput>(fields: F, options?: OrgScopedOpts<F>): BsTable => {
        const {
            cascade = true,
            compoundIndex,
            extra,
            index,
            indexes,
            pub,
            rateLimit: rlInput,
            softDelete,
            unique
          } = options ?? {},
          rateLimit = rlInput ? normalizeRateLimit(rlInput) : undefined,
          sdExtra = softDelete ? { ...extra, deletedAt: raw.t.timestamp().optional() } : extra,
          mergedExtra = mergeModifierExtra(fields, raw.t, {
            extra: sdExtra,
            index: withPubIndex(index, pub),
            unique
          }),
          resolvedIndexes = compoundIndex ? [compoundIndexToEntry(compoundIndex), ...(indexes ?? [])] : indexes,
          stdbOpts = resolvedIndexes ? { indexes: resolvedIndexes } : undefined
        return bsOf(
          {
            cascade,
            category: 'orgScoped',
            pub,
            rateLimit,
            softDelete,
            zod: bsZod(fields)
          },
          raw.orgScopedTable(fields, mergedExtra, stdbOpts)
        )
      },
      orgTable = <F extends TblInput>(fields: F, options?: OrgTableOpts<F>): BsTable => {
        const { extra, index, unique } = options ?? {},
          mergedExtra = mergeModifierExtra(fields, raw.t, {
            extra,
            index,
            unique
          })
        return bsOf({ category: 'org', zod: bsZod(fields) }, raw.ownedTable(fields, mergedExtra))
      },
      ownedTable = <F extends TblInput>(fields: F, options?: OwnedOpts<F>): BsTable => {
        const { extra, index, pub, rateLimit: rlInput, softDelete, unique } = options ?? {},
          rateLimit = rlInput ? normalizeRateLimit(rlInput) : undefined,
          sdExtra = softDelete ? { ...extra, deletedAt: raw.t.timestamp().optional() } : extra,
          mergedExtra = mergeModifierExtra(fields, raw.t, {
            extra: sdExtra,
            index: withPubIndex(index, pub),
            unique
          })
        return bsOf(
          { category: 'owned', pub, rateLimit, softDelete, zod: bsZod(fields) },
          raw.ownedTable(fields, mergedExtra)
        )
      },
      singletonTable = (fields: TblInput): BsTable =>
        bsOf({ category: 'singleton', zod: bsZod(fields) }, raw.singletonTable(fields)),
      tableBase = <F extends TableArgInput>(...args: TableArgs<F>): BsTable => {
        const [fields, optionsRaw] = args,
          options = optionsRaw as TableOpts<F> | undefined
        if (isChildObj(fields)) return childTable(fields)

        const brand = readSchemaBrand(fields)
        if (brand === 'owned') return ownedTable(fields as OwnedBranded, options as OwnedOpts<OwnedBranded>)
        if (brand === 'org') return orgScopedTable(fields as OrgScopedBranded, options as OrgScopedOpts<OrgScopedBranded>)
        if (brand === 'orgDef') return orgTable(fields as OrgDefBranded, options as OrgTableOpts<OrgDefBranded>)
        if (brand === 'singleton') return singletonTable(fields as SingletonBranded)
        if (brand === 'base') {
          if (!(options && typeof options === 'object' && 'key' in options && typeof options.key === 'string'))
            return err('VALIDATION_FAILED', {
              message: 'Base schema tables require options.key when using table()'
            })
          const baseOptions = options as { key: string; ttl?: number }
          return cacheTable(baseOptions.key, fields as BaseBranded, {
            ttl: baseOptions.ttl
          })
        }
        return err('VALIDATION_FAILED', {
          message: 'Unknown schema brand. Use makeOwned/makeOrgScoped/makeOrg/makeBase/makeSingleton before table()'
        })
      },
      table = Object.assign(tableBase, { file: () => fileTable() }) as TableFn

    return {
      cacheTable,
      childTable,
      fileTable,
      orgScopedTable,
      orgTable,
      ownedTable,
      singletonTable,
      t: raw.t,
      table
    }
  },
  noboilStdb = (
    define: (helpers: {
      cacheTable: (keyFieldOrName: string | TblKey, fields: TblInput, options?: { ttl?: number }) => BsTable
      childTable: (fkOrChild: ChildLike | string, schema?: TblChild) => BsTable
      fileTable: () => BsTable
      orgScopedTable: <F extends TblInput>(fields: F, options?: OrgScopedOpts<F>) => BsTable
      orgTable: <F extends TblInput>(fields: F, options?: OrgTableOpts<F>) => BsTable
      ownedTable: <F extends TblInput>(fields: F, options?: OwnedOpts<F>) => BsTable
      singletonTable: (fields: TblInput) => BsTable
      t: SchemaHelpers['t']
      table: TableFn
    }) => Record<string, BsTable>
  ) => {
    const raw = makeSchema(),
      result = define(makeBsHelpers(raw) as never),
      rawTables: Record<string, unknown> = {},
      ctx: BsCtx = {
        baseZ: {},
        cascades: [],
        childZ: {},
        orgScopedZ: {},
        ownedZ: {},
        singletonZ: {},
        tblOpts: {}
      }
    let orgZod: undefined | ZodLike,
      fileNs: boolean | string = false

    const names = oKeys(result)
    for (const name of names) {
      const entry = result[name]
      if (entry) {
        rawTables[name] = entry.table
        collectBsOpts(name, entry.__bs, ctx)
        const { fileNs: fn, orgZod: oz } = collectBsSchema(name, entry.__bs, ctx)
        if (oz) {
          orgZod = oz
          rawTables.orgInvite = raw.orgInviteTable()
          rawTables.orgJoinRequest = raw.orgJoinRequestTable()
          rawTables.orgMember = raw.orgMemberTable()
        }
        if (fn !== undefined) fileNs = fn
      }
    }

    const spacetimedb = raw.schema(rawTables as never),
      s = setupCrud(spacetimedb as SpacetimeDbLike),
      schemas = buildBsSchemas(ctx)
    if (fileNs) schemas.file = fileNs
    if (oKeys(schemas).length > 0) s.registerAll(schemas, oKeys(ctx.tblOpts).length > 0 ? ctx.tblOpts : undefined)
    if (orgZod) s.org(orgZod, ctx.cascades.length > 0 ? { cascadeTables: ctx.cascades } : undefined)

    const rlsExports: Record<string, unknown> = {}
    let rlsI = 0
    const addRls = (sql: string) => {
      rlsExports[`__rls_${rlsI}`] = (
        spacetimedb as unknown as {
          clientVisibilityFilter: { sql: (f: string) => unknown }
        }
      ).clientVisibilityFilter.sql(sql)
      rlsI += 1
    }
    for (const name of names) {
      const entry = result[name]
      if (entry) {
        let sqls: string[]
        if (entry.__bs.category === 'children' && entry.__bs.childFk && entry.__bs.childParent) {
          const parentEntry = result[entry.__bs.childParent]
          sqls = rlsChildSql({
            fk: entry.__bs.childFk,
            name,
            parent: entry.__bs.childParent,
            parentPub: parentEntry?.__bs.pub
          })
        } else sqls = rlsSql(name, entry.__bs.category, entry.__bs.pub)

        for (const sql of sqls) addRls(sql)
      }
    }
    if (orgZod) addRls(rlsWhereSender(RLS_TBL.orgMember, RLS_COL.userId))

    const group = spacetimedb.exportGroup({
        ...s.allExports(),
        ...rlsExports
      } as never),
      g = group as unknown as Record<symbol, unknown>,
      syms = Object.getOwnPropertySymbols(group),
      regSym = syms.find(sym => typeof g[sym] === 'function'),
      ctxSym = syms.find(sym => sym !== regSym)
    if (regSym && ctxSym) (g[regSym] as (schemaCtx: unknown, n: string) => void)(g[ctxSym], '__bs')
    return spacetimedb as never
  }

export type { CrudDefaults, OrgTypeBuilders }
export { noboilStdb, setup, setupCrud }

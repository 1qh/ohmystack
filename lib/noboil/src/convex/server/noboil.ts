import type { GenericDataModel } from 'convex/server'
import type { ZodObject, ZodRawShape } from 'zod/v4'
import type { OrgCrudOptions } from './org-crud'
import type {
  CacheCrudResult,
  ChildCrudResult,
  CrudOptions,
  CrudResult,
  DetectBrand,
  KvFactoryResult,
  LogFactoryResult,
  OrgCrudResult,
  QuotaFactoryResult,
  SetupConfig,
  SingletonCrudResult,
  SingletonOptions
} from './types'
import { setup } from './setup'
type AnyShape = ZodRawShape
type Brand = 'base' | 'kv' | 'log' | 'org' | 'orgDef' | 'owned' | 'quota' | 'singleton'
const readBrand = (schema: unknown): Brand | undefined => {
  const v = (schema as undefined | { __bs?: unknown })?.__bs
  return typeof v === 'string' ? (v as Brand) : undefined
}
const DEFERRED = Symbol('noboil.deferred')
interface Deferred {
  brand: 'child' | Brand
  [DEFERRED]: true
  opts: unknown
  schema: unknown
}
const isDeferred = (v: unknown): v is Deferred =>
  typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[DEFERRED] === true
const isChildConfig = (v: unknown): v is { foreignKey: string; index: string; parent: string; schema: ZodObject } =>
  typeof v === 'object' && v !== null && 'foreignKey' in v && 'parent' in v && 'schema' in v
interface CacheTableOpts {
  fetcher?: (c: unknown, key: unknown) => Promise<unknown>
  hooks?: { onFetch?: (data: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown> }
  key: string
  rateLimit?: number | { max: number; window: number }
  staleWhileRevalidate?: boolean
  ttl?: number
}
interface ChildConfigOf<S extends AnyShape> {
  foreignKey: string
  index: string
  parent: string
  parentSchema?: ZodObject
  schema: ZodObject<S>
}
type InferShape<T> = T extends ZodObject<infer S> ? S : ZodRawShape
interface KvEntryConfig {
  keys?: readonly string[]
  schema: ZodObject
  writeRole?: ((ctx: unknown) => boolean | Promise<boolean>) | boolean
}
interface LogEntryConfig {
  parent: string
  schema: ZodObject
}
interface QuotaEntryConfig {
  durationMs: number
  limit: number
}
type SetupResult<DM extends GenericDataModel> = ReturnType<typeof setup<DM>>
type TableFn = <T extends ChildConfigOf<ZodRawShape> | KvEntryConfig | LogEntryConfig | QuotaEntryConfig | ZodObject>(
  schema: T,
  opts?: TableOpts<T>
) => TableResult<T>
type TableOpts<T> =
  DetectBrand<T> extends 'owned'
    ? CrudOptions<InferShape<T>>
    : DetectBrand<T> extends 'org'
      ? OrgCrudOptions<InferShape<T>>
      : DetectBrand<T> extends 'singleton'
        ? SingletonOptions
        : DetectBrand<T> extends 'base'
          ? CacheTableOpts
          : T extends ChildConfigOf<ZodRawShape>
            ? { pub?: { parentField: string } }
            : Record<string, unknown>
type TableResult<T> =
  DetectBrand<T> extends 'owned'
    ? CrudResult<InferShape<T>>
    : DetectBrand<T> extends 'org'
      ? OrgCrudResult<InferShape<T>>
      : DetectBrand<T> extends 'singleton'
        ? SingletonCrudResult<InferShape<T>>
        : DetectBrand<T> extends 'base'
          ? CacheCrudResult<InferShape<T>>
          : DetectBrand<T> extends 'log'
            ? T extends LogEntryConfig
              ? LogFactoryResult<InferShape<T['schema']>>
              : never
            : DetectBrand<T> extends 'kv'
              ? T extends KvEntryConfig
                ? KvFactoryResult<InferShape<T['schema']>>
                : never
              : DetectBrand<T> extends 'quota'
                ? QuotaFactoryResult
                : T extends ChildConfigOf<infer CS>
                  ? ChildCrudResult<CS>
                  : CrudResult<InferShape<T>>
const dispatchTable = (s: SetupResult<GenericDataModel>, name: string, def: Deferred): unknown => {
  if (def.brand === 'child') return s.childCrud(name, def.schema as never, def.opts as never)
  if (def.brand === 'owned') return s.crud(name, def.schema as never, def.opts as never)
  if (def.brand === 'org') return s.orgCrud(name, def.schema as never, def.opts as never)
  if (def.brand === 'singleton') return s.singletonCrud(name, def.schema as never, def.opts as never)
  if (def.brand === 'base') {
    const opts = (def.opts ?? {}) as Record<string, unknown>
    return s.cacheCrud({ ...opts, schema: def.schema, table: name } as never)
  }
  if (def.brand === 'log') {
    const entry = def.schema as { parent: string; schema: ZodObject }
    const opts = (def.opts ?? {}) as {
      hooks?: unknown
      rateLimit?: unknown
      search?: unknown
      softDelete?: unknown
    }
    return s.log(name, entry.schema, {
      hooks: opts.hooks as never,
      rateLimit: opts.rateLimit as never,
      search: opts.search as never,
      softDelete: opts.softDelete as never
    })
  }
  if (def.brand === 'kv') {
    const entry = def.schema as { keys?: readonly string[]; schema: ZodObject; writeRole?: unknown }
    const opts = (def.opts ?? {}) as { hooks?: unknown; rateLimit?: unknown }
    return s.kv(name, {
      hooks: opts.hooks as never,
      keys: entry.keys,
      rateLimit: opts.rateLimit as never,
      schema: entry.schema,
      writeRole: entry.writeRole as never
    })
  }
  if (def.brand === 'quota') {
    const entry = def.schema as { durationMs: number; limit: number }
    return s.quota(name, { durationMs: entry.durationMs, limit: entry.limit })
  }
  throw new Error(
    `noboil(): unknown brand '${def.brand}' on table '${name}'. Valid brands: base, kv, log, org, owned, quota, singleton, child`
  )
}
const buildDeferred = (schema: unknown, opts: unknown): Deferred => {
  if (isChildConfig(schema)) return { [DEFERRED]: true, brand: 'child', opts, schema }
  const brand = readBrand(schema)
  if (!brand)
    throw new Error(
      'noboil(): table() called with an unbranded schema. Use schema() from noboil/convex/schema with makeOwned/makeOrgScoped/makeBase/makeSingleton or a child() entry.'
    )
  return { [DEFERRED]: true, brand, opts, schema }
}
type TableMap = Record<string, unknown>
/**
 * High-level entry point: registers every table in one place. Mirrors noboil/spacetimedb's noboil().
 *
 * Pass your Convex builders + auth in the first argument, then a `define` callback that maps each
 * table name to a schema via the `table` helper. The helper detects each schema's brand
 * (`makeOwned`, `makeOrgScoped`, `makeBase`, `makeSingleton`, `child`) and dispatches to the
 * matching factory under the hood. The table name is taken from the object key — no need to
 * repeat it.
 *
 * The returned object is the api: spread its entries from your per-table convex/*.ts files.
 *
 * @example
 * import { noboil } from './'
 * import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
 * import { getAuthUserId } from '@convex-dev/auth/server'
 * import { s } from './s'
 *
 * export const api = noboil({
 *   query, mutation, action, internalQuery, internalMutation, getAuthUserId,
 *   orgSchema: s.team,
 *   tables: ({ table }) => ({
 *     blog: table(s.blog, { rateLimit: 10, search: 'content' }),
 *     wiki: table(s.wiki, { acl: true, softDelete: true }),
 *     profile: table(s.profile),
 *     movie: table(s.movie, { key: 'tmdbId', ttl: 86_400 })
 *   })
 * })
 *
 * // Then in convex/blog.ts:
 * import { api } from './lazy'
 * export const { create, update, rm, pub: { list, read, search } } = api.blog
 */
const noboil = <DM extends GenericDataModel, T extends TableMap>({
  tables,
  ...config
}: SetupConfig<DM> & {
  tables: (helpers: { setup: SetupResult<DM>; table: TableFn }) => T
}): T & { setup: SetupResult<DM> } => {
  const s = setup<DM>(config)
  const table = ((schema: unknown, opts?: unknown) => buildDeferred(schema, opts) as never) as TableFn
  const draft = tables({ setup: s, table })
  const result: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(draft))
    result[name] = isDeferred(value) ? dispatchTable(s as unknown as SetupResult<GenericDataModel>, name, value) : value
  return Object.assign(result, { setup: s }) as T & { setup: SetupResult<DM> }
}
export { noboil }

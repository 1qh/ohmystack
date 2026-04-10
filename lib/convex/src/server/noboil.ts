/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
import type { GenericDataModel } from 'convex/server'
import type { ZodObject, ZodRawShape } from 'zod/v4'
import type { OrgCrudOptions } from './org-crud'
import type {
  BaseSchema,
  CacheCrudResult,
  CacheHooks,
  ChildConfig,
  ChildCrudResult,
  CrudOptions,
  CrudResult,
  OrgCrudResult,
  OrgSchema,
  OwnedSchema,
  SetupConfig,
  SingletonCrudResult,
  SingletonOptions,
  SingletonSchema
} from './types'
import { setup } from './setup'
type AnyShape = ZodRawShape
type Brand = 'base' | 'org' | 'orgDef' | 'owned' | 'singleton'
const readBrand = (schema: unknown): Brand | undefined => {
  const v = (schema as undefined | { __bs?: unknown })?.__bs
  return typeof v === 'string' ? (v as Brand) : undefined
}
const DEFERRED = Symbol('noboil.deferred')
interface Deferred {
  [DEFERRED]: true
  brand: 'child' | Brand
  opts: unknown
  schema: unknown
}
const isDeferred = (v: unknown): v is Deferred =>
  typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[DEFERRED] === true
const isChildConfig = (v: unknown): v is { foreignKey: string; index: string; parent: string; schema: ZodObject } =>
  typeof v === 'object' && v !== null && 'foreignKey' in v && 'parent' in v && 'schema' in v
type CacheCallOpts<S extends ZodRawShape, K extends keyof S & string> = {
  fetcher?: (c: unknown, key: unknown) => Promise<unknown>
  hooks?: CacheHooks
  key: K
  rateLimit?: { max: number; window: number }
  staleWhileRevalidate?: boolean
  ttl?: number
}
interface TableFn {
  <S extends ZodRawShape>(schema: OwnedSchema<S>, opts?: CrudOptions<S>): CrudResult<S>
  <S extends ZodRawShape>(schema: OrgSchema<S>, opts?: OrgCrudOptions<S>): OrgCrudResult<S>
  <S extends ZodRawShape>(schema: SingletonSchema<S>, opts?: SingletonOptions): SingletonCrudResult<S>
  <S extends ZodRawShape, K extends keyof S & string>(
    schema: BaseSchema<S>,
    opts: CacheCallOpts<S, K>
  ): CacheCrudResult<S>
  (child: ChildConfig, opts?: { pub?: { parentField: string } }): ChildCrudResult<AnyShape>
}
type SetupResult<DM extends GenericDataModel> = ReturnType<typeof setup<DM>>
const dispatchTable = (s: SetupResult<GenericDataModel>, name: string, def: Deferred): unknown => {
  // The setup result is parameterized by DM. At dispatch time we erase DM via `as never` casts —
  // this is safe because the user-supplied schema brand was already verified by TableFn overloads.
  if (def.brand === 'child')
    return s.childCrud(name as never, def.schema as never, def.opts as never)
  if (def.brand === 'owned')
    return s.crud(name as never, def.schema as never, def.opts as never)
  if (def.brand === 'org')
    return s.orgCrud(name as never, def.schema as never, def.opts as never)
  if (def.brand === 'singleton')
    return s.singletonCrud(name as never, def.schema as never, def.opts as never)
  if (def.brand === 'base') {
    const opts = (def.opts ?? {}) as Record<string, unknown>
    return s.cacheCrud({ ...opts, schema: def.schema, table: name } as never)
  }
  throw new Error(`noboil(): unknown brand '${def.brand}' on table '${name}'`)
}
const buildDeferred = (schema: unknown, opts: unknown): Deferred => {
  if (isChildConfig(schema)) return { [DEFERRED]: true, brand: 'child', opts, schema }
  const brand = readBrand(schema)
  if (!brand)
    throw new Error(
      'noboil(): table() called with an unbranded schema. Use makeOwned/makeOrgScoped/makeBase/makeSingleton or a child() entry.'
    )
  return { [DEFERRED]: true, brand, opts, schema }
}
type AnyTableResult =
  | CacheCrudResult<AnyShape>
  | ChildCrudResult<AnyShape>
  | CrudResult<AnyShape>
  | OrgCrudResult<AnyShape>
  | SingletonCrudResult<AnyShape>
type TableMap = Record<string, AnyTableResult>
/**
 * High-level entry point: registers every table in one place. Mirrors @noboil/spacetimedb's noboil().
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
 * import { noboil } from '@noboil/convex/server'
 * import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
 * import { getAuthUserId } from '@convex-dev/auth/server'
 * import { s } from './t'
 *
 * export const api = noboil(
 *   { query, mutation, action, internalQuery, internalMutation, getAuthUserId, orgSchema: s.team },
 *   ({ table }) => ({
 *     blog: table(s.blog, { rateLimit: { max: 10, window: 60_000 }, search: 'content' }),
 *     wiki: table(s.wiki, { acl: true, softDelete: true }),
 *     profile: table(s.profile),
 *     movie: table(s.movie, { key: 'tmdbId', ttl: 86_400 })
 *   })
 * )
 *
 * // Then in convex/blog.ts:
 * import { api } from './lazy'
 * export const { create, update, rm, pub: { list, read, search } } = api.blog
 */
const noboil = <DM extends GenericDataModel, T extends TableMap>(
  config: SetupConfig<DM>,
  define: (helpers: { setup: SetupResult<DM>; table: TableFn }) => T
): T & { setup: SetupResult<DM> } => {
  const s = setup<DM>(config)
  const table = ((schema: unknown, opts?: unknown) => buildDeferred(schema, opts) as never) as TableFn
  const draft = define({ setup: s, table })
  const result: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(draft)) {
    if (isDeferred(value)) result[name] = dispatchTable(s as unknown as SetupResult<GenericDataModel>, name, value)
    else result[name] = value
  }
  return Object.assign(result, { setup: s }) as T & { setup: SetupResult<DM> }
}
export { noboil }

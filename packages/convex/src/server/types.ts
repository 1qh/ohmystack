import type { CustomBuilder } from 'convex-helpers/server/zod4'
import type {
  ActionBuilder,
  FunctionVisibility,
  GenericDataModel,
  MutationBuilder,
  PaginationOptions,
  paginationOptsValidator,
  QueryBuilder,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery
} from 'convex/server'
import type { GenericId } from 'convex/values'
import type { z as _, ZodNullable, ZodNumber, ZodObject, ZodOptional, ZodRawShape } from 'zod/v4'

interface BaseBuilders {
  m: Mb
  pq?: Qb
  q: Qb
}
interface CacheBuilders<DM extends GenericDataModel = GenericDataModel> {
  action: ActionBuilder<DM, 'public'>
  cm: Mb
  cq: Qb
  internalMutation: MutationBuilder<DM, 'internal'>
  internalQuery: QueryBuilder<DM, 'internal'>
  mutation: MutationBuilder<DM, 'public'>
  query: QueryBuilder<DM, 'public'>
}
interface CacheHookCtx {
  db: DbLike
}
interface CacheHooks {
  afterCreate?: (ctx: CacheHookCtx, args: { data: Rec; id: string }) => Promise<void> | void
  afterDelete?: (ctx: CacheHookCtx, args: { doc: Rec; id: string }) => Promise<void> | void
  afterUpdate?: (ctx: CacheHookCtx, args: { id: string; patch: Rec; prev: Rec }) => Promise<void> | void
  beforeCreate?: (ctx: CacheHookCtx, args: { data: Rec }) => Promise<Rec> | Rec
  beforeDelete?: (ctx: CacheHookCtx, args: { doc: Rec; id: string }) => Promise<void> | void
  beforeUpdate?: (ctx: CacheHookCtx, args: { id: string; patch: Rec; prev: Rec }) => Promise<Rec> | Rec
  onFetch?: (data: Rec) => Promise<Rec> | Rec
}
interface CacheOptions<S extends ZodRawShape, K extends keyof _.output<ZodObject<S>> & string> {
  fetcher?: (c: ActionCtxLike, key: _.output<ZodObject<S>>[K]) => Promise<_.output<ZodObject<S>>>
  hooks?: CacheHooks
  key: K
  schema: ZodObject<S>
  staleWhileRevalidate?: boolean
  table: string
  ttl?: number
}
interface CascadeOption {
  foreignKey: string
  table: string
}
interface ChildConfig {
  foreignKey: string
  index?: string
  parent: string
  parentSchema?: ZodObject<ZodRawShape>
  schema: ZodObject<ZodRawShape>
}
interface ComparisonOp<V> {
  $between?: [V, V]
  $gt?: V
  $gte?: V
  $lt?: V
  $lte?: V
}
interface CrudBuilders extends BaseBuilders {
  cm: Mb
  cq: Qb
  pq: Qb
}
interface CrudHooks {
  afterCreate?: (ctx: HookCtx, args: { data: Rec; id: string }) => Promise<void> | void
  afterDelete?: (ctx: HookCtx, args: { doc: Rec; id: string }) => Promise<void> | void
  afterUpdate?: (ctx: HookCtx, args: { id: string; patch: Rec; prev: Rec }) => Promise<void> | void
  beforeCreate?: (ctx: HookCtx, args: { data: Rec }) => Promise<Rec> | Rec
  beforeDelete?: (ctx: HookCtx, args: { doc: Rec; id: string }) => Promise<void> | void
  beforeUpdate?: (ctx: HookCtx, args: { id: string; patch: Rec; prev: Rec }) => Promise<Rec> | Rec
}
interface CrudOptions<S extends ZodRawShape> {
  auth?: { where?: WhereOf<S> }
  cascade?: CascadeOption[] | false
  hooks?: CrudHooks
  pub?: { where?: WhereOf<S> }
  rateLimit?: RateLimitConfig
  search?: (keyof S & string) | true | { field?: keyof S & string; index?: string }
  softDelete?: boolean
}
interface DbCtx {
  db: DbLike
}
interface GlobalHookCtx {
  db: DbLike
  storage?: StorageLike
  table: string
  userId?: string
}
interface GlobalHooks {
  afterCreate?: (ctx: GlobalHookCtx, args: { data: Rec; id: string }) => Promise<void> | void
  afterDelete?: (ctx: GlobalHookCtx, args: { doc: Rec; id: string }) => Promise<void> | void
  afterUpdate?: (ctx: GlobalHookCtx, args: { id: string; patch: Rec; prev: Rec }) => Promise<void> | void
  beforeCreate?: (ctx: GlobalHookCtx, args: { data: Rec }) => Promise<Rec> | Rec
  beforeDelete?: (ctx: GlobalHookCtx, args: { doc: Rec; id: string }) => Promise<void> | void
  beforeUpdate?: (ctx: GlobalHookCtx, args: { id: string; patch: Rec; prev: Rec }) => Promise<Rec> | Rec
}
interface HookCtx {
  db: DbLike
  storage: StorageLike
  userId: string
}
interface Middleware {
  afterCreate?: (ctx: MiddlewareCtx, args: { data: Rec; id: string }) => Promise<void> | void
  afterDelete?: (ctx: MiddlewareCtx, args: { doc: Rec; id: string }) => Promise<void> | void
  afterUpdate?: (ctx: MiddlewareCtx, args: { id: string; patch: Rec; prev: Rec }) => Promise<void> | void
  beforeCreate?: (ctx: MiddlewareCtx, args: { data: Rec }) => Promise<Rec> | Rec
  beforeDelete?: (ctx: MiddlewareCtx, args: { doc: Rec; id: string }) => Promise<void> | void
  beforeUpdate?: (ctx: MiddlewareCtx, args: { id: string; patch: Rec; prev: Rec }) => Promise<Rec> | Rec
  name: string
}
interface MiddlewareCtx extends GlobalHookCtx {
  operation: 'create' | 'delete' | 'update'
}
interface MutCtx extends UserCtx {
  storage: StorageLike
}
interface RateLimitConfig {
  max: number
  window: number
}
type Rec = Record<string, unknown>
interface UserCtx extends DbCtx {
  user: Rec
}
const ERROR_MESSAGES = {
  ALREADY_ORG_MEMBER: 'Already a member of this organization',
  CANNOT_MODIFY_ADMIN: 'Admins cannot modify other admins',
  CANNOT_MODIFY_OWNER: 'Cannot modify the owner',
  CHUNK_ALREADY_UPLOADED: 'Chunk already uploaded',
  CHUNK_NOT_FOUND: 'Chunk not found',
  CONFLICT: 'Conflict detected',
  EDITOR_REQUIRED: 'Editor permission required',
  FILE_NOT_FOUND: 'File not found',
  FILE_TOO_LARGE: 'File too large',
  FORBIDDEN: 'Forbidden',
  INCOMPLETE_UPLOAD: 'Incomplete upload',
  INSUFFICIENT_ORG_ROLE: 'Insufficient permissions',
  INVALID_FILE_TYPE: 'Invalid file type',
  INVALID_INVITE: 'Invalid invite',
  INVALID_MESSAGE: 'Invalid message',
  INVALID_SESSION_STATE: 'Invalid session state',
  INVALID_TOOL_ARGS: 'Invalid tool arguments',
  INVALID_WHERE: 'Invalid filters',
  INVITE_EXPIRED: 'Invite has expired',
  JOIN_REQUEST_EXISTS: 'Join request already exists',
  LIMIT_EXCEEDED: 'Limit exceeded',
  MESSAGE_NOT_SAVED: 'Message not saved',
  MUST_TRANSFER_OWNERSHIP: 'Must transfer ownership before leaving',
  NO_FETCHER: 'No fetcher configured',
  NO_PRECEDING_USER_MESSAGE: 'No preceding user message',
  NOT_AUTHENTICATED: 'Please log in',
  NOT_AUTHORIZED: 'Not authorized',
  NOT_FOUND: 'Not found',
  NOT_ORG_MEMBER: 'Not a member of this organization',
  ORG_SLUG_TAKEN: 'Organization slug already taken',
  RATE_LIMITED: 'Too many requests',
  SESSION_NOT_FOUND: 'Session not found',
  TARGET_MUST_BE_ADMIN: 'Can only transfer ownership to an admin',
  UNAUTHORIZED: 'Unauthorized',
  USER_NOT_FOUND: 'User not found',
  VALIDATION_FAILED: 'Validation failed'
} as const
type Ab<V extends FunctionVisibility = 'public'> = CustomBuilder<
  'action',
  Record<string, never>,
  Rec,
  Record<string, never>,
  unknown,
  V,
  Rec
>
interface ActionCtxLike {
  runMutation: (ref: string, args: Rec) => Promise<unknown>
  runQuery: (ref: string, args: Rec) => Promise<unknown>
}
interface AuthorInfo {
  [key: string]: unknown
  email?: string
  image?: string
  name?: string
}
interface CacheCrudResult<S extends ZodRawShape> {
  all: RegisteredQuery<'public', Rec, DocBase<S>[]>
  checkRL?: RegisteredMutation<'internal', Rec, void>
  create: RegisteredMutation<'public', Rec, string>
  get: RegisteredQuery<'public', Rec, (DocBase<S> & { cacheHit: true; stale: boolean }) | null>
  getInternal: RegisteredQuery<'internal', Rec, DocBase<S> | null>
  invalidate: RegisteredMutation<'public', Rec, DocBase<S> | null>
  list: RegisteredQuery<'public', Rec, PaginatedResult<DocBase<S>>>
  load: RegisteredAction<'public', Rec, _.output<ZodObject<S>> & { cacheHit: boolean }>
  purge: RegisteredMutation<'public', Rec, number>
  read: RegisteredQuery<'public', Rec, DocBase<S> | null>
  refresh: RegisteredAction<'public', Rec, _.output<ZodObject<S>> & { cacheHit: boolean }>
  rm: RegisteredMutation<'public', Rec, DocBase<S> | null>
  set: RegisteredMutation<'internal', Rec, void>
  update: RegisteredMutation<'public', Rec, DocBase<S>>
}
interface CanEditOpts {
  acl: boolean
  doc: {
    editors?: string[]
    userId: string
  }
  role: OrgRole
  userId: string
}
interface ChildCrudResult<S extends ZodRawShape> {
  bulkCreate: RegisteredMutation<'public', Rec, string[]>
  bulkRm: RegisteredMutation<'public', Rec, number>
  bulkUpdate: RegisteredMutation<'public', Rec, DocBase<S>[]>
  create: RegisteredMutation<'public', Rec, string>
  get: RegisteredQuery<'public', Rec, DocBase<S> | null>
  list: RegisteredQuery<'public', Rec, DocBase<S>[]>
  pub?: {
    get: RegisteredQuery<'public', Rec, DocBase<S> | null>
    list: RegisteredQuery<'public', Rec, DocBase<S>[]>
  }
  rm: RegisteredMutation<'public', Rec, DocBase<S>>
  update: RegisteredMutation<'public', Rec, DocBase<S> | null>
}
interface CrudReadApi<S extends ZodRawShape, V extends FunctionVisibility = 'public'> {
  list: RegisteredQuery<V, { paginationOpts: PaginationOptions; where?: WhereOf<S> }, PaginatedResult<EnrichedDoc<S>>>
  read: RegisteredQuery<V, { id: string; own?: boolean; where?: WhereOf<S> }, EnrichedDoc<S> | null>
  search?: RegisteredQuery<V, { query: string; where?: WhereOf<S> }, EnrichedDoc<S>[]>
}
interface CrudResult<S extends ZodRawShape> {
  auth: CrudReadApi<S>
  authIndexed: RegisteredQuery<
    'public',
    { index: string; key: string; value: string; where?: WhereOf<S> },
    EnrichedDoc<S>[]
  >
  bulkCreate: RegisteredMutation<'public', { items: _.output<ZodObject<S>>[] }, string[]>
  bulkRm: RegisteredMutation<'public', { ids: string[] }, number>
  bulkUpdate: RegisteredMutation<'public', { data: Partial<_.output<ZodObject<S>>>; ids: string[] }, unknown[]>
  create: RegisteredMutation<'public', _.output<ZodObject<S>>, string>
  pub: CrudReadApi<S>
  pubIndexed: RegisteredQuery<
    'public',
    { index: string; key: string; value: string; where?: WhereOf<S> },
    EnrichedDoc<S>[]
  >
  restore?: RegisteredMutation<'public', { id: string }, DocBase<S>>
  rm: RegisteredMutation<'public', { id: string }, DocBase<S>>
  update: RegisteredMutation<
    'public',
    Partial<_.output<ZodObject<S>>> & { expectedUpdatedAt?: number; id: string },
    DocBase<S>
  >
}
interface DbLike extends DbReadLike {
  delete: (id: string) => Promise<void>
  insert: (table: string, data: Rec) => Promise<string>
  patch: (id: string, data: Rec) => Promise<void>
  system: DbReadLike
}
interface DbReadLike {
  get: (id: string) => Promise<null | Rec>
  query: (table: string) => QueryLike
}
type DocBase<S extends ZodRawShape> = _.output<ZodObject<S>> & {
  _creationTime: number
  _id: string
  updatedAt: number
}
type EnrichedDoc<S extends ZodRawShape> = WithUrls<
  DocBase<S> & {
    author: AuthorInfo | null
    own: boolean | null
    userId: string
  }
>
type ErrorCode = keyof typeof ERROR_MESSAGES
type FID = GenericId<'_storage'>
interface FilterLike {
  and: (a: unknown, b: unknown) => unknown
  eq: (a: unknown, b: unknown) => unknown
  field: (name: string) => unknown
  gt: (a: unknown, b: unknown) => unknown
  gte: (a: unknown, b: unknown) => unknown
  lt: (a: unknown, b: unknown) => unknown
  lte: (a: unknown, b: unknown) => unknown
  or: (a: unknown, b: unknown) => unknown
}
interface IndexLike {
  eq: (field: string, value: unknown) => IndexLike
}
type Mb<V extends FunctionVisibility = 'public'> = CustomBuilder<
  'mutation',
  Record<string, never>,
  Rec,
  Record<string, never>,
  unknown,
  V,
  Rec
>
interface MutationCtxLike {
  auth: { getUserIdentity: () => Promise<unknown> }
  db: DbLike
  storage: StorageLike
}
type OrgCascadeTableConfig<DM extends GenericDataModel = GenericDataModel> =
  | (keyof DM & string)
  | { fileFields?: string[]; table: keyof DM & string }
interface OrgCrudResult<S extends ZodRawShape> {
  addEditor: RegisteredMutation<'public', Rec, DocBase<S> | null>
  bulkCreate: RegisteredMutation<'public', Rec, string[]>
  bulkRm: RegisteredMutation<'public', Rec, number>
  bulkUpdate: RegisteredMutation<'public', Rec, DocBase<S>[]>
  create: RegisteredMutation<'public', Rec, string>
  editors: RegisteredQuery<'public', Rec, { email: string; name: string; userId: string }[]>
  list: RegisteredQuery<'public', Rec, PaginatedResult<OrgEnrichedDoc<S>>>
  read: RegisteredQuery<'public', Rec, OrgEnrichedDoc<S>>
  removeEditor: RegisteredMutation<'public', Rec, DocBase<S> | null>
  restore?: RegisteredMutation<'public', Rec, DocBase<S>>
  rm: RegisteredMutation<'public', Rec, DocBase<S>>
  setEditors: RegisteredMutation<'public', Rec, DocBase<S> | null>
  update: RegisteredMutation<'public', Rec, DocBase<S> | null>
}
type OrgEnrichedDoc<S extends ZodRawShape> = WithUrls<
  DocBase<S> & {
    author: AuthorInfo | null
    orgId: string
    own: boolean | null
    userId: string
  }
>
type OrgRole = 'admin' | 'member' | 'owner'
interface PaginatedResult<D> {
  continueCursor: string
  isDone: boolean
  page: D[]
}
type PaginationOptsShape = Record<keyof typeof paginationOptsValidator.fields, ZodNullable | ZodNumber | ZodOptional>
type Qb<V extends FunctionVisibility = 'public'> = CustomBuilder<
  'query',
  Record<string, never>,
  Rec,
  Record<string, never>,
  unknown,
  V,
  Rec
>
interface QueryCtxLike {
  auth: { getUserIdentity: () => Promise<unknown> }
  db: DbLike
  storage: StorageLike
}
interface QueryLike {
  collect: () => Promise<Rec[]>
  filter: (fn: (fb: FilterLike) => unknown) => QueryLike
  first: () => Promise<null | Rec>
  order: (dir: 'asc' | 'desc') => QueryLike
  paginate: (opts: Rec) => Promise<{ continueCursor: string; isDone: boolean; page: Rec[] }>
  take: (n: number) => Promise<Rec[]>
  unique: () => Promise<null | Rec>
  withIndex: (name: string, fn?: (ib: IndexLike) => unknown) => QueryLike
  withSearchIndex: (name: string, fn: (sb: SearchLike) => unknown) => QueryLike
}
interface ReadCtx {
  db: DbLike
  storage: StorageLike
  viewerId: null | string
  withAuthor: <T extends { userId: string }>(
    docs: T[]
  ) => Promise<
    (T & {
      author: null | Rec
      own: boolean | null
    })[]
  >
}
interface SearchLike {
  search: (field: string, query: string) => unknown
}
interface SetupConfig<DM extends GenericDataModel = GenericDataModel> {
  action: ActionBuilder<DM, 'public'>
  getAuthUserId: (ctx: never) => Promise<null | string>
  hooks?: GlobalHooks
  internalMutation: MutationBuilder<DM, 'internal'>
  internalQuery: QueryBuilder<DM, 'internal'>
  middleware?: Middleware[]
  mutation: MutationBuilder<DM, 'public'>
  orgCascadeTables?: OrgCascadeTableConfig<DM>[]
  orgSchema?: ZodObject<ZodRawShape>
  query: QueryBuilder<DM, 'public'>
  strictFilter?: boolean
}
interface StorageLike {
  delete: (id: string) => Promise<void>
  getUrl: (id: string) => Promise<null | string>
}
type UrlKey<K, V> =
  NonNullable<V> extends FID | FID[] | readonly FID[] ? `${K & string}Url${NonNullable<V> extends FID ? '' : 's'}` : never
type UrlVal<V> =
  NonNullable<V> extends FID | FID[] | readonly FID[]
    ? NonNullable<V> extends FID
      ? null | string
      : (null | string)[]
    : never
type WhereFieldValue<V> = ComparisonOp<V> | V
type WhereGroupOf<S extends ZodRawShape> = {
  [K in keyof _.output<ZodObject<S>>]?: WhereFieldValue<_.output<ZodObject<S>>[K]>
} & {
  own?: boolean
}
type WhereOf<S extends ZodRawShape> = WhereGroupOf<S> & {
  or?: WhereGroupOf<S>[]
}
type WithUrls<D> = D & { [K in keyof D as UrlKey<K, D[K]>]: UrlVal<D[K]> }
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __brand: unique symbol
/** Validates a schema has the expected brand, returning the schema type on success or an error message type on failure. */
type AssertSchema<T, Expected extends keyof BrandLabelMap> =
  DetectBrand<T> extends Expected ? T : SchemaTypeError<Expected, DetectBrand<T> & keyof BrandLabelMap>
type BaseSchema<T extends ZodRawShape> = SchemaBrand<'base'> & ZodObject<T>
/** Readable brand name for error messages. */
interface BrandLabelMap {
  base: 'BaseSchema (from makeBase())'
  org: 'OrgSchema (from makeOrgScoped())'
  owned: 'OwnedSchema (from makeOwned())'
  singleton: 'SingletonSchema (from makeSingleton())'
  unbranded: 'plain ZodObject (not branded)'
}
/** Detects the brand key from a schema type, returning 'unbranded' for plain ZodObject. */
type DetectBrand<T> = T extends SchemaBrand<infer K> ? K : 'unbranded'
type OrgSchema<T extends ZodRawShape> = SchemaBrand<'org'> & ZodObject<T>
/** Minimal user shape used across org operations, containing id, name, email, and image. */
interface OrgUserLike {
  [k: string]: unknown
  _id: GenericId<'users'>
  email?: string
  image?: string
  name?: string
}
type OwnedSchema<T extends ZodRawShape> = SchemaBrand<'owned'> & ZodObject<T>

interface SchemaBrand<K extends string> {
  readonly [__brand]: K
  readonly __hint: SchemaHint<K>
}
type SchemaHint<K extends string> = K extends keyof SchemaHintMap ? SchemaHintMap[K] : string
interface SchemaHintMap {
  base: 'Created by makeBase() → use cacheCrud() + baseTable()'
  org: 'Created by makeOrgScoped() → use orgCrud() + orgTable()'
  owned: 'Created by makeOwned() → use crud() + ownedTable()'
  singleton: 'Created by makeSingleton() → use singletonCrud() + singletonTable()'
}
/** Produces a descriptive compile-time error message when the wrong schema brand is passed. */
type SchemaTypeError<
  Expected extends keyof BrandLabelMap,
  Got extends keyof BrandLabelMap
> = `Schema mismatch: expected ${BrandLabelMap[Expected]}, got ${BrandLabelMap[Got]}. ${Expected extends keyof SchemaHintMap ? SchemaHintMap[Expected] : ''}`
interface SingletonCrudResult<S extends ZodRawShape> {
  get: RegisteredQuery<'public', Rec, null | SingletonDoc<S>>
  upsert: RegisteredMutation<'public', Rec, SingletonDoc<S>>
}
type SingletonDoc<S extends ZodRawShape> = WithUrls<DocBase<S> & { userId: string }>
interface SingletonOptions {
  rateLimit?: RateLimitConfig
}
type SingletonSchema<T extends ZodRawShape> = SchemaBrand<'singleton'> & ZodObject<T>
export type {
  /** Action builder type for public visibility. */
  Ab,
  /** Context object for action functions with query and mutation execution. */
  ActionCtxLike,
  /** Validates a schema has the expected brand, producing a descriptive error on mismatch. */
  AssertSchema,
  /** Author information containing user metadata like name, email, and image. */
  AuthorInfo,
  /** Base builders for query and mutation functions. */
  BaseBuilders,
  /** Schema branded as base type for cache CRUD operations. */
  BaseSchema,
  /** Readable brand labels for error messages. */
  BrandLabelMap,
  /** Builders for cache CRUD operations. */
  CacheBuilders,
  /** Result type for cache CRUD factory with all generated endpoints. */
  CacheCrudResult,
  /** Context for cache hooks with database access. */
  CacheHookCtx,
  /** Lifecycle hooks for cache CRUD operations. */
  CacheHooks,
  /** Configuration options for cache CRUD factory. */
  CacheOptions,
  /** Options for checking if a user can edit a document with ACL. */
  CanEditOpts,
  /** Configuration for cascade delete on related tables. */
  CascadeOption,
  /** Configuration for child table relationships. */
  ChildConfig,
  /** Result type for child CRUD factory with all generated endpoints. */
  ChildCrudResult,
  /** Comparison operators for where clause filtering. */
  ComparisonOp,
  /** Builders for CRUD operations with pagination. */
  CrudBuilders,
  /** Lifecycle hooks for CRUD operations. */
  CrudHooks,
  /** Configuration options for CRUD factory. */
  CrudOptions,
  /** Read API for CRUD with list, read, and optional search endpoints. */
  CrudReadApi,
  /** Result type for CRUD factory with all generated endpoints. */
  CrudResult,
  /** Context with database access. */
  DbCtx,
  /** Database interface with read/write operations. */
  DbLike,
  /** Read-only database interface. */
  DbReadLike,
  /** Detects the brand key ('owned' | 'org' | 'base' | 'singleton' | 'unbranded') from a schema type. */
  DetectBrand,
  /** Base document type with id, creation time, and update timestamp. */
  DocBase,
  /** Document enriched with author info, ownership flag, and file URLs. */
  EnrichedDoc,
  /** Union type of all possible error codes. */
  ErrorCode,
  /** File ID type for storage references. */
  FID,
  /** Filter builder interface for query construction. */
  FilterLike,
  /** Context for global hooks with database and storage access. */
  GlobalHookCtx,
  /** Global lifecycle hooks applied to all CRUD operations. */
  GlobalHooks,
  /** Context for CRUD hooks with database, storage, and user info. */
  HookCtx,
  /** Index builder interface for query optimization. */
  IndexLike,
  /** Mutation builder type for public visibility. */
  Mb,
  /** Middleware for intercepting CRUD operations. */
  Middleware,
  /** Context for middleware with operation type. */
  MiddlewareCtx,
  /** Context for mutation functions with auth and storage. */
  MutationCtxLike,
  /** Mutation context with user info and storage. */
  MutCtx,
  /** Configuration for org cascade delete tables. */
  OrgCascadeTableConfig,
  /** Result type for org CRUD factory with all generated endpoints. */
  OrgCrudResult,
  /** Org-scoped document enriched with author info and org ID. */
  OrgEnrichedDoc,
  /** Organization role type: admin, member, or owner. */
  OrgRole,
  /** Schema branded as org type for org CRUD operations. */
  OrgSchema,
  /** Minimal user shape for org operations. */
  OrgUserLike,
  /** Schema branded as owned type for user-owned CRUD operations. */
  OwnedSchema,
  /** Paginated result with page data and cursor for next page. */
  PaginatedResult,
  /** Shape of pagination options validator. */
  PaginationOptsShape,
  /** Query builder type for public visibility. */
  Qb,
  /** Context for query functions with auth and storage. */
  QueryCtxLike,
  /** Query builder interface for database queries. */
  QueryLike,
  /** Configuration for sliding window rate limiting. */
  RateLimitConfig,
  /** Context for read operations with author enrichment. */
  ReadCtx,
  /** Generic record type for flexible data structures. */
  Rec,
  /** Schema brand marker for type safety. */
  SchemaBrand,
  /** Search builder interface for full-text search. */
  /** Produces a descriptive compile-time error message for schema brand mismatches. */
  SchemaTypeError,
  SearchLike,
  /** Configuration for setup function with builders and hooks. */
  SetupConfig,
  /** Result type for singleton CRUD factory. */
  SingletonCrudResult,
  /** Singleton document with user ID and file URLs. */
  SingletonDoc,
  /** Configuration options for singleton CRUD factory. */
  SingletonOptions,
  /** Schema branded as singleton type for per-user data. */
  SingletonSchema,
  /** Storage interface for file operations. */
  StorageLike,
  /** User context with database and user info. */
  UserCtx,
  /** Where clause group for filtering with optional OR. */
  WhereGroupOf,
  /** Where clause for filtering with comparison operators. */
  WhereOf,
  /** Document with file URL properties added. */
  WithUrls
}
/** Map of error codes to human-readable error messages. */
export { ERROR_MESSAGES }

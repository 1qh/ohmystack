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
interface CascadeOption<T extends string = string> {
  foreignKey: string
  table: T
}
interface ChildConfig {
  foreignKey: string
  index?: string
  parent: string
  parentSchema?: ZodObject
  schema: ZodObject
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
  pub?: boolean | (keyof S & string) | { where?: WhereOf<S> }
  rateLimit?: RateLimitInput
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
type RateLimitInput = number | RateLimitConfig
type Rec = Record<string, unknown>
interface UserCtx extends DbCtx {
  user: Rec
}
const ERROR_MESSAGES = {
  ALREADY_ORG_MEMBER: 'This user is already a member — check the members list before inviting',
  ALREADY_PROCESSED: 'This request was already handled — refresh to see the latest state',
  CANNOT_MODIFY_ADMIN: 'Admins cannot modify other admins — only the org owner can',
  CANNOT_MODIFY_OWNER: 'The org owner cannot be modified — transfer ownership first',
  CHUNK_ALREADY_UPLOADED: 'This file chunk was already uploaded — the upload may be retrying',
  CHUNK_NOT_FOUND: 'File chunk not found — the upload session may have expired, try uploading again',
  CONFLICT: 'This record was modified by someone else — review the changes and try again',
  EDITOR_REQUIRED: 'You need editor access to modify this — ask the owner to add you as an editor',
  FILE_NOT_FOUND: 'The file was deleted or moved — refresh and try again',
  FILE_TOO_LARGE: 'File exceeds the size limit — compress or resize before uploading',
  FORBIDDEN: "You don't have permission — you can only modify your own records",
  INCOMPLETE_UPLOAD: 'Upload is incomplete — some chunks are still missing, wait or retry',
  INSUFFICIENT_ORG_ROLE: 'This action requires a higher role — ask an admin to upgrade your access',
  INVALID_FILE_TYPE: 'This file type is not allowed — check the accepted formats',
  INVALID_INVITE: 'This invite link is invalid — ask for a new one',
  INVALID_MESSAGE: 'Message content is invalid — check the format and try again',
  INVALID_SESSION_STATE: 'Session is in an unexpected state — try refreshing the page',
  INVALID_TOOL_ARGS: 'Invalid tool arguments — check the parameter types',
  INVALID_WHERE: 'Invalid filter — check that field names and values match the schema',
  INVITE_EXPIRED: 'This invite has expired — ask for a new one',
  JOIN_REQUEST_EXISTS: 'You already requested to join — wait for approval',
  LIMIT_EXCEEDED: 'Request limit exceeded — wait a moment before trying again',
  MESSAGE_NOT_SAVED: 'Message could not be saved — check your connection and retry',
  MUST_TRANSFER_OWNERSHIP: 'Transfer ownership to another admin before leaving the organization',
  NOT_AUTHENTICATED: 'Please log in to continue',
  NOT_AUTHORIZED: "You are not authorized — make sure you're logged into the right account",
  NOT_FOUND: "This record doesn't exist — it may have been deleted",
  NOT_ORG_MEMBER: "You're not a member of this organization — request to join or ask for an invite",
  NO_FETCHER: 'No data fetcher configured — pass a fetcher function in the cache table options',
  NO_PRECEDING_USER_MESSAGE: 'No preceding user message found in the conversation',
  ORG_SLUG_TAKEN: 'This organization URL is already taken — try a different slug',
  RATE_LIMITED: 'Too many requests — please wait before trying again',
  SESSION_NOT_FOUND: 'Session not found — it may have expired, try logging in again',
  TARGET_MUST_BE_ADMIN: 'You can only transfer ownership to an existing admin',
  UNAUTHORIZED: 'Authentication required — please log in',
  USER_NOT_FOUND: 'User not found — they may have deleted their account',
  VALIDATION_FAILED: 'Some fields are invalid — check the highlighted fields and fix the errors'
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
type BuiltinErrorCode = keyof typeof ERROR_MESSAGES
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
  create: RegisteredMutation<'public', Rec, string | string[]>
  get: RegisteredQuery<'public', Rec, DocBase<S> | null>
  list: RegisteredQuery<'public', Rec, DocBase<S>[]>
  pub?: {
    get: RegisteredQuery<'public', Rec, DocBase<S> | null>
    list: RegisteredQuery<'public', Rec, DocBase<S>[]>
  }
  rm: RegisteredMutation<'public', Rec, DocBase<S> | number>
  update: RegisteredMutation<'public', Rec, DocBase<S> | DocBase<S>[] | null>
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
  create: RegisteredMutation<'public', _.output<ZodObject<S>> & { items?: _.output<ZodObject<S>>[] }, string | string[]>
  pub: CrudReadApi<S>
  pubIndexed: RegisteredQuery<
    'public',
    { index: string; key: string; value: string; where?: WhereOf<S> },
    EnrichedDoc<S>[]
  >
  restore?: RegisteredMutation<'public', { id: string }, DocBase<S>>
  rm: RegisteredMutation<'public', { id?: string; ids?: string[] }, DocBase<S> | number>
  update: RegisteredMutation<
    'public',
    Partial<_.output<ZodObject<S>>> & {
      expectedUpdatedAt?: number
      id?: string
      items?: (Partial<_.output<ZodObject<S>>> & { expectedUpdatedAt?: number; id: string })[]
    },
    DocBase<S> | DocBase<S>[]
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
// oxlint-disable-next-line typescript-eslint(ban-types)
type ErrorCode = BuiltinErrorCode | (string & {})
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
  create: RegisteredMutation<'public', Rec, string | string[]>
  editors: RegisteredQuery<'public', Rec, { email: string; name: string; userId: string }[]>
  list: RegisteredQuery<'public', Rec, PaginatedResult<OrgEnrichedDoc<S>>>
  read: RegisteredQuery<'public', Rec, OrgEnrichedDoc<S>>
  removeEditor: RegisteredMutation<'public', Rec, DocBase<S> | null>
  restore?: RegisteredMutation<'public', Rec, DocBase<S>>
  rm: RegisteredMutation<'public', Rec, DocBase<S> | number>
  setEditors: RegisteredMutation<'public', Rec, DocBase<S> | null>
  update: RegisteredMutation<'public', Rec, DocBase<S> | DocBase<S>[] | null>
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
  orgSchema?: ZodObject
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
  orgDef: 'OrgDefSchema (from makeOrg())'
  owned: 'OwnedSchema (from makeOwned())'
  singleton: 'SingletonSchema (from makeSingleton())'
  unbranded: 'plain ZodObject (not branded)'
}
/** Detects the brand key from a schema type, returning 'unbranded' for plain ZodObject. */
type DetectBrand<T> = T extends SchemaBrand<infer K> ? K : 'unbranded'
type OrgDefSchema<T extends ZodRawShape> = SchemaBrand<'orgDef'> & ZodObject<T>
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
  orgDef: 'Created by makeOrg() → pass to setup({ orgSchema })'
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
  rateLimit?: RateLimitInput
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
  /** Built-in error codes only (no custom codes). */
  BuiltinErrorCode,
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
  /** Union type of all error codes (built-in + custom strings). */
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
  /** Schema branded as the org definition (passed to setup({ orgSchema })). */
  OrgDefSchema,
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
  RateLimitInput,
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

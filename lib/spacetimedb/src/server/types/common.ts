import type { Identity, Timestamp } from 'spacetimedb'
import type { z as _, ZodNullable, ZodNumber, ZodObject, ZodOptional, ZodRawShape } from 'zod/v4'
type Ab<V extends Visibility = 'public'> = <A = Rec, R = unknown, C = Rec>(
  ...args: unknown[]
) => C & RegisteredAction<V, A, R>
interface ActionCtxLike extends ReducerCtx<DbLike> {
  runMutation: (ref: string, args: Rec) => Promise<unknown>
  runQuery: (ref: string, args: Rec) => Promise<unknown>
}
interface AuthorInfo {
  [key: string]: unknown
  email?: string
  image?: string
  name?: string
}
interface BaseBuilders {
  m: Mb
  pq?: Qb
  q: Qb
}
interface ComparisonOp<V> {
  $between?: [V, V]
  $gt?: V
  $gte?: V
  $lt?: V
  $lte?: V
}
interface DbCtx {
  db: DbLike
}
interface DbLike extends DbReadLike {
  delete: (id: number | string) => Promise<void>
  insert: (table: string, data: Rec) => Promise<number | string>
  patch: (id: number | string, data: Rec) => Promise<void>
  system?: DbReadLike
}
interface DbReadLike {
  get: (id: number | string) => Promise<null | Rec>
  query: (table: string) => QueryLike
}
type DocBase<S extends ZodRawShape> = _.output<ZodObject<S>> & {
  _creationTime: number
  _id: number | string
  updatedAt: number
}
type EnrichedDoc<S extends ZodRawShape> = WithUrls<
  DocBase<S> & {
    author: AuthorInfo | null
    own: boolean | null
    userId: string
  }
>
type FID = string
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
interface GlobalHookCtx {
  db: unknown
  sender: Identity
  table: string
  timestamp: Timestamp
}
interface GlobalHooks {
  afterCreate?: (ctx: GlobalHookCtx, args: { data: Rec; row: Rec }) => Promise<void> | void
  afterDelete?: (ctx: GlobalHookCtx, args: { row: Rec }) => Promise<void> | void
  afterUpdate?: (ctx: GlobalHookCtx, args: { next: Rec; patch: Rec; prev: Rec }) => Promise<void> | void
  beforeCreate?: (ctx: GlobalHookCtx, args: { data: Rec }) => Promise<Rec> | Rec
  beforeDelete?: (ctx: GlobalHookCtx, args: { row: Rec }) => Promise<void> | void
  beforeUpdate?: (ctx: GlobalHookCtx, args: { patch: Rec; prev: Rec }) => Promise<Rec> | Rec
}
interface HookCtx extends ReducerCtx<DbLike> {
  storage?: StorageLike
  userId: string
}
interface IdentityLike {
  equals?: (other: IdentityLike) => boolean
  toHexString?: () => string
  toString: () => string
}
interface IndexLike {
  eq: (field: string, value: unknown) => IndexLike
}
type Mb<V extends Visibility = 'public'> = <A = Rec, R = unknown, C = Rec>(
  ...args: unknown[]
) => C & RegisteredMutation<V, A, R>
interface Middleware {
  afterCreate?: (ctx: MiddlewareCtx, args: { data: Rec; row: Rec }) => Promise<void> | void
  afterDelete?: (ctx: MiddlewareCtx, args: { row: Rec }) => Promise<void> | void
  afterUpdate?: (ctx: MiddlewareCtx, args: { next: Rec; patch: Rec; prev: Rec }) => Promise<void> | void
  beforeCreate?: (ctx: MiddlewareCtx, args: { data: Rec }) => Promise<Rec> | Rec
  beforeDelete?: (ctx: MiddlewareCtx, args: { row: Rec }) => Promise<void> | void
  beforeUpdate?: (ctx: MiddlewareCtx, args: { patch: Rec; prev: Rec }) => Promise<Rec> | Rec
  name: string
}
interface MiddlewareCtx extends GlobalHookCtx {
  operation: 'create' | 'delete' | 'update'
}
interface MutationCtxLike extends ReducerCtx<DbLike> {
  auth?: { getUserIdentity: () => Promise<unknown> }
  storage?: StorageLike
}
interface MutCtx extends UserCtx {
  storage?: StorageLike
}
type OrgEnrichedDoc<S extends ZodRawShape> = WithUrls<
  DocBase<S> & {
    author: AuthorInfo | null
    orgId: number | string
    own: boolean | null
    userId: string
  }
>
type OrgRole = 'admin' | 'member' | 'owner'
interface OrgUserLike {
  [k: string]: unknown
  _id: number
  email?: string
  image?: string
  name?: string
}
interface PaginatedResult<D> {
  continueCursor: string
  isDone: boolean
  page: D[]
}
type PaginationOptsShape = Record<
  'cursor' | 'endCursor' | 'id' | 'maximumBytesRead' | 'maximumRowsRead' | 'numItems',
  ZodNullable | ZodNumber | ZodOptional
>
type Qb<V extends Visibility = 'public'> = <A = Rec, R = unknown, C = Rec>(
  ...args: unknown[]
) => C & RegisteredQuery<V, A, R>
interface QueryCtxLike extends ReducerCtx<DbLike> {
  auth?: { getUserIdentity: () => Promise<unknown> }
  storage?: StorageLike
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
interface RateLimitConfig {
  max: number
  window: number
}
type RateLimitInput = number | RateLimitConfig
interface ReadCtx {
  db: DbLike
  storage?: StorageLike
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
type Rec = Record<string, unknown>
interface ReducerCtx<DB = unknown> {
  db: DB
  sender?: IdentityLike
  timestamp?: number
}
interface RegisteredAction<V extends Visibility, A, R> {
  __args: A
  __kind: 'action'
  __return: R
  __visibility: V
}
interface RegisteredMutation<V extends Visibility, A, R> {
  __args: A
  __kind: 'mutation'
  __return: R
  __visibility: V
}
interface RegisteredQuery<V extends Visibility, A, R> {
  __args: A
  __kind: 'query'
  __return: R
  __visibility: V
}
interface SearchLike {
  search: (field: string, query: string) => unknown
}
interface SetupConfig<DM = unknown> {
  action: Ab
  getAuthUserId: (ctx: never) => Promise<null | string>
  hooks?: GlobalHooks
  internalMutation: Mb<'internal'>
  internalQuery: Qb<'internal'>
  middleware?: Middleware[]
  mutation: Mb
  orgCascadeTables?: ((keyof DM & string) | { fileFields?: string[]; table: keyof DM & string })[]
  orgSchema?: ZodObject
  query: Qb
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
interface UserCtx extends DbCtx {
  user: Rec
}
type Visibility = 'internal' | 'public'
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
const ERROR_MESSAGES = {
  ALREADY_ORG_MEMBER: 'This user is already a member — check the members list before inviting',
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
type BuiltinErrorCode = keyof typeof ERROR_MESSAGES
// oxlint-disable-next-line typescript-eslint(ban-types)
type ErrorCode = BuiltinErrorCode | (string & {})
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __brand: unique symbol
type AssertSchema<T, Expected extends keyof BrandLabelMap> =
  DetectBrand<T> extends Expected ? T : SchemaTypeError<Expected, DetectBrand<T> & keyof BrandLabelMap>
type BaseSchema<T extends ZodRawShape> = SchemaBrand<'base'> &
  SchemaPhantoms<_.output<ZodObject<T>>, DocBase<T>, Partial<_.output<ZodObject<T>>>> &
  ZodObject<T>
interface BrandLabelMap {
  base: 'BaseSchema (from makeBase())'
  org: 'OrgSchema (from makeOrgScoped())'
  orgDef: 'OrgDefSchema (from makeOrg())'
  owned: 'OwnedSchema (from makeOwned())'
  singleton: 'SingletonSchema (from makeSingleton())'
  unbranded: 'plain ZodObject (not branded)'
}
type DetectBrand<T> = T extends SchemaBrand<infer K> ? K : 'unbranded'
type InferCreate<S> = S extends ZodObject<infer T> ? _.output<ZodObject<T>> : never
type InferReducerArgs<R> = R extends { __args: infer A } ? A : never
type InferReducerInputs<T> = {
  [K in keyof T]: InferReducerArgs<T[K]>
}
type InferReducerOutputs<T> = {
  [K in keyof T]: InferReducerReturn<T[K]>
}
type InferReducerReturn<R> = R extends { __return: infer O } ? O : never
type InferRow<S> =
  S extends OwnedSchema<infer T>
    ? DocBase<T> & { userId: string }
    : S extends OrgDefSchema<infer T>
      ? DocBase<T> & { userId: string }
      : S extends OrgSchema<infer T>
        ? DocBase<T> & { orgId: number | string; userId: string }
        : S extends BaseSchema<infer T>
          ? DocBase<T>
          : S extends SingletonSchema<infer T>
            ? _.output<ZodObject<T>> & { updatedAt: number; userId: string }
            : S extends ZodObject<infer T>
              ? _.output<ZodObject<T>>
              : never
type InferRows<T extends Record<string, unknown>> = {
  [K in keyof T]: InferRow<T[K]>
}
type InferUpdate<S> = S extends ZodObject<infer T> ? Partial<_.output<ZodObject<T>>> : never
type OrgDefSchema<T extends ZodRawShape> = SchemaBrand<'orgDef'> &
  SchemaPhantoms<_.output<ZodObject<T>>, DocBase<T> & { userId: string }, Partial<_.output<ZodObject<T>>>> &
  ZodObject<T>
type OrgSchema<T extends ZodRawShape> = SchemaBrand<'org'> &
  SchemaPhantoms<
    _.output<ZodObject<T>>,
    DocBase<T> & { orgId: number | string; userId: string },
    Partial<_.output<ZodObject<T>>>
  > &
  ZodObject<T>
type OwnedSchema<T extends ZodRawShape> = SchemaBrand<'owned'> &
  SchemaPhantoms<_.output<ZodObject<T>>, DocBase<T> & { userId: string }, Partial<_.output<ZodObject<T>>>> &
  ZodObject<T>
interface Register {
  _?: never
}
type RegisteredDefaultError = Register extends { defaultError: infer E } ? E : Error
type RegisteredMeta = Register extends { meta: infer M } ? M : Record<string, unknown>
interface SchemaBrand<K extends string> {
  readonly [__brand]: K
  readonly __hint: SchemaHint<K>
}
type SchemaHint<K extends string> = K extends keyof SchemaHintMap ? SchemaHintMap[K] : string
interface SchemaHintMap {
  base: 'Created by makeBase() → use table()'
  org: 'Created by makeOrgScoped() → use table()'
  orgDef: 'Created by makeOrg() → use table()'
  owned: 'Created by makeOwned() → use table()'
  singleton: 'Created by makeSingleton() → use table()'
}
interface SchemaPhantoms<C, R, U> {
  readonly $inferCreate: C
  readonly $inferRow: R
  readonly $inferUpdate: U
  readonly '~types': {
    readonly create: C
    readonly row: R
    readonly update: U
  }
}
type SchemaTypeError<
  Expected extends keyof BrandLabelMap,
  Got extends keyof BrandLabelMap
> = `Schema mismatch: expected ${BrandLabelMap[Expected]}, got ${BrandLabelMap[Got]}. ${Expected extends keyof SchemaHintMap ? SchemaHintMap[Expected] : ''}`
type SingletonSchema<T extends ZodRawShape> = SchemaBrand<'singleton'> &
  SchemaPhantoms<
    _.output<ZodObject<T>>,
    _.output<ZodObject<T>> & { updatedAt: number; userId: string },
    Partial<_.output<ZodObject<T>>>
  > &
  ZodObject<T>
export type {
  Ab,
  ActionCtxLike,
  AssertSchema,
  AuthorInfo,
  BaseBuilders,
  BaseSchema,
  BrandLabelMap,
  BuiltinErrorCode,
  ComparisonOp,
  DbCtx,
  DbLike,
  DbReadLike,
  DetectBrand,
  DocBase,
  EnrichedDoc,
  ErrorCode,
  FID,
  FilterLike,
  GlobalHookCtx,
  GlobalHooks,
  HookCtx,
  IdentityLike,
  IndexLike,
  InferCreate,
  InferReducerArgs,
  InferReducerInputs,
  InferReducerOutputs,
  InferReducerReturn,
  InferRow,
  InferRows,
  InferUpdate,
  Mb,
  Middleware,
  MiddlewareCtx,
  MutationCtxLike,
  MutCtx,
  OrgDefSchema,
  OrgEnrichedDoc,
  OrgRole,
  OrgSchema,
  OrgUserLike,
  OwnedSchema,
  PaginatedResult,
  PaginationOptsShape,
  Qb,
  QueryCtxLike,
  QueryLike,
  RateLimitConfig,
  RateLimitInput,
  ReadCtx,
  Rec,
  ReducerCtx,
  Register,
  RegisteredAction,
  RegisteredDefaultError,
  RegisteredMeta,
  RegisteredMutation,
  RegisteredQuery,
  SchemaBrand,
  SchemaHintMap,
  SchemaPhantoms,
  SchemaTypeError,
  SearchLike,
  SetupConfig,
  SingletonSchema,
  StorageLike,
  UserCtx,
  Visibility,
  WhereGroupOf,
  WhereOf,
  WithUrls
}
export { ERROR_MESSAGES }

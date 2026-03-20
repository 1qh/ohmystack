type RemoveIndexSignature<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : symbol extends K ? never : K]: T[K]
}
type StrictApi<T> = RemoveIndexSignature<{
  [K in keyof T]: T[K] extends Record<string, unknown> ? StrictApi<T[K]> : T[K]
}>
const strictApi = <T>(a: T): StrictApi<T> => a as unknown as StrictApi<T>
export { guardApi } from './guard'
export { identityEquals, identityFromHex, identityToHex, idFromWire, idToWire } from './server/helpers'
export type {
  Ab,
  ActionCtxLike,
  AuthorInfo,
  BaseSchema,
  CacheCrudResult,
  CacheOptions,
  CanEditOpts,
  CascadeOption,
  ChildConfig,
  ChildCrudResult,
  ComparisonOp,
  CrudHooks,
  CrudOptions,
  CrudReadApi,
  CrudResult,
  DbLike,
  DbReadLike,
  DocBase,
  EnrichedDoc,
  ErrorCode,
  FID,
  HookCtx,
  InferCreate,
  InferReducerArgs,
  InferReducerInputs,
  InferReducerOutputs,
  InferReducerReturn,
  InferRow,
  InferRows,
  InferUpdate,
  Mb,
  MutationCtxLike,
  OrgCrudResult,
  OrgDefSchema,
  OrgEnrichedDoc,
  OrgRole,
  OrgSchema,
  OwnedSchema,
  PaginatedResult,
  PaginationOptsShape,
  Qb,
  QueryCtxLike,
  QueryLike,
  ReadCtx,
  Register,
  RegisteredDefaultError,
  RegisteredMeta,
  SchemaPhantoms,
  SetupConfig,
  SingletonSchema,
  StorageLike,
  WhereGroupOf,
  WhereOf,
  WithUrls
} from './server/types'
export type { StrictApi }
export { zodFromTable } from './stdb-zod'
export { strictApi }

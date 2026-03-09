type RemoveIndexSignature<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : symbol extends K ? never : K]: T[K]
}

const strictApi = <T>(a: T): StrictApi<T> => a as unknown as StrictApi<T>

export { guardApi } from './guard'
export type { DevError, DevSubscription } from './react/devtools'
export type { Api, ConflictData, FieldKind, FieldMeta, FieldMetaMap, FormReturn } from './react/form'
export type { OrgContextValue, OrgDoc, OrgProviderProps } from './react/org'
export type { SoftDeleteOpts, ToastFn } from './react/use-soft-delete'
export type { ConvexErrorData, ErrorHandler } from './server/helpers'
export type {
  Ab,
  ActionCtxLike,
  AuthorInfo,
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
  Mb,
  MutationCtxLike,
  OrgCrudResult,
  OrgEnrichedDoc,
  OrgRole,
  PaginatedResult,
  PaginationOptsShape,
  Qb,
  QueryCtxLike,
  QueryLike,
  ReadCtx,
  SetupConfig,
  StorageLike,
  WhereGroupOf,
  WhereOf,
  WithUrls
} from './server/types'

export type { StrictApi }
export type { CvMeta, DefType, ZodSchema } from './zod'
export { strictApi }

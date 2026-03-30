import { strictApi } from '@a/shared/strict-api'
export { guardApi } from './guard'
export type { DevError, DevSubscription } from './react/devtools'
export type { Api, ConflictData, FieldKind, FieldMeta, FieldMetaMap, FormReturn } from './react/form'
export type { OrgContextValue, OrgDoc, OrgProviderProps } from './react/org'
export type { SoftDeleteOpts, ToastFn } from './react/use-soft-delete'
export type { ConvexErrorData, ErrorData, ErrorHandler } from './server/helpers'
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
export type { CvMeta, DefType, ZodSchema } from './zod'
export type { StrictApi } from '@a/shared/strict-api'
export { strictApi }

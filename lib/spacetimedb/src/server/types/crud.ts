import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ColumnBuilder, ColumnMetadata, ReducerExport, TypeBuilder } from 'spacetimedb/server'

import type { RateLimitConfig } from './common'
interface CascadeOption {
  foreignKey: string
  table: string
}
type CrudBuilder =
  | ColumnBuilder<unknown, AlgebraicTypeType, ColumnMetadata<unknown>>
  | TypeBuilder<unknown, AlgebraicTypeType>
type CrudBuilders = never
interface CrudConfig<
  DB,
  F extends CrudFieldBuilders,
  Row extends Record<string, unknown> & { updatedAt: Timestamp; userId: Identity },
  Id,
  Tbl extends CrudTableLike<Row>,
  Pk extends CrudPkLike<Row, Id>
> {
  expectedUpdatedAtField?: TypeBuilder<Timestamp, AlgebraicTypeType>
  fields: F
  idField: TypeBuilder<Id, AlgebraicTypeType>
  options?: CrudOptions<DB, Row, CrudFieldValues<F>, Partial<CrudFieldValues<F>>>
  pk: (table: Tbl) => Pk
  table: (db: DB) => Tbl
  tableName: string
}
interface CrudExports {
  exports: Record<string, ReducerExportLike>
}
type CrudFieldBuilders = Record<string, CrudBuilder>
type CrudFieldValues<F extends CrudFieldBuilders> = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  [K in keyof F]: F[K] extends ColumnBuilder<infer T, infer _S, infer _M>
    ? T
    : F[K] extends TypeBuilder<infer T, infer _S> // eslint-disable-line @typescript-eslint/no-unused-vars
      ? T
      : never
}
interface CrudHooks<
  DB = unknown,
  Row extends Record<string, unknown> = Record<string, unknown>,
  CreateArgs extends Record<string, unknown> = Record<string, unknown>,
  UpdatePatch extends Record<string, unknown> = Record<string, unknown>
> {
  afterCreate?: (ctx: HookCtx<DB>, args: { data: CreateArgs; row: Row }) => Promise<void> | void
  afterDelete?: (ctx: HookCtx<DB>, args: { row: Row }) => Promise<void> | void
  afterUpdate?: (ctx: HookCtx<DB>, args: { next: Row; patch: UpdatePatch; prev: Row }) => Promise<void> | void
  beforeCreate?: (ctx: HookCtx<DB>, args: { data: CreateArgs }) => CreateArgs | Promise<CreateArgs>
  beforeDelete?: (ctx: HookCtx<DB>, args: { row: Row }) => Promise<void> | void
  beforeUpdate?: (ctx: HookCtx<DB>, args: { patch: UpdatePatch; prev: Row }) => Promise<UpdatePatch> | UpdatePatch
}
type CrudMakeFn = <
  DB,
  F extends CrudFieldBuilders,
  Row extends Record<string, unknown> & { updatedAt: Timestamp; userId: Identity },
  Id,
  Tbl extends CrudTableLike<Row>,
  Pk extends CrudPkLike<Row, Id>
>(
  spacetimedb: {
    reducer: (
      opts: { name: string },
      params: CrudFieldBuilders,
      fn: (ctx: HookCtx<DB>, args: Record<string, unknown>) => void
    ) => ReducerExportLike
  },
  config: CrudConfig<DB, F, Row, Id, Tbl, Pk>
) => CrudExports
interface CrudOptions<
  DB = unknown,
  Row extends Record<string, unknown> = Record<string, unknown>,
  CreateArgs extends Record<string, unknown> = Record<string, unknown>,
  UpdatePatch extends Record<string, unknown> = Record<string, unknown>
> {
  cascade?: CascadeOption[]
  hooks?: CrudHooks<DB, Row, CreateArgs, UpdatePatch>
  rateLimit?: RateLimitConfig
  softDelete?: boolean
}
interface CrudPkLike<Row, Id> {
  delete: (id: Id) => boolean
  find: (id: Id) => null | Row
  update: (row: Row) => Row
}
type CrudReadApi = never
type CrudResult = CrudExports
interface CrudTableLike<Row> {
  delete: (row: Row) => boolean
  insert: (row: Row) => Row
}
interface DbCtx {
  db: unknown
}
interface HookCtx<DB = unknown> {
  db: DB
  sender: Identity
  timestamp: Timestamp
}
type ReducerExportLike = ReducerExport<never, never>
export type {
  CascadeOption,
  CrudBuilders,
  CrudConfig,
  CrudExports,
  CrudFieldBuilders,
  CrudFieldValues,
  CrudHooks,
  CrudMakeFn,
  CrudOptions,
  CrudPkLike,
  CrudReadApi,
  CrudResult,
  CrudTableLike,
  DbCtx,
  HookCtx
}

import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ColumnBuilder, ColumnMetadata, ReducerExport, TypeBuilder } from 'spacetimedb/server'
type ReducerExportLike = ReducerExport<never, never>
interface SingletonBuilder {
  optional: () => TypeBuilder<unknown, AlgebraicTypeType>
}
interface SingletonConfig<
  DB,
  F extends SingletonFieldBuilders,
  Row extends { updatedAt: Timestamp; userId: Identity },
  Tbl extends SingletonTableLike<Row>
> {
  fields: F
  options?: SingletonOptions<DB, Row, Partial<SingletonFieldValues<F>>>
  table: (db: DB) => Tbl
  tableName: string
}
interface SingletonExports {
  exports: Record<string, ReducerExportLike>
}
type SingletonFieldBuilders = Record<
  string,
  ColumnBuilder<unknown, AlgebraicTypeType, ColumnMetadata<unknown>> | TypeBuilder<unknown, AlgebraicTypeType>
>
type SingletonFieldValues<F extends SingletonFieldBuilders> = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  [K in keyof F]: F[K] extends ColumnBuilder<infer T, infer _S, infer _M>
    ? T
    : F[K] extends TypeBuilder<infer T, infer _S> // eslint-disable-line @typescript-eslint/no-unused-vars
      ? T
      : never
}
interface SingletonHookCtx<DB = unknown> {
  db: DB
  sender: Identity
  timestamp: Timestamp
}
interface SingletonHooks<DB = unknown, Row = Record<string, unknown>, UpdatePatch = Record<string, unknown>> {
  afterCreate?: (ctx: SingletonHookCtx<DB>, args: { data: UpdatePatch; row: Row }) => Promise<void> | void
  afterUpdate?: (ctx: SingletonHookCtx<DB>, args: { next: Row; patch: UpdatePatch; prev: Row }) => Promise<void> | void
  beforeCreate?: (ctx: SingletonHookCtx<DB>, args: { data: UpdatePatch }) => Promise<UpdatePatch> | UpdatePatch
  beforeRead?: (ctx: SingletonHookCtx<DB>, args: { row: Row }) => Promise<void> | void
  beforeUpdate?: (ctx: SingletonHookCtx<DB>, args: { patch: UpdatePatch; prev: Row }) => Promise<UpdatePatch> | UpdatePatch
}
interface SingletonOptions<DB = unknown, Row = Record<string, unknown>, UpdatePatch = Record<string, unknown>> {
  hooks?: SingletonHooks<DB, Row, UpdatePatch>
}
interface SingletonPkLike<Row> {
  update: (row: Row) => Row
}
interface SingletonTableLike<Row> extends Iterable<Row> {
  id: SingletonPkLike<Row>
  insert: (row: Row) => Row
}
export type {
  SingletonBuilder,
  SingletonConfig,
  SingletonExports,
  SingletonFieldBuilders,
  SingletonFieldValues,
  SingletonHookCtx,
  SingletonHooks,
  SingletonOptions,
  SingletonTableLike
}

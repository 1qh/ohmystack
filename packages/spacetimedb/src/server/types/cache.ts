import type { Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ColumnBuilder, ColumnMetadata, ReducerExport, TypeBuilder } from 'spacetimedb/server'

type CacheBuilder =
  | ColumnBuilder<unknown, AlgebraicTypeType, ColumnMetadata<unknown>>
  | TypeBuilder<unknown, AlgebraicTypeType>

type CacheBuilders = never

interface CacheConfig<
  DB,
  F extends CacheFieldBuilders,
  Row,
  Key,
  Tbl extends CacheTableLike<Row>,
  Pk extends CachePkLike<Row, Key>
> {
  fields: F
  keyField: TypeBuilder<Key, AlgebraicTypeType>
  keyName: string
  options?: CacheOptions
  pk: (table: Tbl) => Pk
  table: (db: DB) => Tbl
  tableName: string
}

type CacheCrudResult = CacheExports

interface CacheExports {
  exports: Record<string, ReducerExportLike>
}

type CacheFieldBuilders = Record<string, CacheBuilder>

type CacheFieldValues<F extends CacheFieldBuilders> = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  [K in keyof F]: F[K] extends ColumnBuilder<infer T, infer _S, infer _M>
    ? T
    : F[K] extends TypeBuilder<infer T, infer _S> // eslint-disable-line @typescript-eslint/no-unused-vars
      ? T
      : never
}

interface CacheHookCtx {
  db: unknown
}

type CacheHooks = never

interface CacheOptions {
  ttl?: number
}

interface CachePkLike<Row, Key> {
  delete: (key: Key) => boolean
  find: (key: Key) => null | Row
  update: (row: Row) => Row
}

interface CacheRowBase {
  cachedAt: Timestamp
  id: number
  invalidatedAt: null | Timestamp
  updatedAt: Timestamp
}

interface CacheTableLike<Row> extends Iterable<Row> {
  insert: (row: Row) => Row
}

type ReducerExportLike = ReducerExport<never, never>

export type {
  CacheBuilder,
  CacheBuilders,
  CacheConfig,
  CacheCrudResult,
  CacheExports,
  CacheFieldBuilders,
  CacheFieldValues,
  CacheHookCtx,
  CacheHooks,
  CacheOptions,
  CachePkLike,
  CacheRowBase,
  CacheTableLike
}

import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ColumnBuilder, ReducerExport, TypeBuilder } from 'spacetimedb/server'
interface FileRowShape {
  contentType: string
  data: Uint8Array
  filename: string
  id: number
  size: number
  uploadedAt: Timestamp
  userId: Identity
}
type FileUploadBuilder = ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>
interface FileUploadConfig<
  DB,
  Row extends { contentType: string; data: Uint8Array; filename: string; size: number; userId: Identity },
  Id,
  Tbl extends FileUploadTableLike<Row>,
  Pk extends FileUploadPkLike<Row, Id>
> {
  allowedTypes?: Set<string>
  fields: FileUploadFields
  idField: TypeBuilder<Id, AlgebraicTypeType>
  maxFileSize?: number
  namespace: string
  pk: (table: Tbl) => Pk
  table: (db: DB) => Tbl
}
interface FileUploadConfigLoose {
  allowedTypes?: Set<string>
  fields: FileUploadFields
  idField: TypeBuilder<unknown, AlgebraicTypeType>
  maxFileSize?: number
  namespace: string
  pk: (table: unknown) => unknown
  table: (db: unknown) => unknown
}
interface FileUploadExports {
  exports: Record<string, ReducerExportLike>
}
interface FileUploadFields {
  contentType: FileUploadBuilder
  data: FileUploadBuilder
  filename: FileUploadBuilder
  size: FileUploadBuilder
}
interface FileUploadPkLike<Row, Id> {
  delete: (id: Id) => boolean
  find: (id: Id) => null | Row
}
interface FileUploadTableLike<Row> {
  insert: (row: Row) => Row
}
type ReducerExportLike = ReducerExport<never, never>
export type {
  FileRowShape,
  FileUploadBuilder,
  FileUploadConfig,
  FileUploadConfigLoose,
  FileUploadExports,
  FileUploadFields,
  FileUploadPkLike,
  FileUploadTableLike
}

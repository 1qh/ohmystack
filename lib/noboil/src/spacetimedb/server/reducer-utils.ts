import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ColumnBuilder, TypeBuilder } from 'spacetimedb/server'
type FieldBuilders = Record<string, ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>>
interface OptionalBuilder {
  optional: () => ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>
}
interface OwnedRow extends Record<string, unknown> {
  updatedAt: Timestamp
  userId: Identity
}
interface PkLike<Row, Id> {
  delete: (id: Id) => boolean
  find: (id: Id) => null | Row
  update: (row: Row) => Row
}
interface TableLike<Row> {
  insert: (row: Row) => Row
}
const makeError = (code: string, message: string): Error => new Error(`${code}: ${message}`)
const identityEquals = (a: Identity, b: Identity): boolean => {
  const left = a as unknown as { isEqual?: (v: unknown) => boolean; toHexString?: () => string }
  if (typeof left.isEqual === 'function') return left.isEqual(b)
  const right = b as unknown as { toHexString?: () => string }
  if (typeof left.toHexString === 'function' && typeof right.toHexString === 'function')
    return left.toHexString() === right.toHexString()
  return Object.is(a, b)
}
const timestampEquals = (a: Timestamp, b: Timestamp): boolean => {
  const left = a as unknown as { isEqual?: (v: unknown) => boolean; toJSON?: () => string }
  if (typeof left.isEqual === 'function') return left.isEqual(b)
  const right = b as unknown as { toJSON?: () => string }
  if (typeof left.toJSON === 'function' && typeof right.toJSON === 'function') return left.toJSON() === right.toJSON()
  return Object.is(a, b)
}
const makeOptionalFields = (fields: FieldBuilders) => {
  const params: FieldBuilders = {}
  const keys = Object.keys(fields)
  for (const key of keys) {
    const field = fields[key] as unknown as OptionalBuilder
    params[key] = field.optional()
  }
  return params
}
const pickPatch = (args: Record<string, unknown>, fieldNames: string[]): Record<string, unknown> => {
  const patchRecord: Record<string, unknown> = {}
  for (const key of fieldNames) if (key in args) patchRecord[key] = args[key]
  return patchRecord
}
const applyPatch = <Row extends Record<string, unknown>>(
  row: Row,
  patch: Record<string, unknown>,
  timestamp: Timestamp
): Row => {
  const nextRecord = { ...(row as unknown as Record<string, unknown>) }
  const patchKeys = Object.keys(patch)
  for (const key of patchKeys) nextRecord[key] = patch[key]
  nextRecord.updatedAt = timestamp
  return nextRecord as unknown as Row
}
const getOwnedRow = <Row extends OwnedRow, Id, Tbl extends TableLike<Row>, Pk extends PkLike<Row, Id>>({
  ctxSender,
  id,
  operation,
  pkAccessor,
  table,
  tableName
}: {
  ctxSender: Identity
  id: Id
  operation: string
  pkAccessor: (table: Tbl) => Pk
  table: Tbl
  tableName: string
}): { pk: Pk; row: Row } => {
  const pk = pkAccessor(table)
  const row = pk.find(id)
  if (!row) throw makeError('NOT_FOUND', `${tableName}:${operation}`)
  if (!identityEquals(row.userId, ctxSender)) throw makeError('FORBIDDEN', `${tableName}:${operation}`)
  return { pk, row }
}
const idEquals = identityEquals
export type { FieldBuilders, OwnedRow, PkLike, TableLike }
export { applyPatch, getOwnedRow, identityEquals, idEquals, makeError, makeOptionalFields, pickPatch, timestampEquals }

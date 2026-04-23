import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ColumnBuilder, ReducerExport, TypeBuilder } from 'spacetimedb/server'
type FieldBuilders = Record<string, ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>>
interface LogConfig<DB, Tbl extends LogTableLike> {
  fields: FieldBuilders
  idempotencyKeyField: ColumnBuilder<string, AlgebraicTypeType> | TypeBuilder<string, AlgebraicTypeType>
  parentField: ColumnBuilder<string, AlgebraicTypeType> | TypeBuilder<string, AlgebraicTypeType>
  table: (db: DB) => Tbl
  tableName: string
}
interface LogExports {
  exports: Record<string, ReducerExportLike>
}
interface LogRow {
  createdAt: Timestamp
  id: number
  idempotencyKey: null | string
  parent: string
  seq: number
}
interface LogTableLike extends Iterable<LogRow> {
  insert: (row: LogRow) => LogRow
}
type ReducerExportLike = ReducerExport<never, never>
/** Creates append/purgeByParent reducers for an append-only log table.
 * Seq allocation is per-parent, computed by scanning for max(seq) within the parent.
 * Idempotency key (optional) deduplicates appends by (parent, idempotencyKey).
 * @param spacetimedb SpacetimeDB reducer factory
 * @param config Log reducer configuration
 * @returns Reducer export map
 */
const makeLog = <DB, Tbl extends LogTableLike>(
  spacetimedb: {
    reducer: (
      opts: { name: string },
      params: FieldBuilders,
      fn: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }, args: unknown) => void
    ) => unknown
  },
  config: LogConfig<DB, Tbl>
): LogExports => {
  const { fields, idempotencyKeyField, parentField, table: tableAccessor, tableName } = config
  const appendName = `append_${tableName}`
  const purgeName = `purge_${tableName}_by_parent`
  const appendParams: FieldBuilders = { ...fields, idempotencyKey: idempotencyKeyField, parent: parentField }
  const purgeParams: FieldBuilders = { parent: parentField }
  const appendReducer = spacetimedb.reducer({ name: appendName }, appendParams, (ctx, args) => {
    const typedArgs = args as Record<string, unknown> & { idempotencyKey?: string; parent: string }
    const table = tableAccessor(ctx.db) as unknown as LogTableLike
    let maxSeq = 0
    if (typedArgs.idempotencyKey)
      for (const row of table) {
        if (row.parent === typedArgs.parent && row.idempotencyKey === typedArgs.idempotencyKey) return
        if (row.parent === typedArgs.parent && row.seq > maxSeq) maxSeq = row.seq
      }
    else for (const row of table) if (row.parent === typedArgs.parent && row.seq > maxSeq) maxSeq = row.seq
    const { idempotencyKey, parent, ...payload } = typedArgs
    table.insert({
      ...payload,
      createdAt: ctx.timestamp,
      id: 0,
      idempotencyKey: idempotencyKey ?? null,
      parent,
      seq: maxSeq + 1
    })
  })
  const purgeReducer = spacetimedb.reducer({ name: purgeName }, purgeParams, (ctx, args) => {
    const typedArgs = args as { parent: string }
    const table = tableAccessor(ctx.db) as unknown as LogTableLike & { id: { delete: (id: number) => void } }
    const toDelete: number[] = []
    for (const row of table) if (row.parent === typedArgs.parent) toDelete.push(row.id)
    for (const id of toDelete) table.id.delete(id)
  })
  const exports: Record<string, ReducerExportLike> = {
    [appendName]: appendReducer as ReducerExportLike,
    [purgeName]: purgeReducer as ReducerExportLike
  }
  return { exports }
}
export type { LogConfig, LogExports, LogRow, LogTableLike }
export { makeLog }

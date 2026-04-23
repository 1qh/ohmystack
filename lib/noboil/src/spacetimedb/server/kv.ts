import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ColumnBuilder, ReducerExport, TypeBuilder } from 'spacetimedb/server'
import { applyPatch, makeError } from './reducer-utils'
type FieldBuilders = Record<string, ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>>
const findByKey = (table: KvTableLike, key: string): KvRow | undefined => {
  for (const row of table) if (row.key === key) return row
}
interface KvConfig<DB, Tbl extends KvTableLike> {
  fields: FieldBuilders
  keyField: ColumnBuilder<string, AlgebraicTypeType> | TypeBuilder<string, AlgebraicTypeType>
  table: (db: DB) => Tbl
  tableName: string
  writeRole?: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }) => boolean
}
interface KvExports {
  exports: Record<string, ReducerExportLike>
}
interface KvRow {
  createdAt: Timestamp
  id: number
  key: string
  updatedAt: Timestamp
}
interface KvTableLike extends Iterable<KvRow> {
  id: { delete: (id: number) => void; update: (row: KvRow) => KvRow }
  insert: (row: KvRow) => KvRow
}
type ReducerExportLike = ReducerExport<never, never>
/** Creates set/rm reducers for a string-keyed kv table. Reads via subscription.
 * @param spacetimedb SpacetimeDB reducer factory
 * @param config Kv reducer configuration
 * @returns Reducer export map
 */
const makeKv = <DB, Tbl extends KvTableLike>(
  spacetimedb: {
    reducer: (
      opts: { name: string },
      params: FieldBuilders,
      fn: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }, args: unknown) => void
    ) => unknown
  },
  config: KvConfig<DB, Tbl>
): KvExports => {
  const { fields, keyField, table: tableAccessor, tableName, writeRole } = config
  const setName = `set_${tableName}`
  const rmName = `rm_${tableName}`
  const setParams: FieldBuilders = { key: keyField, ...fields }
  const rmParams: FieldBuilders = { key: keyField }
  const setReducer = spacetimedb.reducer({ name: setName }, setParams, (ctx, args) => {
    if (writeRole && !writeRole({ db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }))
      throw makeError('FORBIDDEN', `${tableName}:set`)
    const typedArgs = args as Record<string, unknown> & { key: string }
    const { key, ...payload } = typedArgs
    const table = tableAccessor(ctx.db) as unknown as KvTableLike
    const existing = findByKey(table, key)
    if (existing) {
      const patched = applyPatch(
        existing as unknown as Record<string, unknown>,
        payload,
        ctx.timestamp
      ) as unknown as KvRow
      table.id.update(patched)
    } else
      table.insert({
        ...payload,
        createdAt: ctx.timestamp,
        id: 0,
        key,
        updatedAt: ctx.timestamp
      })
  })
  const rmReducer = spacetimedb.reducer({ name: rmName }, rmParams, (ctx, args) => {
    if (writeRole && !writeRole({ db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }))
      throw makeError('FORBIDDEN', `${tableName}:rm`)
    const typedArgs = args as { key: string }
    const table = tableAccessor(ctx.db) as unknown as KvTableLike
    const existing = findByKey(table, typedArgs.key)
    if (existing) table.id.delete(existing.id)
  })
  const exports: Record<string, ReducerExportLike> = {
    [rmName]: rmReducer as ReducerExportLike,
    [setName]: setReducer as ReducerExportLike
  }
  return { exports }
}
export type { KvConfig, KvExports, KvRow, KvTableLike }
export { makeKv }

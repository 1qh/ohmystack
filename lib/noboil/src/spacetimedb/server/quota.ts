import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ColumnBuilder, ReducerExport, TypeBuilder } from 'spacetimedb/server'
import { makeError } from './reducer-utils'
type FieldBuilders = Record<string, ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>>
const findByOwner = (table: QuotaTableLike, owner: string): QuotaRow | undefined => {
  for (const row of table) if (row.owner === owner) return row
}
interface QuotaConfig<DB, Tbl extends QuotaTableLike> {
  durationMs: number
  limit: number
  ownerField: ColumnBuilder<string, AlgebraicTypeType> | TypeBuilder<string, AlgebraicTypeType>
  table: (db: DB) => Tbl
  tableName: string
}
interface QuotaExports {
  exports: Record<string, ReducerExportLike>
}
interface QuotaRow {
  id: number
  owner: string
  timestamps: number[]
}
interface QuotaTableLike extends Iterable<QuotaRow> {
  id: { update: (row: QuotaRow) => QuotaRow }
  insert: (row: QuotaRow) => QuotaRow
}
type ReducerExportLike = ReducerExport<never, never>
const timestampToMs = (ts: Timestamp): number =>
  Number((ts as unknown as { microsSinceUnixEpoch: bigint }).microsSinceUnixEpoch / 1000n)
const prune = (timestamps: number[], cutoff: number): number[] => {
  const out: number[] = []
  for (const t of timestamps) if (t >= cutoff) out.push(t)
  return out
}
/** Creates consume/record reducers for a sliding-window per-owner quota.
 * @param spacetimedb SpacetimeDB reducer factory
 * @param config Quota reducer configuration
 * @returns Reducer export map
 */
const makeQuota = <DB, Tbl extends QuotaTableLike>(
  spacetimedb: {
    reducer: (
      opts: { name: string },
      params: FieldBuilders,
      fn: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }, args: unknown) => void
    ) => unknown
  },
  config: QuotaConfig<DB, Tbl>
): QuotaExports => {
  const { durationMs, limit, ownerField, table: tableAccessor, tableName } = config
  const consumeName = `consume_${tableName}`
  const recordName = `record_${tableName}`
  const params: FieldBuilders = { owner: ownerField }
  const consumeReducer = spacetimedb.reducer({ name: consumeName }, params, (ctx, args) => {
    const { owner } = args as { owner: string }
    const now = timestampToMs(ctx.timestamp)
    const table = tableAccessor(ctx.db) as unknown as QuotaTableLike
    const existing = findByOwner(table, owner)
    const prev = existing?.timestamps ?? []
    const pruned = prune(prev, now - durationMs)
    if (pruned.length >= limit) throw makeError('LIMIT_EXCEEDED', `${tableName}:consume`)
    const next = [...pruned, now]
    if (existing) table.id.update({ ...existing, timestamps: next })
    else table.insert({ id: 0, owner, timestamps: next })
  })
  const recordReducer = spacetimedb.reducer({ name: recordName }, params, (ctx, args) => {
    const { owner } = args as { owner: string }
    const now = timestampToMs(ctx.timestamp)
    const table = tableAccessor(ctx.db) as unknown as QuotaTableLike
    const existing = findByOwner(table, owner)
    const prev = existing?.timestamps ?? []
    const pruned = prune(prev, now - durationMs)
    const next = [...pruned, now]
    if (existing) table.id.update({ ...existing, timestamps: next })
    else table.insert({ id: 0, owner, timestamps: next })
  })
  const exports: Record<string, ReducerExportLike> = {
    [consumeName]: consumeReducer as ReducerExportLike,
    [recordName]: recordReducer as ReducerExportLike
  }
  return { exports }
}
export type { QuotaConfig, QuotaExports, QuotaRow, QuotaTableLike }
export { makeQuota }

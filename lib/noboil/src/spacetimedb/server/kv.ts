import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ColumnBuilder, ReducerExport, TypeBuilder } from 'spacetimedb/server'
import type { RateLimitConfig } from './types'
import { enforceRateLimit } from './helpers'
import { applyPatch, makeError } from './reducer-utils'
type FieldBuilders = Record<string, ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>>
const findByKey = (table: KvTableLike, key: string): KvRow | undefined => {
  for (const row of table) if (row.key === key) return row
}
interface KvConfig<DB, Tbl extends KvTableLike> {
  expectedUpdatedAtField?: ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>
  fields: FieldBuilders
  keyField: ColumnBuilder<string, AlgebraicTypeType> | TypeBuilder<string, AlgebraicTypeType>
  options?: KvOptions<DB>
  table: (db: DB) => Tbl
  tableName: string
  writeRole?: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }) => boolean
}
interface KvExports {
  exports: Record<string, ReducerExportLike>
}
interface KvHookCtx<DB> {
  db: DB
  sender: Identity
  timestamp: Timestamp
}
interface KvHooks<DB = unknown> {
  afterDelete?: (ctx: KvHookCtx<DB>, args: { row: Record<string, unknown> }) => void
  afterSet?: (
    ctx: KvHookCtx<DB>,
    args: { data: Record<string, unknown>; key: string; row: Record<string, unknown> }
  ) => void
  beforeDelete?: (ctx: KvHookCtx<DB>, args: { row: Record<string, unknown> }) => void
  beforeSet?: (ctx: KvHookCtx<DB>, args: { data: Record<string, unknown>; key: string }) => Record<string, unknown>
}
interface KvOptions<DB = unknown> {
  hooks?: KvHooks<DB>
  rateLimit?: RateLimitConfig
  softDelete?: boolean
}
interface KvRow {
  createdAt: Timestamp
  deletedAt?: null | Timestamp
  id: number
  key: string
  updatedAt: Timestamp
}
interface KvTableLike extends Iterable<KvRow> {
  id: { delete: (id: number) => void; update: (row: KvRow) => KvRow }
  insert: (row: KvRow) => KvRow
}
type ReducerExportLike = ReducerExport<never, never>
/** Creates set/rm reducers for a string-keyed kv table. Reads via subscription. */
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
  const { expectedUpdatedAtField, fields, keyField, options, table: tableAccessor, tableName, writeRole } = config
  const hooks = options?.hooks
  const rateLimit = options?.rateLimit
  const softDelete = options?.softDelete ?? false
  /** [params: key, ...payload, optional expectedUpdatedAt] Upsert with optional conflict check. Throws CONFLICT on stale expectedUpdatedAt. */
  const setName = `set_${tableName}`
  /** [params: key] Soft- or hard-delete by key. */
  const rmName = `rm_${tableName}`
  /** [params: key] Bring back a soft-deleted key. Requires softDelete: true. */
  const restoreName = `restore_${tableName}`
  const setParams: FieldBuilders = { key: keyField, ...fields }
  const rmParams: FieldBuilders = { key: keyField }
  const setParamsWithConflict: FieldBuilders = expectedUpdatedAtField
    ? { expectedUpdatedAt: expectedUpdatedAtField, ...setParams }
    : setParams
  const setReducer = spacetimedb.reducer({ name: setName }, setParamsWithConflict, (ctx, args) => {
    if (writeRole && !writeRole({ db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }))
      throw makeError('FORBIDDEN', `${tableName}:set`)
    if (rateLimit) enforceRateLimit(tableName, ctx.sender, rateLimit, Number(ctx.timestamp.microsSinceUnixEpoch / 1000n))
    const hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }
    const typedArgs = args as Record<string, unknown> & { expectedUpdatedAt?: Timestamp; key: string }
    const { expectedUpdatedAt, key, ...rawPayload } = typedArgs
    let payload: Record<string, unknown> = rawPayload
    if (hooks?.beforeSet) payload = hooks.beforeSet(hookCtx, { data: payload, key })
    const table = tableAccessor(ctx.db) as unknown as KvTableLike
    const existing = findByKey(table, key)
    let row: KvRow
    if (existing) {
      if (
        expectedUpdatedAt !== undefined &&
        existing.updatedAt.microsSinceUnixEpoch !== expectedUpdatedAt.microsSinceUnixEpoch
      )
        throw makeError('CONFLICT', `${tableName}:set`)
      const basePatch = softDelete && existing.deletedAt ? { ...payload, deletedAt: null } : payload
      const patched = applyPatch(
        existing as unknown as Record<string, unknown>,
        basePatch,
        ctx.timestamp
      ) as unknown as KvRow
      row = table.id.update(patched)
    } else
      row = table.insert({
        ...payload,
        createdAt: ctx.timestamp,
        id: 0,
        key,
        updatedAt: ctx.timestamp
      })
    if (hooks?.afterSet) hooks.afterSet(hookCtx, { data: payload, key, row: row as unknown as Record<string, unknown> })
  })
  const rmReducer = spacetimedb.reducer({ name: rmName }, rmParams, (ctx, args) => {
    if (writeRole && !writeRole({ db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }))
      throw makeError('FORBIDDEN', `${tableName}:rm`)
    if (rateLimit) enforceRateLimit(tableName, ctx.sender, rateLimit, Number(ctx.timestamp.microsSinceUnixEpoch / 1000n))
    const hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }
    const typedArgs = args as { key: string }
    const table = tableAccessor(ctx.db) as unknown as KvTableLike
    const existing = findByKey(table, typedArgs.key)
    if (!existing) return
    const rowCast = existing as unknown as Record<string, unknown>
    if (hooks?.beforeDelete) hooks.beforeDelete(hookCtx, { row: rowCast })
    if (softDelete) table.id.update({ ...existing, deletedAt: ctx.timestamp })
    else table.id.delete(existing.id)
    if (hooks?.afterDelete) hooks.afterDelete(hookCtx, { row: rowCast })
  })
  const restoreReducer = softDelete
    ? spacetimedb.reducer({ name: restoreName }, rmParams, (ctx, args) => {
        if (writeRole && !writeRole({ db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }))
          throw makeError('FORBIDDEN', `${tableName}:restore`)
        const typedArgs = args as { key: string }
        const table = tableAccessor(ctx.db) as unknown as KvTableLike
        const existing = findByKey(table, typedArgs.key)
        if (existing?.deletedAt) table.id.update({ ...existing, deletedAt: null, updatedAt: ctx.timestamp })
      })
    : undefined
  const exports: Record<string, ReducerExportLike> = {
    [rmName]: rmReducer as ReducerExportLike,
    [setName]: setReducer as ReducerExportLike
  }
  if (restoreReducer) exports[restoreName] = restoreReducer as ReducerExportLike
  return { exports }
}
export type { KvConfig, KvExports, KvHooks, KvOptions, KvRow, KvTableLike }
export { makeKv }

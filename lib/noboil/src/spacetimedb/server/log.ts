import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ColumnBuilder, ReducerExport, TypeBuilder } from 'spacetimedb/server'
import type { RateLimitConfig } from './types'
import { enforceRateLimit } from './helpers'
type FieldBuilders = Record<string, ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>>
interface LogConfig<DB, Tbl extends LogTableLike> {
  bulkItemsField?: ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>
  fields: FieldBuilders
  idempotencyKeyField: ColumnBuilder<string, AlgebraicTypeType> | TypeBuilder<string, AlgebraicTypeType>
  idField?: ColumnBuilder<unknown, AlgebraicTypeType> | TypeBuilder<unknown, AlgebraicTypeType>
  options?: LogOptions<DB>
  parentField: ColumnBuilder<string, AlgebraicTypeType> | TypeBuilder<string, AlgebraicTypeType>
  table: (db: DB) => Tbl
  tableName: string
}
interface LogExports {
  exports: Record<string, ReducerExportLike>
}
interface LogHookCtx<DB> {
  db: DB
  sender: Identity
  timestamp: Timestamp
}
interface LogHooks<DB = unknown> {
  afterAppend?: (ctx: LogHookCtx<DB>, args: { data: Record<string, unknown>; row: Record<string, unknown> }) => void
  afterPurge?: (ctx: LogHookCtx<DB>, args: { parent: string; rows: Record<string, unknown>[] }) => void
  beforeAppend?: (ctx: LogHookCtx<DB>, args: { data: Record<string, unknown>; parent: string }) => Record<string, unknown>
  beforePurge?: (ctx: LogHookCtx<DB>, args: { parent: string; rows: Record<string, unknown>[] }) => void
}
interface LogOptions<DB = unknown> {
  hooks?: LogHooks<DB>
  rateLimit?: RateLimitConfig
  softDelete?: boolean
}
interface LogRow {
  createdAt: Timestamp
  deletedAt?: null | Timestamp
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
  const {
    bulkItemsField,
    fields,
    idField,
    idempotencyKeyField,
    options,
    parentField,
    table: tableAccessor,
    tableName
  } = config
  const hooks = options?.hooks
  const rateLimit = options?.rateLimit
  const softDelete = options?.softDelete ?? false
  const appendName = `append_${tableName}`
  const bulkAppendName = `bulk_append_${tableName}`
  const purgeName = `purge_${tableName}_by_parent`
  const restoreName = `restore_${tableName}_by_parent`
  const appendParams: FieldBuilders = { ...fields, idempotencyKey: idempotencyKeyField, parent: parentField }
  const purgeParams: FieldBuilders = { parent: parentField }
  const appendReducer = spacetimedb.reducer({ name: appendName }, appendParams, (ctx, args) => {
    if (rateLimit) enforceRateLimit(tableName, ctx.sender, rateLimit, Number(ctx.timestamp.microsSinceUnixEpoch / 1000n))
    const hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }
    const typedArgs = args as Record<string, unknown> & { idempotencyKey?: string; parent: string }
    const table = tableAccessor(ctx.db) as unknown as LogTableLike
    let maxSeq = 0
    if (typedArgs.idempotencyKey)
      for (const row of table) {
        if (row.parent === typedArgs.parent && row.idempotencyKey === typedArgs.idempotencyKey) return
        if (row.parent === typedArgs.parent && row.seq > maxSeq) maxSeq = row.seq
      }
    else for (const row of table) if (row.parent === typedArgs.parent && row.seq > maxSeq) maxSeq = row.seq
    const { idempotencyKey, parent, ...rawPayload } = typedArgs
    let payload: Record<string, unknown> = rawPayload
    if (hooks?.beforeAppend) payload = hooks.beforeAppend(hookCtx, { data: payload, parent })
    const row = table.insert({
      ...payload,
      createdAt: ctx.timestamp,
      id: 0,
      idempotencyKey: idempotencyKey ?? null,
      parent,
      seq: maxSeq + 1,
      userId: ctx.sender
    } as unknown as LogRow) as unknown as Record<string, unknown>
    if (hooks?.afterAppend) hooks.afterAppend(hookCtx, { data: payload, row })
  })
  const purgeReducer = spacetimedb.reducer({ name: purgeName }, purgeParams, (ctx, args) => {
    const hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }
    const typedArgs = args as { parent: string }
    const table = tableAccessor(ctx.db) as unknown as LogTableLike & {
      id: { delete: (id: number) => void; update: (row: LogRow) => LogRow }
    }
    const matched: LogRow[] = []
    for (const row of table) if (row.parent === typedArgs.parent && (softDelete ? !row.deletedAt : true)) matched.push(row)
    const rowCast = matched as unknown[] as Record<string, unknown>[]
    if (hooks?.beforePurge) hooks.beforePurge(hookCtx, { parent: typedArgs.parent, rows: rowCast })
    if (softDelete) for (const row of matched) table.id.update({ ...row, deletedAt: ctx.timestamp })
    else for (const row of matched) table.id.delete(row.id)
    if (hooks?.afterPurge) hooks.afterPurge(hookCtx, { parent: typedArgs.parent, rows: rowCast })
  })
  const appendRow = ({
    ctx,
    idempotencyKey,
    parent,
    rawPayload,
    table
  }: {
    ctx: { db: DB; sender: Identity; timestamp: Timestamp }
    idempotencyKey: null | string
    parent: string
    rawPayload: Record<string, unknown>
    table: LogTableLike
  }): Record<string, unknown> | undefined => {
    let maxSeq = 0
    if (idempotencyKey)
      for (const row of table) {
        if (row.parent === parent && row.idempotencyKey === idempotencyKey) return
        if (row.parent === parent && row.seq > maxSeq) maxSeq = row.seq
      }
    else for (const row of table) if (row.parent === parent && row.seq > maxSeq) maxSeq = row.seq
    const hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }
    const payload = hooks?.beforeAppend ? hooks.beforeAppend(hookCtx, { data: rawPayload, parent }) : rawPayload
    const row = table.insert({
      ...payload,
      createdAt: ctx.timestamp,
      id: 0,
      idempotencyKey,
      parent,
      seq: maxSeq + 1,
      userId: ctx.sender
    } as unknown as LogRow) as unknown as Record<string, unknown>
    if (hooks?.afterAppend) hooks.afterAppend(hookCtx, { data: payload, row })
    return row
  }
  const bulkReducer = bulkItemsField
    ? spacetimedb.reducer({ name: bulkAppendName }, { items: bulkItemsField, parent: parentField }, (ctx, args) => {
        if (rateLimit)
          enforceRateLimit(tableName, ctx.sender, rateLimit, Number(ctx.timestamp.microsSinceUnixEpoch / 1000n))
        const typedArgs = args as { items: { idempotencyKey?: null | string }[]; parent: string }
        const table = tableAccessor(ctx.db) as unknown as LogTableLike
        for (const item of typedArgs.items) {
          const { idempotencyKey: ik, ...rest } = item as Record<string, unknown> & { idempotencyKey?: null | string }
          appendRow({ ctx, idempotencyKey: ik ?? null, parent: typedArgs.parent, rawPayload: rest, table })
        }
      })
    : undefined
  const restoreReducer = softDelete
    ? spacetimedb.reducer({ name: restoreName }, purgeParams, (ctx, args) => {
        const typedArgs = args as { parent: string }
        const table = tableAccessor(ctx.db) as unknown as LogTableLike & {
          id: { update: (row: LogRow) => LogRow }
        }
        for (const row of table)
          if (row.parent === typedArgs.parent && row.deletedAt) table.id.update({ ...row, deletedAt: null })
      })
    : undefined
  const exports: Record<string, ReducerExportLike> = {
    [appendName]: appendReducer as ReducerExportLike,
    [purgeName]: purgeReducer as ReducerExportLike
  }
  if (restoreReducer) exports[restoreName] = restoreReducer as ReducerExportLike
  if (bulkReducer) exports[bulkAppendName] = bulkReducer as ReducerExportLike
  const rmName = `rm_${tableName}`
  if (idField) {
    const rmReducer = spacetimedb.reducer({ name: rmName }, { id: idField }, (ctx, args) => {
      if (rateLimit) enforceRateLimit(tableName, ctx.sender, rateLimit, Number(ctx.timestamp.microsSinceUnixEpoch / 1000n))
      const typedArgs = args as { id: number }
      const table = tableAccessor(ctx.db) as unknown as LogTableLike & {
        id: { delete: (id: number) => void; find: (id: number) => LogRow | null; update: (row: LogRow) => LogRow }
      }
      const row = table.id.find(typedArgs.id)
      if (!row) return
      if (softDelete) table.id.update({ ...row, deletedAt: ctx.timestamp })
      else table.id.delete(typedArgs.id)
    })
    exports[rmName] = rmReducer as ReducerExportLike
  }
  return { exports }
}
export type { LogConfig, LogExports, LogHooks, LogOptions, LogRow, LogTableLike }
export { makeLog }

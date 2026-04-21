import type { Timestamp } from 'spacetimedb'
import type {
  CacheConfig,
  CacheExports,
  CacheFieldBuilders,
  CacheFieldValues,
  CachePkLike,
  CacheTableLike
} from './types/cache'
import { applyPatch, makeError, makeOptionalFields, pickPatch } from './reducer-utils'
type UpdateArgs<F extends CacheFieldBuilders> = Partial<CacheFieldValues<F>>
const DAYS_PER_WEEK = 7
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLIS_PER_SECOND = 1000
const DEFAULT_TTL_MS = DAYS_PER_WEEK * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLIS_PER_SECOND
const parseTimestampText = (value: string): null | number => {
  const parsedNumber = Number(value)
  if (Number.isFinite(parsedNumber)) return parsedNumber
  const parsedDate = Date.parse(value)
  if (Number.isFinite(parsedDate)) return parsedDate
  return null
}
const parseTimestampValue = (value: unknown): null | number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') return parseTimestampText(value)
  return null
}
const timestampToMs = (value: Timestamp): number => {
  const timestamp = value as unknown as {
    toJSON?: () => string
    toString?: () => string
    valueOf?: () => number | string
  }
  const fromValue = typeof timestamp.valueOf === 'function' ? parseTimestampValue(timestamp.valueOf()) : null
  if (fromValue !== null) return fromValue
  const fromJson = typeof timestamp.toJSON === 'function' ? parseTimestampValue(timestamp.toJSON()) : null
  if (fromJson !== null) return fromJson
  const fromString = typeof timestamp.toString === 'function' ? parseTimestampValue(timestamp.toString()) : null
  if (fromString !== null) return fromString
  throw makeError('INVALID_TIMESTAMP', 'cache:timestamp')
}
const isExpired = (cachedAt: Timestamp, now: Timestamp, ttl: number): boolean =>
  timestampToMs(cachedAt) + ttl < timestampToMs(now)
/** Creates reducers for cache-table create/update/remove/invalidate/purge workflows.
 * @param spacetimedb - SpacetimeDB reducer factory
 * @param config - Cache CRUD configuration
 * @returns Reducer export map
 */
const makeCacheCrud = <
  DB,
  F extends CacheFieldBuilders,
  Row,
  Key,
  Tbl extends CacheTableLike<Row>,
  Pk extends CachePkLike<Row, Key>
>(
  spacetimedb: {
    reducer: (
      opts: { name: string },
      params: CacheFieldBuilders,
      fn: (ctx: { db: DB; timestamp: Timestamp }, args: unknown) => void
    ) => unknown
  },
  config: CacheConfig<DB, F, Row, Key, Tbl, Pk>
): CacheExports => {
  const { fields, keyField, keyName, options, pk: pkAccessor, table: tableAccessor, tableName } = config
  const ttl = options?.ttl ?? DEFAULT_TTL_MS
  const fieldNames = Object.keys(fields) as (keyof F & string)[]
  const createName = `create_${tableName}`
  const updateName = `update_${tableName}`
  const rmName = `rm_${tableName}`
  const invalidateName = `invalidate_${tableName}`
  const purgeName = `purge_${tableName}`
  const createParams: CacheFieldBuilders = {
    [keyName]: keyField
  }
  const updateParams: CacheFieldBuilders = {
    [keyName]: keyField
  }
  const optionalFields = makeOptionalFields(fields)
  const createKeys = Object.keys(fields)
  const optionalKeys = Object.keys(optionalFields)
  for (const key of createKeys) {
    const field = fields[key]
    if (field) createParams[key] = field
  }
  for (const key of optionalKeys) {
    const field = optionalFields[key]
    if (field) updateParams[key] = field
  }
  const createReducer = spacetimedb.reducer({ name: createName }, createParams, (ctx, args) => {
    const typedArgs = args as CacheFieldValues<F> & Record<string, unknown>
    const table = tableAccessor(ctx.db)
    const argsRecord = typedArgs as Record<string, unknown>
    const keyValue = argsRecord[keyName] as Key
    const payload = {
      ...argsRecord,
      cachedAt: ctx.timestamp,
      createdAt: ctx.timestamp,
      id: 0,
      invalidatedAt: null,
      [keyName]: keyValue,
      updatedAt: ctx.timestamp
    } as Row
    table.insert(payload)
  })
  const updateReducer = spacetimedb.reducer({ name: updateName }, updateParams, (ctx, args) => {
    const typedArgs = args as Record<string, unknown> & UpdateArgs<F>
    const table = tableAccessor(ctx.db)
    const argsRecord = typedArgs as Record<string, unknown>
    const keyValue = argsRecord[keyName] as Key
    const pk = pkAccessor(table)
    const row = pk.find(keyValue)
    if (!row) throw makeError('NOT_FOUND', `${tableName}:update`)
    const patch = pickPatch(typedArgs, fieldNames)
    const merged = { ...patch, invalidatedAt: null }
    pk.update(applyPatch(row as unknown as Record<string, unknown>, merged, ctx.timestamp) as unknown as Row)
  })
  const rmReducer = spacetimedb.reducer({ name: rmName }, { [keyName]: keyField }, (ctx, args) => {
    const typedArgs = args as Record<string, unknown>
    const table = tableAccessor(ctx.db)
    const argsRecord = typedArgs
    const keyValue = argsRecord[keyName] as Key
    const pk = pkAccessor(table)
    const row = pk.find(keyValue)
    if (!row) throw makeError('NOT_FOUND', `${tableName}:rm`)
    const removed = pk.delete(keyValue)
    if (!removed) throw makeError('NOT_FOUND', `${tableName}:rm`)
  })
  const invalidateReducer = spacetimedb.reducer({ name: invalidateName }, { [keyName]: keyField }, (ctx, args) => {
    const typedArgs = args as Record<string, unknown>
    const table = tableAccessor(ctx.db)
    const argsRecord = typedArgs
    const keyValue = argsRecord[keyName] as Key
    const pk = pkAccessor(table)
    const row = pk.find(keyValue)
    if (!row) throw makeError('NOT_FOUND', `${tableName}:invalidate`)
    const nextRecord = {
      ...(row as unknown as Record<string, unknown>),
      invalidatedAt: ctx.timestamp,
      updatedAt: ctx.timestamp
    } as Row
    pk.update(nextRecord)
  })
  const purgeReducer = spacetimedb.reducer({ name: purgeName }, {}, ctx => {
    const table = tableAccessor(ctx.db)
    const pk = pkAccessor(table)
    const keysToDelete: Key[] = []
    for (const row of table) {
      const rowRecord = row as unknown as Record<string, unknown>
      const cachedAt = rowRecord.cachedAt as Timestamp
      if (isExpired(cachedAt, ctx.timestamp, ttl)) {
        const keyValue = rowRecord[keyName] as Key
        keysToDelete.push(keyValue)
      }
    }
    for (const key of keysToDelete) pk.delete(key)
  })
  const exportsRecord = {
    [createName]: createReducer,
    [invalidateName]: invalidateReducer,
    [purgeName]: purgeReducer,
    [rmName]: rmReducer,
    [updateName]: updateReducer
  } as unknown as CacheExports['exports']
  return {
    exports: exportsRecord
  }
}
export { makeCacheCrud }

import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, TypeBuilder } from 'spacetimedb/server'
import { identityEquals, makeError } from './reducer-utils'
interface PresenceConfig<
  DB,
  Id,
  Row extends PresenceRow<Id>,
  Tbl extends PresenceTableLike<Row>,
  Pk extends PresencePkLike<Row, Id>
> {
  dataField: TypeBuilder<unknown, AlgebraicTypeType>
  pk: (table: Tbl) => Pk
  roomIdField: TypeBuilder<unknown, AlgebraicTypeType>
  table: (db: DB) => Tbl
  tableName?: string
}
interface PresencePkLike<Row, Id> {
  delete: (id: Id) => boolean
  update: (row: Row) => Row
}
interface PresenceRow<Id> {
  data: string
  id: Id
  lastSeen: Timestamp
  roomId: string
  userId: Identity
}
interface PresenceTableLike<Row> {
  insert: (row: Row) => Row
  iter: () => Iterable<Row>
}
import { HEARTBEAT_INTERVAL_MS, PRESENCE_TTL_MS } from '@a/shared/server/presence'
const MICROS_PER_MILLISECOND = 1000n,
  ZERO_PREFIX_REGEX = /^0x/u,
  isAuthenticated = (sender: Identity): boolean => {
    const senderLike = sender as unknown as { toHexString?: () => string; toString?: () => string },
      raw = typeof senderLike.toHexString === 'function' ? senderLike.toHexString() : (senderLike.toString?.() ?? ''),
      normalized = raw.trim().toLowerCase().replace(ZERO_PREFIX_REGEX, '')
    if (!normalized) return false
    for (const ch of normalized) if (ch !== '0') return true
    return false
  },
  toMicros = (timestamp: Timestamp): bigint => {
    const value = timestamp as unknown as { microsSinceUnixEpoch?: bigint }
    return value.microsSinceUnixEpoch ?? 0n
  },
  findPresenceRow = <Id, Row extends PresenceRow<Id>>(
    rows: Iterable<Row>,
    roomId: string,
    sender: Identity
  ): null | Row => {
    for (const row of rows) if (row.roomId === roomId && identityEquals(row.userId, sender)) return row
    return null
  },
  upsertPresence = <Id, Row extends PresenceRow<Id>>({
    args,
    ctx,
    pk,
    table
  }: {
    args: { data?: string; roomId: string }
    ctx: { db: unknown; sender: Identity; timestamp: Timestamp }
    pk: PresencePkLike<Row, Id>
    table: PresenceTableLike<Row>
  }) => {
    const found = findPresenceRow(table.iter(), args.roomId, ctx.sender)
    if (found) {
      pk.update({ ...found, data: args.data ?? found.data, lastSeen: ctx.timestamp })
      return
    }
    table.insert({
      data: args.data ?? '{}',
      id: 0 as Id,
      lastSeen: ctx.timestamp,
      roomId: args.roomId,
      userId: ctx.sender
    } as Row)
  },
  /** Declares the presence tracking table. */
  presenceTable = <T>(presence: T): { presence: T } => ({ presence }),
  /** Generates heartbeat, leave, and cleanup reducers for presence tracking. */
  makePresence = <
    DB,
    Id,
    Row extends PresenceRow<Id>,
    Tbl extends PresenceTableLike<Row>,
    Pk extends PresencePkLike<Row, Id>
  >(
    spacetimedb: {
      reducer: (
        opts: { name: string },
        params: Record<string, TypeBuilder<unknown, AlgebraicTypeType>>,
        fn: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }, args: unknown) => void
      ) => unknown
    },
    config: PresenceConfig<DB, Id, Row, Tbl, Pk>
  ) => {
    const { dataField, pk: pkAccessor, roomIdField, table: tableAccessor, tableName = 'presence' } = config,
      heartbeatName = `presence_heartbeat_${tableName}`,
      leaveName = `presence_leave_${tableName}`,
      cleanupName = `presence_cleanup_${tableName}`,
      heartbeat = spacetimedb.reducer(
        { name: heartbeatName },
        { data: dataField.optional(), roomId: roomIdField },
        (ctx, args) => {
          const typedArgs = args as { data?: string; roomId: string }
          if (!isAuthenticated(ctx.sender)) throw makeError('NOT_AUTHENTICATED', `${tableName}:heartbeat`)
          const table = tableAccessor(ctx.db),
            pk = pkAccessor(table)
          upsertPresence<Id, Row>({ args: typedArgs, ctx, pk, table })
        }
      ),
      leave = spacetimedb.reducer({ name: leaveName }, { roomId: roomIdField }, (ctx, args) => {
        const typedArgs = args as { roomId: string }
        if (!isAuthenticated(ctx.sender)) throw makeError('NOT_AUTHENTICATED', `${tableName}:leave`)
        const table = tableAccessor(ctx.db),
          pk = pkAccessor(table)
        for (const row of table.iter())
          if (row.roomId === typedArgs.roomId && identityEquals(row.userId, ctx.sender)) {
            const removed = pk.delete(row.id)
            if (!removed) throw makeError('NOT_FOUND', `${tableName}:leave`)
            break
          }
      }),
      cleanup = spacetimedb.reducer({ name: cleanupName }, {}, ctx => {
        const table = tableAccessor(ctx.db),
          pk = pkAccessor(table),
          cutoffMicros = toMicros(ctx.timestamp) - BigInt(PRESENCE_TTL_MS) * MICROS_PER_MILLISECOND
        for (const row of table.iter())
          if (toMicros(row.lastSeen) < cutoffMicros && !pk.delete(row.id))
            throw makeError('NOT_FOUND', `${tableName}:cleanup`)
      }),
      exportsRecord = {
        [cleanupName]: cleanup,
        [heartbeatName]: heartbeat,
        [leaveName]: leave
      } as Record<string, unknown>
    return {
      exports: exportsRecord
    }
  }
export { HEARTBEAT_INTERVAL_MS, makePresence, PRESENCE_TTL_MS, presenceTable }

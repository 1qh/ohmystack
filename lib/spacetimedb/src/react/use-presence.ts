// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { HEARTBEAT_INTERVAL_MS } from '../server/presence'
interface PresenceHeartbeatArgs {
  data: Record<string, unknown>
}
interface PresenceRefs {
  data: PresenceRow[]
  heartbeat: (args?: PresenceHeartbeatArgs) => Promise<void>
}
interface PresenceRow {
  data: unknown
  lastSeen:
    | number
    | { __timestamp_micros_since_unix_epoch__?: bigint; microsSinceUnixEpoch?: bigint; toMillis?: () => bigint }
  roomId?: string
  userId: string
}
interface UsePresenceOptions {
  enabled?: boolean
  heartbeatIntervalMs?: number
  ttlMs?: number
}
interface UsePresenceResult {
  updatePresence: (data: Record<string, unknown>) => void
  users: PresenceRow[]
}
const PRESENCE_TTL_FALLBACK_MS = HEARTBEAT_INTERVAL_MS * 2,
  MICROS_PER_MILLISECOND = 1000n,
  runHeartbeat = ({
    data,
    heartbeat
  }: {
    data: Record<string, unknown>
    heartbeat: (args?: PresenceHeartbeatArgs) => Promise<void>
  }) => {
    const run = async () => {
      try {
        await heartbeat({ data })
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          '[@noboil/spacetimedb] Presence heartbeat failed — will retry on next interval. If this persists, check your SpacetimeDB connection:',
          error
        )
      }
    }
    run()
  },
  toMillis = (value: PresenceRow['lastSeen']): number => {
    if (typeof value === 'number') return value
    if (typeof value.toMillis === 'function') return Number(value.toMillis())
    if (typeof value.microsSinceUnixEpoch === 'bigint') return Number(value.microsSinceUnixEpoch / MICROS_PER_MILLISECOND)
    if (typeof value.__timestamp_micros_since_unix_epoch__ === 'bigint')
      return Number(value.__timestamp_micros_since_unix_epoch__ / MICROS_PER_MILLISECOND)
    return 0
  },
  /**
   * Tracks online users for a room by heartbeating and pruning stale rows.
   * @param data Presence rows from the subscription.
   * @param heartbeat Mutation that refreshes current user presence.
   * @param options Presence behavior overrides.
   * @returns Active users and an `updatePresence` helper.
   */
  usePresence = (
    data: PresenceRow[],
    heartbeat: (args?: PresenceHeartbeatArgs) => Promise<void>,
    options?: UsePresenceOptions
  ): UsePresenceResult => {
    const enabled = options?.enabled !== false,
      ttlMs = options?.ttlMs ?? PRESENCE_TTL_FALLBACK_MS,
      heartbeatIntervalMs = options?.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS,
      heartbeatRef = useRef(heartbeat),
      localDataRef = useRef<Record<string, unknown>>({})
    useEffect(() => {
      heartbeatRef.current = heartbeat
    }, [heartbeat])
    useEffect(() => {
      if (!enabled) return
      const sendHeartbeat = () =>
        runHeartbeat({
          data: localDataRef.current,
          heartbeat: heartbeatRef.current
        })
      sendHeartbeat()
      const intervalId = setInterval(() => {
        sendHeartbeat()
      }, heartbeatIntervalMs)
      return () => clearInterval(intervalId)
    }, [enabled, heartbeatIntervalMs])
    const users = useMemo(() => {
        if (!enabled) return []
        // eslint-disable-next-line react-hooks/purity
        const now = Date.now(),
          cutoff = now - ttlMs,
          filtered: PresenceRow[] = []
        for (const row of data)
          if (toMillis(row.lastSeen) >= cutoff)
            filtered.push({
              ...row,
              data: typeof row.data === 'string' ? (JSON.parse(row.data) as unknown) : row.data
            })
        return filtered
      }, [data, enabled, ttlMs]),
      updatePresence = useCallback((nextData: Record<string, unknown>) => {
        localDataRef.current = nextData
        runHeartbeat({
          data: localDataRef.current,
          heartbeat: heartbeatRef.current
        })
      }, [])
    return { updatePresence, users }
  }
type PresenceUser = PresenceRow
export type { PresenceHeartbeatArgs, PresenceRefs, PresenceRow, PresenceUser, UsePresenceOptions, UsePresenceResult }
export { usePresence }

'use client'

import type { FunctionReference } from 'convex/server'

import { useMutation, useQuery } from 'convex/react'
import { useCallback, useEffect, useRef } from 'react'

import { HEARTBEAT_INTERVAL_MS } from '../server/presence'

/** Convex function references required by usePresence: heartbeat mutation, leave mutation, and list query. */
interface PresenceRefs {
  heartbeat: FunctionReference<'mutation'>
  leave: FunctionReference<'mutation'>
  list: FunctionReference<'query'>
}
/** A user's presence entry with their ID, last seen timestamp, and optional custom data. */
interface PresenceUser {
  data: unknown
  lastSeen: number
  userId: string
}

/** Options for usePresence: optional custom data to broadcast and an enabled flag. */
interface UsePresenceOptions {
  data?: Record<string, unknown>
  enabled?: boolean
}

/** Return value of usePresence: the list of present users, plus leave and updatePresence callbacks. */
interface UsePresenceResult {
  leave: () => void
  updatePresence: (data: Record<string, unknown>) => void
  users: PresenceUser[]
}

/**
 * Tracks user presence in a room with periodic heartbeats and automatic cleanup on unmount.
 * @param refs Convex function references for heartbeat, leave, and list
 * @param roomId The room identifier to track presence in
 * @example
 * ```tsx
 * const { users, updatePresence } = usePresence(presenceRefs, chatId, { data: { cursor: { x, y } } })
 * ```
 */
const usePresence = (refs: PresenceRefs, roomId: string, options?: UsePresenceOptions): UsePresenceResult => {
  const enabled = options?.enabled !== false,
    heartbeatMut = useMutation(refs.heartbeat),
    leaveMut = useMutation(refs.leave),
    users = useQuery(refs.list, enabled ? { roomId } : 'skip') as PresenceUser[] | undefined,
    dataRef = useRef(options?.data),
    roomIdRef = useRef(roomId)

  useEffect(() => {
    dataRef.current = options?.data
    roomIdRef.current = roomId
  })

  useEffect(() => {
    if (!enabled) return
    const sendHeartbeat = () => {
      const args: Record<string, unknown> = { roomId: roomIdRef.current }
      if (dataRef.current !== undefined) args.data = dataRef.current
      // biome-ignore lint/nursery/noFloatingPromises: fire-and-forget heartbeat
      heartbeatMut(args)
    }
    sendHeartbeat()
    const id = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
    return () => {
      clearInterval(id)
      // biome-ignore lint/nursery/noFloatingPromises: fire-and-forget leave on cleanup
      leaveMut({ roomId: roomIdRef.current })
    }
  }, [enabled, heartbeatMut, leaveMut])

  const updatePresence = useCallback(
      (data: Record<string, unknown>) => {
        dataRef.current = data
        // biome-ignore lint/nursery/noFloatingPromises: fire-and-forget heartbeat
        heartbeatMut({ data, roomId: roomIdRef.current })
      },
      [heartbeatMut]
    ),
    leave = useCallback(() => {
      // biome-ignore lint/nursery/noFloatingPromises: fire-and-forget leave
      leaveMut({ roomId: roomIdRef.current })
    }, [leaveMut])

  return {
    leave,
    updatePresence,
    users: users ?? []
  }
}

export type { PresenceRefs, PresenceUser, UsePresenceOptions, UsePresenceResult }
export { usePresence }

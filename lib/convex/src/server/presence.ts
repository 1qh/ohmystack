import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { any, object, string } from 'zod/v4'

import type { Mb, MutCtx, Qb, Rec } from './types'

import { idx, indexFields, typed } from './bridge'

/** Interval in milliseconds between heartbeat pings for presence tracking. */
const HEARTBEAT_INTERVAL_MS = 15_000,
  /** Time-to-live in milliseconds after which a presence entry is considered stale. */
  PRESENCE_TTL_MS = 30_000,
  /**
   * Returns a Convex table definition for the presence table with room and user indexes.
   * @returns Object with a `presence` table definition
   */
  presenceTable = () => ({
    presence: defineTable({
      data: v.optional(v.any()),
      lastSeen: v.number(),
      roomId: v.string(),
      userId: v.id('users')
    })
      .index('by_room', indexFields('roomId'))
      .index('by_room_user', indexFields('roomId', 'userId'))
  }),
  /**
   * Creates presence tracking endpoints: heartbeat, list active users, and leave.
   * @param builders - Object with authenticated mutation (m) and query (q) builders
   * @returns Object with heartbeat, list, and leave endpoints
   */
  makePresence = ({ m, q }: { m: Mb; q: Qb }) => {
    const heartbeat = m({
        args: object({ data: any().optional(), roomId: string() }),
        handler: typed(async (ctx: MutCtx, { data, roomId }: { data?: unknown; roomId: string }) => {
          const userId = ctx.user._id as string,
            existing = await ctx.db
              .query('presence')
              .withIndex(
                'by_room_user',
                idx(ib => ib.eq('roomId', roomId).eq('userId', userId))
              )
              .unique(),
            now = Date.now()
          if (existing) {
            const patch: Rec = { lastSeen: now }
            if (data !== undefined) patch.data = data
            await ctx.db.patch(existing._id as string, patch)
          } else
            await ctx.db.insert('presence', {
              data: data ?? null,
              lastSeen: now,
              roomId,
              userId
            })
        })
      }),
      list = q({
        args: object({ roomId: string() }),
        handler: typed(async (ctx: MutCtx, { roomId }: { roomId: string }) => {
          const cutoff = Date.now() - PRESENCE_TTL_MS,
            docs = await ctx.db
              .query('presence')
              .withIndex(
                'by_room',
                idx(ib => ib.eq('roomId', roomId))
              )
              .collect(),
            result: { data: unknown; lastSeen: number; userId: string }[] = []
          for (const d of docs)
            if ((d.lastSeen as number) >= cutoff)
              result.push({
                data: d.data,
                lastSeen: d.lastSeen as number,
                userId: d.userId as string
              })

          return result
        })
      }),
      leave = m({
        args: object({ roomId: string() }),
        handler: typed(async (ctx: MutCtx, { roomId }: { roomId: string }) => {
          const userId = ctx.user._id as string,
            existing = await ctx.db
              .query('presence')
              .withIndex(
                'by_room_user',
                idx(ib => ib.eq('roomId', roomId).eq('userId', userId))
              )
              .unique()
          if (existing) await ctx.db.delete(existing._id as string)
        })
      })
    return { heartbeat, leave, list }
  }

export { HEARTBEAT_INTERVAL_MS, makePresence, PRESENCE_TTL_MS, presenceTable }

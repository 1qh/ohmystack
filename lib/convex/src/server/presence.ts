import { HEARTBEAT_INTERVAL_MS, PRESENCE_TTL_MS } from '@noboil/shared/server/presence'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { any, object, string } from 'zod/v4'
import type { Mb, MutCtx, Qb, Rec } from './types'
import { idx, indexFields, typed } from './bridge'
const presenceTable = () => ({
  presence: defineTable({
    data: v.optional(v.any()),
    lastSeen: v.number(),
    roomId: v.string(),
    userId: v.id('users')
  })
    .index('by_room', indexFields('roomId'))
    .index('by_room_user', indexFields('roomId', 'userId'))
})
/**
 * Creates presence tracking endpoints: heartbeat, list active users, and leave.
 * @param builders - Object with authenticated mutation (m) and query (q) builders
 * @returns Object with heartbeat, list, and leave endpoints
 */
const makePresence = ({ m, q }: { m: Mb; q: Qb }) => {
  const heartbeat = m({
    args: object({ data: any().optional(), roomId: string() }),
    handler: typed(async (ctx: MutCtx, { data, roomId }: { data?: unknown; roomId: string }) => {
      const userId = ctx.user._id as string
      const existing = await ctx.db
        .query('presence')
        .withIndex(
          'by_room_user',
          idx(ib => ib.eq('roomId', roomId).eq('userId', userId))
        )
        .unique()
      const now = Date.now()
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
  })
  const list = q({
    args: object({ roomId: string() }),
    handler: typed(async (ctx: MutCtx, { roomId }: { roomId: string }) => {
      const cutoff = Date.now() - PRESENCE_TTL_MS
      const docs = await ctx.db
        .query('presence')
        .withIndex(
          'by_room',
          idx(ib => ib.eq('roomId', roomId))
        )
        .collect()
      const result: { data: unknown; lastSeen: number; userId: string }[] = []
      for (const d of docs)
        if ((d.lastSeen as number) >= cutoff)
          result.push({
            data: d.data,
            lastSeen: d.lastSeen as number,
            userId: d.userId as string
          })
      return result
    })
  })
  const leave = m({
    args: object({ roomId: string() }),
    handler: typed(async (ctx: MutCtx, { roomId }: { roomId: string }) => {
      const userId = ctx.user._id as string
      const existing = await ctx.db
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

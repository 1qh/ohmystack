import { zid } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'

import { q } from '../lazy'
import { internalMutation } from './_generated/server'

const syncOwned = internalMutation({
    args: {
      sessionId: v.id('session'),
      todos: v.array(
        v.object({
          content: v.string(),
          id: v.optional(v.id('todos')),
          position: v.number(),
          priority: v.union(v.literal('high'), v.literal('medium'), v.literal('low')),
          status: v.union(v.literal('pending'), v.literal('in_progress'), v.literal('completed'), v.literal('cancelled'))
        })
      )
    },
    handler: async (ctx, { sessionId, todos }) => {
      const session = await ctx.db.get(sessionId)
      if (!session) throw new Error('session_not_found')
      for (const t of todos)
        if (t.id) {
          /** biome-ignore lint/performance/noAwaitInLoops: sequential upserts */
          const existing = await ctx.db.get(t.id)
          if (existing?.sessionId === sessionId)
            await ctx.db.patch(t.id, {
              content: t.content,
              position: t.position,
              priority: t.priority,
              status: t.status
            })
          else
            await ctx.db.insert('todos', {
              content: t.content,
              position: t.position,
              priority: t.priority,
              sessionId,
              status: t.status
            })
        } else
          await ctx.db.insert('todos', {
            content: t.content,
            position: t.position,
            priority: t.priority,
            sessionId,
            status: t.status
          })

      return { updated: todos.length }
    }
  }),
  listTodos = q({
    args: { sessionId: zid('session') },
    handler: async (ctx, { sessionId }) => {
      const session = await ctx.db.get(sessionId)
      if (session?.userId !== ctx.user._id) return []
      return ctx.db
        .query('todos')
        .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
        .collect()
    }
  })

export { listTodos, syncOwned }

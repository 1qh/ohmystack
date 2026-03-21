import { zid } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import { q } from '../lazy'
import { internalMutation } from './_generated/server'
const recordModelUsage = internalMutation({
    args: {
      agentName: v.string(),
      inputTokens: v.number(),
      model: v.string(),
      outputTokens: v.number(),
      provider: v.string(),
      sessionId: v.optional(v.id('session')),
      threadId: v.string(),
      totalTokens: v.number()
    },
    handler: async (ctx, { agentName, inputTokens, model, outputTokens, provider, sessionId, threadId, totalTokens }) => {
      let resolvedSessionId = sessionId
      if (!resolvedSessionId) {
        const session = await ctx.db
          .query('session')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
        if (session) resolvedSessionId = session._id
      }
      if (!resolvedSessionId) {
        const taskPromise = ctx.db
            .query('tasks')
            .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
            .first(),
          task = await taskPromise
        if (task) resolvedSessionId = task.sessionId
      }
      if (!resolvedSessionId) return null
      return ctx.db.insert('tokenUsage', {
        agentName,
        inputTokens,
        model,
        outputTokens,
        provider,
        sessionId: resolvedSessionId,
        threadId,
        totalTokens
      })
    }
  }),
  getTokenUsage = q({
    args: { sessionId: zid('session') },
    handler: async (ctx, { sessionId }) => {
      const session = await ctx.db.get(sessionId)
      if (session?.userId !== ctx.user._id) return { count: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      const rows = await ctx.db
        .query('tokenUsage')
        .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
        .collect()
      let inputTokens = 0,
        outputTokens = 0,
        totalTokens = 0
      for (const r of rows) {
        inputTokens += r.inputTokens
        outputTokens += r.outputTokens
        totalTokens += r.totalTokens
      }
      return { count: rows.length, inputTokens, outputTokens, totalTokens }
    }
  })
export { getTokenUsage, recordModelUsage }

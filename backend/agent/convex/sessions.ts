import { zid } from 'convex-helpers/server/zod4'
import { string } from 'zod/v4'

import { m, q } from '../lazy'

const createSession = m({
    args: { title: string().optional() },
    handler: async (ctx, { title }) => {
      const threadId = crypto.randomUUID(),
        sessionId = await ctx.db.insert('session', {
          lastActivityAt: Date.now(),
          status: 'active',
          threadId,
          title,
          updatedAt: Date.now(),
          userId: ctx.user._id as never
        })
      await ctx.db.insert('threadRunState', {
        autoContinueStreak: 0,
        consecutiveFailures: 0,
        stagnationCount: 0,
        status: 'idle',
        threadId,
        turnsSinceTaskTool: 0
      })
      return { sessionId, threadId }
    }
  }),
  listSessions = q({
    args: {},
    handler: async ctx => {
      const sessions = await ctx.db
          .query('session')
          .withIndex('by_user_status', idx => idx.eq('userId', ctx.user._id as never))
          .collect(),
        active: typeof sessions = []
      for (const s of sessions) if (s.status !== 'archived') active.push(s)

      return active
    }
  }),
  getSession = q({
    args: { sessionId: zid('session') },
    handler: async (ctx, { sessionId }) => {
      const session = await ctx.db.get(sessionId)
      if (session?.userId !== ctx.user._id) return null
      return session
    }
  }),
  archiveSession = m({
    args: { sessionId: zid('session') },
    handler: async (ctx, { sessionId }) => {
      const session = await ctx.db.get(sessionId)
      if (session?.userId !== ctx.user._id) throw new Error('session_not_found')
      if (session.status === 'archived') return
      await ctx.db.patch(sessionId, {
        archivedAt: Date.now(),
        status: 'archived',
        updatedAt: Date.now()
      })
      const runState = await ctx.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', session.threadId))
        .unique()
      if (runState)
        await ctx.db.patch(runState._id, {
          queuedPriority: undefined,
          queuedPromptMessageId: undefined,
          queuedReason: undefined
        })
    }
  })

export { archiveSession, createSession, getSession, listSessions }

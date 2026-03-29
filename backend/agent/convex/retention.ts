/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB mutations */
import { internalMutation } from './_generated/server'
const DAY_MS = 24 * 60 * 60 * 1000,
  ARCHIVE_AFTER_MS = 7 * DAY_MS,
  IDLE_AFTER_MS = DAY_MS,
  RETENTION_MS = 180 * DAY_MS,
  MAX_BATCH = 100,
  MAX_SESSIONS_PER_CLEANUP = 10,
  archiveIdleSessions = internalMutation({
    args: {},
    handler: async ctx => {
      const now = Date.now(),
        idleBefore = now - IDLE_AFTER_MS,
        archiveBefore = now - ARCHIVE_AFTER_MS,
        activeSessions = await ctx.db
          .query('session')
          .withIndex('by_status', idx => idx.eq('status', 'active'))
          .take(MAX_BATCH),
        idleSessions = await ctx.db
          .query('session')
          .withIndex('by_status', idx => idx.eq('status', 'idle'))
          .take(MAX_BATCH)
      for (const s of activeSessions)
        if (s.lastActivityAt < idleBefore)
          await ctx.db.patch(s._id, {
            status: 'idle',
            updatedAt: now
          })
      for (const s of idleSessions)
        if (s.lastActivityAt < archiveBefore) {
          await ctx.db.patch(s._id, {
            archivedAt: now,
            status: 'archived',
            updatedAt: now
          })
          const runState = await ctx.db
            .query('threadRunState')
            .withIndex('by_threadId', idx => idx.eq('threadId', s.threadId))
            .unique()
          if (runState)
            await ctx.db.patch(runState._id, {
              queuedPriority: undefined,
              queuedPromptMessageId: undefined,
              queuedReason: undefined
            })
        }
    }
  }),
  cleanupArchivedSessions = internalMutation({
    args: {},
    handler: async ctx => {
      const now = Date.now(),
        deleteBefore = now - RETENTION_MS,
        archivedSessions = await ctx.db
          .query('session')
          .withIndex('by_status', idx => idx.eq('status', 'archived'))
          .take(MAX_SESSIONS_PER_CLEANUP)
      let deletedCount = 0
      for (const s of archivedSessions)
        if (deletedCount < MAX_SESSIONS_PER_CLEANUP && s.archivedAt && s.archivedAt < deleteBefore) {
          const tokenUsages = await ctx.db
              .query('tokenUsage')
              .withIndex('by_session', idx => idx.eq('sessionId', s._id))
              .take(MAX_BATCH),
            todos = await ctx.db
              .query('todos')
              .withIndex('by_session_position', idx => idx.eq('sessionId', s._id))
              .take(MAX_BATCH),
            sessionMessages = await ctx.db
              .query('messages')
              .withIndex('by_threadId', idx => idx.eq('threadId', s.threadId))
              .take(MAX_BATCH),
            tasks = await ctx.db
              .query('tasks')
              .withIndex('by_session', idx => idx.eq('sessionId', s._id))
              .take(MAX_BATCH),
            runState = await ctx.db
              .query('threadRunState')
              .withIndex('by_threadId', idx => idx.eq('threadId', s.threadId))
              .unique()
          await Promise.all(tokenUsages.map(async u => ctx.db.delete(u._id)))
          await Promise.all(todos.map(async t => ctx.db.delete(t._id)))
          await Promise.all(sessionMessages.map(async m => ctx.db.delete(m._id)))
          await Promise.all(
            tasks.map(async t => {
              const workerMessages = await ctx.db
                .query('messages')
                .withIndex('by_threadId', idx => idx.eq('threadId', t.threadId))
                .take(MAX_BATCH)
              await Promise.all(workerMessages.map(async m => ctx.db.delete(m._id)))
              await ctx.db.delete(t._id)
            })
          )
          if (runState) await ctx.db.delete(runState._id)
          await ctx.db.delete(s._id)
          deletedCount += 1
        }
      return { deletedCount }
    }
  })
export { archiveIdleSessions, cleanupArchivedSessions }

/* eslint-disable no-await-in-loop, max-depth */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB mutations */
import { internalMutation } from './_generated/server'
import { buildTaskTerminalReminder, maybeContinueOrchestratorInline } from './tasks'
const MAX_BATCH = 100
const FIVE_MINUTES_MS = 5 * 60 * 1000
const INTERRUPTED_RESULT = 'Interrupted: agent run terminated before tool completion'
const INTERRUPTED_TEXT = '[Message interrupted]'
const timeoutStaleTasks = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now()
    const staleBefore = now - FIVE_MINUTES_MS
    const runningTasks = await ctx.db
      .query('tasks')
      .withIndex('by_status', idx => idx.eq('status', 'running'))
      .take(MAX_BATCH)
    const pendingTasks = await ctx.db
      .query('tasks')
      .withIndex('by_status', idx => idx.eq('status', 'pending'))
      .take(MAX_BATCH)
    let timedOutCount = 0
    for (const t of runningTasks)
      if (t.heartbeatAt && t.heartbeatAt < staleBefore) {
        const reminder = buildTaskTerminalReminder({
          description: t.description,
          status: 'timed_out',
          taskId: String(t._id)
        })
        const reminderMessageId = await ctx.db.insert('messages', {
          content: reminder,
          isComplete: true,
          parts: [{ text: reminder, type: 'text' }],
          role: 'system',
          sessionId: t.sessionId,
          threadId: t.parentThreadId
        })
        await ctx.db.patch(t._id, {
          completedAt: now,
          completionReminderMessageId: String(reminderMessageId),
          status: 'timed_out'
        })
        await maybeContinueOrchestratorInline({
          ctx,
          taskId: t._id
        })
        timedOutCount += 1
      }
    for (const t of pendingTasks)
      if (t.pendingAt && t.pendingAt < staleBefore) {
        const reminder = buildTaskTerminalReminder({
          description: t.description,
          status: 'timed_out',
          taskId: String(t._id)
        })
        const reminderMessageId = await ctx.db.insert('messages', {
          content: reminder,
          isComplete: true,
          parts: [{ text: reminder, type: 'text' }],
          role: 'system',
          sessionId: t.sessionId,
          threadId: t.parentThreadId
        })
        await ctx.db.patch(t._id, {
          completedAt: now,
          completionReminderMessageId: String(reminderMessageId),
          status: 'timed_out'
        })
        await maybeContinueOrchestratorInline({
          ctx,
          taskId: t._id
        })
        timedOutCount += 1
      }
    return { timedOutCount }
  }
})
const cleanupStaleMessages = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now()
    const staleBefore = now - FIVE_MINUTES_MS
    const idleStates = await ctx.db
      .query('threadRunState')
      .withIndex('by_status', idx => idx.eq('status', 'idle'))
      .take(MAX_BATCH)
    let cleanedCount = 0
    for (const s of idleStates) {
      const messages = await ctx.db
        .query('messages')
        .withIndex('by_threadId', idx => idx.eq('threadId', s.threadId))
        .take(MAX_BATCH)
      for (const m of messages)
        if (!m.isComplete && m._creationTime < staleBefore) {
          const nextContent = m.streamingContent && m.streamingContent.length > 0 ? m.streamingContent : INTERRUPTED_TEXT
          const nextParts: typeof m.parts = []
          for (const p of m.parts)
            if (p.type === 'tool-call' && p.status === 'pending')
              nextParts.push({
                args: p.args,
                result: INTERRUPTED_RESULT,
                status: 'error',
                toolCallId: p.toolCallId,
                toolName: p.toolName,
                type: 'tool-call'
              })
            else nextParts.push(p)
          await ctx.db.patch(m._id, {
            content: nextContent,
            isComplete: true,
            parts: nextParts,
            streamingContent: undefined
          })
          cleanedCount += 1
        }
    }
    return { cleanedCount }
  }
})
export { cleanupStaleMessages, timeoutStaleTasks }

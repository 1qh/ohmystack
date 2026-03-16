import { zid } from 'convex-helpers/server/zod4'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

import { q } from '../lazy'
import { internalMutation } from './_generated/server'
import { enforceRateLimit } from './rateLimit'

const runWorkerRef = makeFunctionReference<'action', { prompt: string; taskId: Id<'tasks'>; threadId: string }, undefined>(
    'agentsNode:runWorker'
  ),
  buildTaskCompletionReminder = ({ description, taskId }: { description: string; taskId: string }) =>
    [
      '<system-reminder>',
      '[BACKGROUND TASK COMPLETED]',
      `Task ID: ${taskId}`,
      `Description: ${description}`,
      'Review the worker result and continue the parent conversation.',
      '</system-reminder>'
    ].join('\n'),
  buildTaskTerminalReminder = ({
    description,
    error,
    status,
    taskId
  }: {
    description: string
    error?: string
    status: 'failed' | 'timed_out'
    taskId: string
  }) => {
    const prefix = status === 'failed' ? '[BACKGROUND TASK FAILED]' : '[BACKGROUND TASK TIMED OUT]'
    return [
      '<system-reminder>',
      prefix,
      `Task ID: ${taskId}`,
      `Description: ${description}`,
      error ? `Error: ${error}` : '',
      'The task did not complete successfully. Decide whether to retry via delegate or inform the user.',
      '</system-reminder>'
    ]
      .filter(Boolean)
      .join('\n')
  },
  maybeContinueOrchestratorInline = async ({ ctx, taskId }: { ctx: Pick<MutationCtx, 'db'>; taskId: Id<'tasks'> }) => {
    const task = await ctx.db.get(taskId)
    if (!task?.completionReminderMessageId) return { ok: false }
    const session = await ctx.db.get(task.sessionId)
    if (!session || session.status === 'archived') return { ok: false }
    await ctx.db.patch(taskId, { continuationEnqueuedAt: Date.now() })
    return { ok: true }
  },
  spawnTask = internalMutation({
    args: {
      description: v.string(),
      isBackground: v.boolean(),
      parentThreadId: v.string(),
      prompt: v.string(),
      sessionId: v.id('session')
    },
    handler: async (ctx, { description, isBackground, parentThreadId, prompt, sessionId }) => {
      const session = await ctx.db.get(sessionId)
      if (!session || session.status === 'archived') throw new Error('session_not_found')
      await enforceRateLimit({
        ctx,
        key: String(session.userId),
        name: 'delegation'
      })
      const threadId = crypto.randomUUID(),
        taskId = await ctx.db.insert('tasks', {
          description,
          isBackground,
          parentThreadId,
          pendingAt: Date.now(),
          prompt,
          retryCount: 0,
          sessionId,
          status: 'pending',
          threadId
        })
      await ctx.scheduler.runAfter(0, runWorkerRef, {
        prompt,
        taskId,
        threadId
      })
      return { taskId, threadId }
    }
  }),
  markRunning = internalMutation({
    args: { taskId: v.id('tasks') },
    handler: async (ctx, { taskId }) => {
      const task = await ctx.db.get(taskId)
      if (task?.status !== 'pending') return { ok: false }
      const session = await ctx.db.get(task.sessionId)
      if (!session || session.status === 'archived') return { ok: false }
      const now = Date.now()
      await ctx.db.patch(taskId, {
        heartbeatAt: now,
        startedAt: now,
        status: 'running'
      })
      return { ok: true }
    }
  }),
  completeTask = internalMutation({
    args: { result: v.string(), taskId: v.id('tasks') },
    handler: async (ctx, { result, taskId }) => {
      const task = await ctx.db.get(taskId)
      if (task?.status !== 'running') return { ok: false }
      const reminder = buildTaskCompletionReminder({ description: task.description, taskId: String(taskId) }),
        reminderMessageId = await ctx.db.insert('messages', {
          content: reminder,
          isComplete: true,
          parts: [{ text: reminder, type: 'text' }],
          role: 'system',
          sessionId: task.sessionId,
          threadId: task.parentThreadId
        })
      await ctx.db.patch(taskId, {
        completedAt: Date.now(),
        completionReminderMessageId: String(reminderMessageId),
        result,
        status: 'completed'
      })
      await maybeContinueOrchestratorInline({ ctx, taskId })
      return { ok: true }
    }
  }),
  failTask = internalMutation({
    args: { lastError: v.string(), taskId: v.id('tasks') },
    handler: async (ctx, { lastError, taskId }) => {
      const task = await ctx.db.get(taskId)
      if (task?.status !== 'running') return { ok: false }
      const reminder = buildTaskTerminalReminder({
          description: task.description,
          error: lastError,
          status: 'failed',
          taskId: String(taskId)
        }),
        reminderMessageId = await ctx.db.insert('messages', {
          content: reminder,
          isComplete: true,
          parts: [{ text: reminder, type: 'text' }],
          role: 'system',
          sessionId: task.sessionId,
          threadId: task.parentThreadId
        })
      await ctx.db.patch(taskId, {
        completedAt: Date.now(),
        completionReminderMessageId: String(reminderMessageId),
        lastError,
        status: 'failed'
      })
      await maybeContinueOrchestratorInline({ ctx, taskId })
      return { ok: true }
    }
  }),
  scheduleRetry = internalMutation({
    args: { taskId: v.id('tasks') },
    handler: async (ctx, { taskId }) => {
      const task = await ctx.db.get(taskId)
      if (task?.status !== 'running') return { ok: false }
      const session = await ctx.db.get(task.sessionId)
      if (!session || session.status === 'archived') {
        await ctx.db.patch(taskId, {
          lastError: 'session_archived',
          status: 'cancelled'
        })
        return { ok: false }
      }
      if (task.retryCount >= 3) return { ok: false }
      const retryCount = task.retryCount + 1,
        delayMs = Math.min(1000 * 2 ** retryCount, 30_000)
      await ctx.db.patch(taskId, {
        pendingAt: Date.now(),
        retryCount,
        status: 'pending'
      })
      await ctx.scheduler.runAfter(delayMs, runWorkerRef, {
        prompt: task.prompt ?? task.description,
        taskId,
        threadId: task.threadId
      })
      return { ok: true }
    }
  }),
  updateTaskHeartbeat = internalMutation({
    args: { taskId: v.id('tasks') },
    handler: async (ctx, { taskId }) => {
      const task = await ctx.db.get(taskId)
      if (!task) return
      await ctx.db.patch(taskId, { heartbeatAt: Date.now() })
    }
  }),
  maybeContinueOrchestrator = internalMutation({
    args: { taskId: v.id('tasks') },
    handler: async (ctx, { taskId }) => maybeContinueOrchestratorInline({ ctx, taskId })
  }),
  listTasks = q({
    args: { sessionId: zid('session') },
    handler: async (ctx, { sessionId }) => {
      const session = await ctx.db.get(sessionId)
      if (session?.userId !== ctx.user._id) return []
      return ctx.db
        .query('tasks')
        .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
        .collect()
    }
  }),
  getOwnedTaskStatus = q({
    args: { taskId: zid('tasks') },
    handler: async (ctx, { taskId }) => {
      const task = await ctx.db.get(taskId)
      if (!task) return null
      const session = await ctx.db.get(task.sessionId)
      if (session?.userId !== ctx.user._id) return null
      return task
    }
  })

export {
  buildTaskCompletionReminder,
  buildTaskTerminalReminder,
  completeTask,
  failTask,
  getOwnedTaskStatus,
  listTasks,
  markRunning,
  maybeContinueOrchestrator,
  maybeContinueOrchestratorInline,
  scheduleRetry,
  spawnTask,
  updateTaskHeartbeat
}

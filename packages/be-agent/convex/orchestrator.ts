import { zid } from 'convex-helpers/server/zod4'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { string } from 'zod/v4'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

import { m } from '../lazy'
import { internalMutation, internalQuery } from './_generated/server'

const reasonPriority = {
    task_completion: 1,
    todo_continuation: 0,
    user_message: 2
  } as const,
  messagePartValidator = v.union(
    v.object({ text: v.string(), type: v.literal('text') }),
    v.object({ text: v.string(), type: v.literal('reasoning') }),
    v.object({
      args: v.string(),
      result: v.optional(v.string()),
      status: v.union(v.literal('pending'), v.literal('success'), v.literal('error')),
      toolCallId: v.string(),
      toolName: v.string(),
      type: v.literal('tool-call')
    }),
    v.object({ snippet: v.optional(v.string()), title: v.string(), type: v.literal('source'), url: v.string() })
  ),
  runOrchestratorRef = makeFunctionReference<
    'action',
    { promptMessageId?: string; runToken: string; threadId: string },
    undefined
  >('orchestratorNode:runOrchestrator'),
  CLAIMED_STALE_MS = 15 * 60 * 1000,
  UNCLAIMED_STALE_MS = 5 * 60 * 1000,
  WALL_CLOCK_TIMEOUT_MS = 15 * 60 * 1000

type EnqueueContext = Pick<MutationCtx, 'db' | 'scheduler'>
type RunReason = 'task_completion' | 'todo_continuation' | 'user_message'
type RunStateDoc = Doc<'threadRunState'>

const readRunStateByThreadId = async ({ ctx, threadId }: { ctx: Pick<MutationCtx, 'db'>; threadId: string }) =>
    ctx.db
      .query('threadRunState')
      .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
      .unique(),
  getQueuedPriority = ({ state }: { state: RunStateDoc }) => {
    if (!state.queuedReason) return -1
    if (state.queuedPriority) return reasonPriority[state.queuedPriority]
    if (state.queuedReason === 'user_message') return 2
    if (state.queuedReason === 'task_completion') return 1
    return 0
  },
  createRunState = async ({ ctx, threadId }: { ctx: Pick<MutationCtx, 'db'>; threadId: string }) => {
    const id = await ctx.db.insert('threadRunState', {
      autoContinueStreak: 0,
      status: 'idle',
      threadId
    })
    return ctx.db.get(id)
  },
  ensureRunStateInline = async ({ ctx, threadId }: { ctx: Pick<MutationCtx, 'db'>; threadId: string }) => {
    const existing = await readRunStateByThreadId({ ctx, threadId })
    if (existing) return existing
    try {
      const created = await createRunState({ ctx, threadId })
      if (!created) throw new Error('run_state_not_found')
      return created
    } catch (error) {
      const retried = await readRunStateByThreadId({ ctx, threadId })
      if (retried) return retried
      throw error
    }
  },
  resolveSessionByThreadId = async ({ ctx, threadId }: { ctx: Pick<MutationCtx, 'db'>; threadId: string }) =>
    ctx.db
      .query('session')
      .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
      .unique(),
  enqueueRunInline = async ({
    ctx,
    incrementStreak,
    priority,
    promptMessageId,
    reason,
    threadId
  }: {
    ctx: EnqueueContext
    incrementStreak?: boolean
    priority: number
    promptMessageId?: string
    reason: RunReason
    threadId: string
  }) => {
    const state = await ensureRunStateInline({ ctx, threadId }),
      shouldIncrement = incrementStreak === true
    if (shouldIncrement && state.autoContinueStreak >= 5)
      return { ok: false, reason: 'streak_cap' as const, scheduled: false }
    let nextStreak = state.autoContinueStreak
    if (reason === 'user_message') nextStreak = 0
    if (shouldIncrement) nextStreak += 1
    if (state.status === 'idle') {
      const runToken = crypto.randomUUID()
      await ctx.scheduler.runAfter(0, runOrchestratorRef, { promptMessageId, runToken, threadId })
      await ctx.db.patch(state._id, {
        activatedAt: Date.now(),
        activeRunToken: runToken,
        autoContinueStreak: nextStreak,
        claimedAt: undefined,
        queuedPriority: undefined,
        queuedPromptMessageId: undefined,
        queuedReason: undefined,
        runClaimed: false,
        runHeartbeatAt: undefined,
        status: 'active'
      })
      return { ok: true, scheduled: true }
    }
    const incomingPriority = priority,
      queuedPriority = getQueuedPriority({ state })
    if (incomingPriority < queuedPriority) return { ok: false, reason: 'lower_priority' as const, scheduled: false }
    await ctx.db.patch(state._id, {
      autoContinueStreak: nextStreak,
      queuedPriority: reason,
      queuedPromptMessageId: promptMessageId,
      queuedReason: reason
    })
    return { ok: true, scheduled: false }
  },
  buildTodoReminder = ({ todos }: { todos: Doc<'todos'>[] }) => {
    const lines = ['<system-reminder>', '[TODO CONTINUATION]', 'Incomplete tasks remain:', '']
    for (const t of todos)
      if (!(t.status === 'completed' || t.status === 'cancelled'))
        lines.push(`- [${t.status}] (${t.priority}) ${t.content}`)

    lines.push('', 'Continue working on the next pending task.', '</system-reminder>')
    return lines.join('\n')
  },
  ensureRunState = internalMutation({
    args: { threadId: v.string() },
    handler: async (ctx, { threadId }) => ensureRunStateInline({ ctx, threadId })
  }),
  enqueueRun = internalMutation({
    args: {
      incrementStreak: v.optional(v.boolean()),
      priority: v.union(v.literal(0), v.literal(1), v.literal(2)),
      promptMessageId: v.optional(v.string()),
      reason: v.union(v.literal('user_message'), v.literal('task_completion'), v.literal('todo_continuation')),
      threadId: v.string()
    },
    handler: async (ctx, args) =>
      enqueueRunInline({
        ctx,
        incrementStreak: args.incrementStreak,
        priority: args.priority,
        promptMessageId: args.promptMessageId,
        reason: args.reason,
        threadId: args.threadId
      })
  }),
  claimRun = internalMutation({
    args: { runToken: v.string(), threadId: v.string() },
    handler: async (ctx, { runToken, threadId }) => {
      const state = await ensureRunStateInline({ ctx, threadId })
      if (state.status !== 'active') return { ok: false }
      if (state.activeRunToken !== runToken) return { ok: false }
      if (state.runClaimed === true) return { ok: false }
      const now = Date.now()
      await ctx.db.patch(state._id, {
        claimedAt: now,
        runClaimed: true,
        runHeartbeatAt: now
      })
      return { ok: true }
    }
  }),
  finishRun = internalMutation({
    args: { runToken: v.string(), threadId: v.string() },
    handler: async (ctx, { runToken, threadId }) => {
      const state = await ensureRunStateInline({ ctx, threadId })
      if (state.activeRunToken !== runToken) return { scheduled: false }
      const { queuedPromptMessageId } = state
      if (queuedPromptMessageId) {
        const session = await resolveSessionByThreadId({ ctx, threadId })
        if (session?.status === 'archived') {
          await ctx.db.patch(state._id, {
            activatedAt: undefined,
            activeRunToken: undefined,
            claimedAt: undefined,
            queuedPriority: undefined,
            queuedPromptMessageId: undefined,
            queuedReason: undefined,
            runClaimed: undefined,
            runHeartbeatAt: undefined,
            status: 'idle'
          })
          return { scheduled: false }
        }
        const nextRunToken = crypto.randomUUID()
        await ctx.scheduler.runAfter(0, runOrchestratorRef, {
          promptMessageId: queuedPromptMessageId,
          runToken: nextRunToken,
          threadId
        })
        await ctx.db.patch(state._id, {
          activatedAt: Date.now(),
          activeRunToken: nextRunToken,
          claimedAt: undefined,
          queuedPriority: undefined,
          queuedPromptMessageId: undefined,
          queuedReason: undefined,
          runClaimed: false,
          runHeartbeatAt: undefined,
          status: 'active'
        })
        return { scheduled: true }
      }
      await ctx.db.patch(state._id, {
        activatedAt: undefined,
        activeRunToken: undefined,
        claimedAt: undefined,
        queuedPriority: undefined,
        queuedPromptMessageId: undefined,
        queuedReason: undefined,
        runClaimed: undefined,
        runHeartbeatAt: undefined,
        status: 'idle'
      })
      return { scheduled: false }
    }
  }),
  heartbeatRun = internalMutation({
    args: { runToken: v.string(), threadId: v.string() },
    handler: async (ctx, { runToken, threadId }) => {
      const state = await readRunStateByThreadId({ ctx, threadId })
      if (state?.activeRunToken !== runToken) return
      await ctx.db.patch(state._id, { runHeartbeatAt: Date.now() })
    }
  }),
  postTurnAuditFenced = internalMutation({
    args: { runToken: v.string(), threadId: v.string(), turnRequestedInput: v.boolean() },
    handler: async (ctx, { runToken, threadId, turnRequestedInput }) => {
      const state = await ensureRunStateInline({ ctx, threadId })
      if (state.status !== 'active') return { ok: false, shouldContinue: false }
      if (state.activeRunToken !== runToken) return { ok: false, shouldContinue: false }
      const session = await resolveSessionByThreadId({ ctx, threadId })
      if (!session || session.status === 'archived') {
        await ctx.db.patch(state._id, { autoContinueStreak: 0 })
        return { ok: true, shouldContinue: false }
      }
      const todos = await ctx.db
          .query('todos')
          .withIndex('by_session_position', idx => idx.eq('sessionId', session._id))
          .collect(),
        pendingTasks = await ctx.db
          .query('tasks')
          .withIndex('by_parentThreadId_status', idx => idx.eq('parentThreadId', threadId).eq('status', 'pending'))
          .collect(),
        runningTasks = await ctx.db
          .query('tasks')
          .withIndex('by_parentThreadId_status', idx => idx.eq('parentThreadId', threadId).eq('status', 'running'))
          .collect()
      let incompleteTodoCount = 0
      for (const t of todos) if (!(t.status === 'completed' || t.status === 'cancelled')) incompleteTodoCount += 1

      const hasActiveTasks = pendingTasks.length > 0 || runningTasks.length > 0,
        atCap = state.autoContinueStreak >= 5,
        incomingPriority = reasonPriority.todo_continuation,
        queuedPriority = getQueuedPriority({ state }),
        queueAllowsContinuation = incomingPriority >= queuedPriority,
        shouldContinue =
          incompleteTodoCount > 0 && !hasActiveTasks && !turnRequestedInput && !atCap && queueAllowsContinuation
      if (!shouldContinue) {
        await ctx.db.patch(state._id, { autoContinueStreak: 0 })
        return { ok: true, shouldContinue: false }
      }
      const reminderText = buildTodoReminder({ todos }),
        reminderMessageId = await ctx.db.insert('messages', {
          content: reminderText,
          isComplete: true,
          parts: [{ text: reminderText, type: 'text' }],
          role: 'system',
          sessionId: session._id,
          threadId
        }),
        enqueued = await enqueueRunInline({
          ctx,
          incrementStreak: true,
          priority: reasonPriority.todo_continuation,
          promptMessageId: String(reminderMessageId),
          reason: 'todo_continuation',
          threadId
        })
      if (!enqueued.ok) {
        await ctx.db.patch(state._id, { autoContinueStreak: 0 })
        return { ok: true, shouldContinue: false }
      }
      return { ok: true, shouldContinue: true }
    }
  }),
  timeoutStaleRuns = internalMutation({
    args: {},
    handler: async ctx => {
      const activeStates = await ctx.db
          .query('threadRunState')
          .withIndex('by_status', idx => idx.eq('status', 'active'))
          .collect(),
        now = Date.now()
      for (const state of activeStates) {
        const heartbeatBase = state.runHeartbeatAt ?? state.claimedAt ?? state.activatedAt,
          claimedHeartbeatStale = state.runClaimed === true && !!heartbeatBase && now - heartbeatBase > CLAIMED_STALE_MS,
          unclaimedStale = state.runClaimed !== true && !!state.activatedAt && now - state.activatedAt > UNCLAIMED_STALE_MS,
          wallClockStale = !!state.activatedAt && now - state.activatedAt > WALL_CLOCK_TIMEOUT_MS,
          isStale = claimedHeartbeatStale || unclaimedStale || wallClockStale
        if (isStale) {
          const queuedPromptMessageId = state.queuedPromptMessageId
          if (queuedPromptMessageId) {
            const session = await resolveSessionByThreadId({ ctx, threadId: state.threadId })
            if (session?.status === 'archived')
              await ctx.db.patch(state._id, {
                activatedAt: undefined,
                activeRunToken: undefined,
                claimedAt: undefined,
                queuedPriority: undefined,
                queuedPromptMessageId: undefined,
                queuedReason: undefined,
                runClaimed: undefined,
                runHeartbeatAt: undefined,
                status: 'idle'
              })
            else {
              const runToken = crypto.randomUUID()
              await ctx.scheduler.runAfter(0, runOrchestratorRef, {
                promptMessageId: queuedPromptMessageId,
                runToken,
                threadId: state.threadId
              })
              await ctx.db.patch(state._id, {
                activatedAt: now,
                activeRunToken: runToken,
                claimedAt: undefined,
                queuedPriority: undefined,
                queuedPromptMessageId: undefined,
                queuedReason: undefined,
                runClaimed: false,
                runHeartbeatAt: undefined,
                status: 'active'
              })
            }
          } else
            await ctx.db.patch(state._id, {
              activatedAt: undefined,
              activeRunToken: undefined,
              claimedAt: undefined,
              queuedPriority: undefined,
              queuedPromptMessageId: undefined,
              queuedReason: undefined,
              runClaimed: undefined,
              runHeartbeatAt: undefined,
              status: 'idle'
            })
        }
      }
    }
  }),
  readRunState = internalQuery({
    args: { threadId: v.string() },
    handler: async (ctx, { threadId }) =>
      ctx.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
  }),
  readSessionByThread = internalQuery({
    args: { threadId: v.string() },
    handler: async (ctx, { threadId }) =>
      ctx.db
        .query('session')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
  }),
  listMessagesForPrompt = internalQuery({
    args: { promptMessageId: v.optional(v.string()), threadId: v.string() },
    handler: async (ctx, { promptMessageId, threadId }) => {
      let maxCreationTime = Number.POSITIVE_INFINITY
      if (promptMessageId) {
        const prompt = await ctx.db.get(promptMessageId as Id<'messages'>)
        if (prompt?.threadId !== threadId) return []
        maxCreationTime = prompt._creationTime
      }
      const rows = await ctx.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .order('desc')
          .take(200),
        selected: Doc<'messages'>[] = []
      for (const row of rows)
        if (!(row._creationTime > maxCreationTime)) {
          selected.push(row)
          if (selected.length >= 100) break
        }

      selected.reverse()
      return selected
    }
  }),
  createAssistantMessage = internalMutation({
    args: { sessionId: v.id('session'), threadId: v.string() },
    handler: async (ctx, { sessionId, threadId }) =>
      ctx.db.insert('messages', {
        content: '',
        isComplete: false,
        parts: [],
        role: 'assistant',
        sessionId,
        streamingContent: '',
        threadId
      })
  }),
  patchStreamingMessage = internalMutation({
    args: { messageId: v.id('messages'), streamingContent: v.string() },
    handler: async (ctx, { messageId, streamingContent }) => {
      const msg = await ctx.db.get(messageId)
      if (!msg) return
      if (msg.isComplete) return
      await ctx.db.patch(messageId, { streamingContent })
    }
  }),
  appendStepMetadata = internalMutation({
    args: { messageId: v.id('messages'), stepPayload: v.string() },
    handler: async (ctx, { messageId, stepPayload }) => {
      const msg = await ctx.db.get(messageId)
      if (!msg) return
      const metadata = msg.metadata ? `${msg.metadata}\n${stepPayload}` : stepPayload
      await ctx.db.patch(messageId, { metadata })
    }
  }),
  finalizeMessage = internalMutation({
    args: { content: v.string(), messageId: v.id('messages'), parts: v.array(messagePartValidator) },
    handler: async (ctx, { content, messageId, parts }) => {
      const msg = await ctx.db.get(messageId)
      if (!msg) return
      await ctx.db.patch(messageId, {
        content,
        isComplete: true,
        parts,
        streamingContent: undefined
      })
    }
  }),
  recordRunError = internalMutation({
    args: { error: v.string(), threadId: v.string() },
    handler: async (ctx, { error, threadId }) => {
      const state = await ensureRunStateInline({ ctx, threadId })
      await ctx.db.patch(state._id, { lastError: error })
    }
  }),
  submitMessage = m({
    args: { content: string(), sessionId: zid('session') },
    handler: async (ctx, { content, sessionId }) => {
      const userId = ctx.user._id as never,
        session = await ctx.db.get(sessionId)
      if (session?.userId !== userId) throw new Error('session_not_found')
      if (session.status === 'archived') throw new Error('session_archived')
      const messageId = await ctx.db.insert('messages', {
        content,
        isComplete: true,
        parts: [{ text: content, type: 'text' }],
        role: 'user',
        sessionId,
        threadId: session.threadId
      })
      await ctx.db.patch(sessionId, {
        lastActivityAt: Date.now(),
        status: session.status === 'idle' ? 'active' : session.status,
        updatedAt: Date.now()
      })
      await enqueueRunInline({
        ctx,
        incrementStreak: false,
        priority: reasonPriority.user_message,
        promptMessageId: String(messageId),
        reason: 'user_message',
        threadId: session.threadId
      })
      return { messageId: String(messageId) }
    }
  })

export {
  appendStepMetadata,
  claimRun,
  createAssistantMessage,
  enqueueRun,
  ensureRunState,
  finalizeMessage,
  finishRun,
  heartbeatRun,
  listMessagesForPrompt,
  patchStreamingMessage,
  postTurnAuditFenced,
  readRunState,
  readSessionByThread,
  recordRunError,
  submitMessage,
  timeoutStaleRuns
}

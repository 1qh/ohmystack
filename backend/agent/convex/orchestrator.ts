/* oxlint-disable eslint/no-await-in-loop */
/* eslint-disable complexity, no-await-in-loop */
import { zid } from 'convex-helpers/server/zod4'
/** biome-ignore-all lint/style/noProcessEnv: test mode detection */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB mutations */
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { string } from 'zod/v4'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { m } from '../lazy'
import { internalMutation, internalQuery } from './_generated/server'
import { enforceRateLimit } from './rateLimit'
const reasonPriority = {
  task_completion: 1,
  todo_continuation: 0,
  user_message: 2
} as const
const messagePartValidator = v.union(
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
  v.object({
    snippet: v.optional(v.string()),
    title: v.string(),
    type: v.literal('source'),
    url: v.string()
  })
)
const runOrchestratorRef = makeFunctionReference<
  'action',
  { promptMessageId?: string; runToken: string; threadId: string },
  undefined
>('orchestratorNode:runOrchestrator')
const CLAIMED_STALE_MS = 15 * 60 * 1000
const CONTINUATION_BASE_COOLDOWN_MS = 5000
const FAILURE_RESET_WINDOW_MS = 5 * 60 * 1000
const MAX_CONSECUTIVE_FAILURES = 5
const MAX_STAGNATION_COUNT = 3
const TASK_REMINDER_THRESHOLD = 10
const UNCLAIMED_STALE_MS = 5 * 60 * 1000
const WALL_CLOCK_TIMEOUT_MS = 15 * 60 * 1000
type EnqueueContext = Pick<MutationCtx, 'db' | 'scheduler'>
interface NormalizedTodo {
  content: string
  id: string
  status: Doc<'todos'>['status']
}
type RunReason = 'task_completion' | 'todo_continuation' | 'user_message'
type RunStateDoc = Doc<'threadRunState'>
const readRunStateByThreadId = async ({
  ctx,
  threadId
}: {
  ctx: { db: { query: MutationCtx['db']['query'] } }
  threadId: string
}) =>
  ctx.db
    .query('threadRunState')
    .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
    .unique()
const getQueuedPriority = ({ state }: { state: RunStateDoc }) => {
  if (!state.queuedReason) return -1
  if (state.queuedPriority) return reasonPriority[state.queuedPriority]
  if (state.queuedReason === 'user_message') return 2
  if (state.queuedReason === 'task_completion') return 1
  return 0
}
const createRunState = async ({ ctx, threadId }: { ctx: Pick<MutationCtx, 'db'>; threadId: string }) => {
  const id = await ctx.db.insert('threadRunState', {
    autoContinueStreak: 0,
    consecutiveFailures: 0,
    stagnationCount: 0,
    status: 'idle',
    threadId,
    turnsSinceTaskTool: 0
  })
  return ctx.db.get(id)
}
const ensureRunStateInline = async ({ ctx, threadId }: { ctx: Pick<MutationCtx, 'db'>; threadId: string }) => {
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
}
const resolveSessionByThreadId = async ({ ctx, threadId }: { ctx: Pick<MutationCtx, 'db'>; threadId: string }) =>
  ctx.db
    .query('session')
    .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
    .unique()
const scheduleRun = async ({
  ctx,
  promptMessageId,
  runToken,
  threadId
}: {
  ctx: Pick<MutationCtx, 'scheduler'>
  promptMessageId?: string
  runToken: string
  threadId: string
}) => {
  /** biome-ignore lint/style/noProcessEnv: scheduler guard */
  if (process.env.CONVEX_TEST_MODE === 'true' || !process.env.CONVEX_CLOUD_URL) return
  try {
    await ctx.scheduler.runAfter(0, runOrchestratorRef, {
      promptMessageId,
      runToken,
      threadId
    })
  } catch (error) {
    if (!String(error).includes('Write outside of transaction')) throw error
  }
}
const enqueueRunInline = async ({
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
  const state = await ensureRunStateInline({ ctx, threadId })
  const shouldIncrement = incrementStreak === true
  if (shouldIncrement && state.autoContinueStreak >= 5)
    return { ok: false, reason: 'streak_cap' as const, scheduled: false }
  let nextStreak = state.autoContinueStreak
  if (reason === 'user_message') nextStreak = 0
  if (shouldIncrement) nextStreak += 1
  if (state.status === 'idle') {
    const runToken = crypto.randomUUID()
    await scheduleRun({
      ctx,
      promptMessageId,
      runToken,
      threadId
    })
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
  const incomingPriority = priority
  const queuedPriority = getQueuedPriority({ state })
  if (incomingPriority < queuedPriority) return { ok: false, reason: 'lower_priority' as const, scheduled: false }
  await ctx.db.patch(state._id, {
    autoContinueStreak: nextStreak,
    queuedPriority: reason,
    queuedPromptMessageId: promptMessageId,
    queuedReason: reason
  })
  return { ok: true, scheduled: false }
}
const buildTodoReminder = ({ todos }: { todos: Doc<'todos'>[] }) => {
  const lines = ['<system-reminder>', '[TODO CONTINUATION]', 'Incomplete tasks remain:', '']
  for (const t of todos)
    if (!(t.status === 'completed' || t.status === 'cancelled')) lines.push(`- [${t.status}] (${t.priority}) ${t.content}`)
  lines.push('', 'Continue working on the next pending task.', '</system-reminder>')
  return lines.join('\n')
}
const normalizeTodos = ({ todos }: { todos: Doc<'todos'>[] }) => {
  const normalized: NormalizedTodo[] = []
  for (const t of todos)
    normalized.push({
      content: t.content,
      id: String(t._id),
      status: t.status
    })
  normalized.sort((a, b) =>
    a.id === b.id
      ? a.content === b.content
        ? a.status.localeCompare(b.status)
        : a.content.localeCompare(b.content)
      : a.id.localeCompare(b.id)
  )
  return normalized
}
const summarizeTodoState = ({ todos }: { todos: NormalizedTodo[] }) => {
  let completedCount = 0
  let incompleteCount = 0
  for (const t of todos)
    if (t.status === 'completed' || t.status === 'cancelled') completedCount += 1
    else incompleteCount += 1
  return { completedCount, incompleteCount }
}
const parseTodoSnapshot = ({ snapshot }: { snapshot?: string }) => {
  if (!snapshot) return null
  try {
    const parsed: unknown = JSON.parse(snapshot)
    if (!Array.isArray(parsed)) return null
    const todos: NormalizedTodo[] = []
    for (const t of parsed as unknown[]) {
      if (!t || typeof t !== 'object') return null
      const item = t as Record<string, unknown>
      const { content, id, status } = item
      if (typeof id !== 'string' || typeof content !== 'string') return null
      if (!(status === 'pending' || status === 'in_progress' || status === 'completed' || status === 'cancelled'))
        return null
      todos.push({ content, id, status })
    }
    return todos
  } catch {
    return null
  }
}
const computeContinuationCooldownMs = ({ consecutiveFailures }: { consecutiveFailures: number }) =>
  CONTINUATION_BASE_COOLDOWN_MS * 2 ** Math.min(consecutiveFailures, 5)
const isTaskToolName = ({ toolName }: { toolName: string }) =>
  toolName === 'delegate' || toolName === 'taskOutput' || toolName === 'taskStatus'
const buildContinuationSnapshot = async ({
  ctx,
  sessionId,
  state,
  threadId
}: {
  ctx: Pick<MutationCtx, 'db'>
  sessionId: Id<'session'>
  state: RunStateDoc
  threadId: string
}) => {
  const now = Date.now()
  const todos = await ctx.db
    .query('todos')
    .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
    .collect()
  const pendingTasks = await ctx.db
    .query('tasks')
    .withIndex('by_parentThreadId_status', idx => idx.eq('parentThreadId', threadId).eq('status', 'pending'))
    .collect()
  const runningTasks = await ctx.db
    .query('tasks')
    .withIndex('by_parentThreadId_status', idx => idx.eq('parentThreadId', threadId).eq('status', 'running'))
    .collect()
  const normalizedTodos = normalizeTodos({ todos })
  const todoSnapshot = JSON.stringify(normalizedTodos)
  const previousTodos = parseTodoSnapshot({ snapshot: state.lastTodoSnapshot })
  const currentSummary = summarizeTodoState({ todos: normalizedTodos })
  const previousSummary = summarizeTodoState({ todos: previousTodos ?? [] })
  let consecutiveFailures = state.consecutiveFailures ?? 0
  let stagnationCount = state.stagnationCount ?? 0
  if (state.lastContinuationAt && now - state.lastContinuationAt >= FAILURE_RESET_WINDOW_MS) consecutiveFailures = 0
  if (!state.lastTodoSnapshot || state.lastTodoSnapshot !== todoSnapshot) stagnationCount = 0
  else stagnationCount += 1
  const progressDetected =
    !state.lastTodoSnapshot ||
    state.lastTodoSnapshot !== todoSnapshot ||
    currentSummary.incompleteCount < previousSummary.incompleteCount ||
    currentSummary.completedCount > previousSummary.completedCount
  const nextStagnationCount = progressDetected ? 0 : stagnationCount
  const hasStagnated = nextStagnationCount >= MAX_STAGNATION_COUNT
  const hitFailureCap = consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
  const safeFailures = consecutiveFailures
  const cooldownMs = computeContinuationCooldownMs({
    consecutiveFailures: safeFailures
  })
  const insideCooldown =
    safeFailures > 0 && state.lastContinuationAt !== undefined && now - state.lastContinuationAt < cooldownMs
  const hasActiveTasks = pendingTasks.length > 0 || runningTasks.length > 0
  const atCap = state.autoContinueStreak >= 5
  const incomingPriority = reasonPriority.todo_continuation
  const queuedPriority = getQueuedPriority({ state })
  const queueAllowsContinuation = incomingPriority >= queuedPriority
  const shouldContinue =
    currentSummary.incompleteCount > 0 &&
    !hasActiveTasks &&
    !atCap &&
    queueAllowsContinuation &&
    !hasStagnated &&
    !hitFailureCap &&
    !insideCooldown
  return {
    nextStagnationCount,
    shouldContinue,
    snapshot: {
      currentSummary,
      hasActiveTasks,
      now,
      safeFailures,
      todoSnapshot,
      todos
    }
  }
}
const persistNoContinuationState = async ({
  ctx,
  nextStagnationCount,
  safeFailures,
  stateId,
  todoSnapshot
}: {
  ctx: Pick<MutationCtx, 'db'>
  nextStagnationCount: number
  safeFailures: number
  stateId: Id<'threadRunState'>
  todoSnapshot: string
}) =>
  ctx.db.patch(stateId, {
    autoContinueStreak: 0,
    consecutiveFailures: safeFailures,
    lastTodoSnapshot: todoSnapshot,
    stagnationCount: nextStagnationCount
  })
const enqueueContinuationRun = async ({
  ctx,
  reminderText,
  sessionId,
  threadId
}: {
  ctx: EnqueueContext & Pick<MutationCtx, 'db'>
  reminderText: string
  sessionId: Id<'session'>
  threadId: string
}) => {
  const reminderMessageId = await ctx.db.insert('messages', {
    content: reminderText,
    isComplete: true,
    parts: [{ text: reminderText, type: 'text' }],
    role: 'system',
    sessionId,
    threadId
  })
  return enqueueRunInline({
    ctx,
    incrementStreak: true,
    priority: reasonPriority.todo_continuation,
    promptMessageId: String(reminderMessageId),
    reason: 'todo_continuation',
    threadId
  })
}
const ensureRunState = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => ensureRunStateInline({ ctx, threadId })
})
const enqueueRun = internalMutation({
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
})
const claimRun = internalMutation({
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
})
const finishRun = internalMutation({
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
      await scheduleRun({
        ctx,
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
})
const heartbeatRun = internalMutation({
  args: { runToken: v.string(), threadId: v.string() },
  handler: async (ctx, { runToken, threadId }) => {
    const state = await readRunStateByThreadId({ ctx, threadId })
    if (state?.activeRunToken !== runToken) return
    await ctx.db.patch(state._id, { runHeartbeatAt: Date.now() })
  }
})
const postTurnAuditFenced = internalMutation({
  args: {
    runToken: v.string(),
    threadId: v.string(),
    turnRequestedInput: v.boolean()
  },
  handler: async (ctx, { runToken, threadId, turnRequestedInput }) => {
    const state = await ensureRunStateInline({ ctx, threadId })
    if (state.status !== 'active') return { ok: false, shouldContinue: false }
    if (state.activeRunToken !== runToken) return { ok: false, shouldContinue: false }
    const session = await resolveSessionByThreadId({ ctx, threadId })
    if (!session || session.status === 'archived') {
      await ctx.db.patch(state._id, { autoContinueStreak: 0 })
      return { ok: true, shouldContinue: false }
    }
    const {
      nextStagnationCount,
      shouldContinue: shouldContinueBase,
      snapshot: { now, safeFailures, todos, todoSnapshot }
    } = await buildContinuationSnapshot({
      ctx,
      sessionId: session._id,
      state,
      threadId
    })
    const shouldContinue = shouldContinueBase && !turnRequestedInput
    if (!shouldContinue) {
      await persistNoContinuationState({
        ctx,
        nextStagnationCount,
        safeFailures,
        stateId: state._id,
        todoSnapshot
      })
      return { ok: true, shouldContinue: false }
    }
    const reminderText = buildTodoReminder({ todos })
    const enqueued = await enqueueContinuationRun({
      ctx,
      reminderText,
      sessionId: session._id,
      threadId
    })
    if (!enqueued.ok) {
      await ctx.db.patch(state._id, {
        autoContinueStreak: 0,
        consecutiveFailures: safeFailures + 1,
        lastContinuationAt: now,
        lastTodoSnapshot: todoSnapshot,
        stagnationCount: nextStagnationCount
      })
      return { ok: true, shouldContinue: false }
    }
    await ctx.db.patch(state._id, {
      consecutiveFailures: 0,
      lastContinuationAt: now,
      lastTodoSnapshot: todoSnapshot,
      stagnationCount: nextStagnationCount
    })
    return { ok: true, shouldContinue: true }
  }
})
const incrementTaskToolCounter = internalMutation({
  args: { threadId: v.string(), toolName: v.string() },
  handler: async (ctx, { threadId, toolName }) => {
    const state = await ensureRunStateInline({ ctx, threadId })
    const isTaskTool = isTaskToolName({ toolName })
    if (isTaskTool) {
      if ((state.turnsSinceTaskTool ?? 0) !== 0) await ctx.db.patch(state._id, { turnsSinceTaskTool: 0 })
      return { shouldRemind: false, turnsSinceTaskTool: 0 }
    }
    const turnsSinceTaskTool = (state.turnsSinceTaskTool ?? 0) + 1
    const shouldRemind = turnsSinceTaskTool >= TASK_REMINDER_THRESHOLD
    await ctx.db.patch(state._id, { turnsSinceTaskTool })
    return { shouldRemind, turnsSinceTaskTool }
  }
})
const consumeTaskReminder = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const state = await ensureRunStateInline({ ctx, threadId })
    const shouldInject = (state.turnsSinceTaskTool ?? 0) >= TASK_REMINDER_THRESHOLD
    if (shouldInject) await ctx.db.patch(state._id, { turnsSinceTaskTool: 0 })
    return { shouldInject }
  }
})
const timeoutStaleRuns = internalMutation({
  args: {},
  handler: async ctx => {
    const activeStates = await ctx.db
      .query('threadRunState')
      .withIndex('by_status', idx => idx.eq('status', 'active'))
      .collect()
    const now = Date.now()
    for (const state of activeStates) {
      const heartbeatBase = state.runHeartbeatAt ?? state.claimedAt ?? state.activatedAt
      const claimedHeartbeatStale =
        state.runClaimed === true && heartbeatBase !== undefined && now - heartbeatBase > CLAIMED_STALE_MS
      const unclaimedStale =
        state.runClaimed !== true && state.activatedAt !== undefined && now - state.activatedAt > UNCLAIMED_STALE_MS
      const wallClockStale = state.activatedAt !== undefined && now - state.activatedAt > WALL_CLOCK_TIMEOUT_MS
      const isStale = claimedHeartbeatStale || unclaimedStale || wallClockStale
      if (isStale) {
        const { queuedPromptMessageId } = state
        if (queuedPromptMessageId) {
          /** biome-ignore lint/performance/noAwaitInLoops: sequential stale-state recovery */
          const session = await resolveSessionByThreadId({
            ctx,
            threadId: state.threadId
          })
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
            await scheduleRun({
              ctx,
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
})
const readRunState = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) =>
    ctx.db
      .query('threadRunState')
      .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
      .unique()
})
const readSessionByThread = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) =>
    ctx.db
      .query('session')
      .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
      .unique()
})
const listActiveTasksByThread = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const pending = await ctx.db
      .query('tasks')
      .withIndex('by_parentThreadId_status', idx => idx.eq('parentThreadId', threadId).eq('status', 'pending'))
      .collect()
    const running = await ctx.db
      .query('tasks')
      .withIndex('by_parentThreadId_status', idx => idx.eq('parentThreadId', threadId).eq('status', 'running'))
      .collect()
    const rows: Doc<'tasks'>[] = []
    for (const row of pending) rows.push(row)
    for (const row of running) rows.push(row)
    return rows
  }
})
const listMessagesForPrompt = internalQuery({
  args: { promptMessageId: v.optional(v.string()), threadId: v.string() },
  handler: async (ctx, { promptMessageId, threadId }) => {
    let maxCreationTime = Number.POSITIVE_INFINITY
    let minCreationTime = Number.NEGATIVE_INFINITY
    const runState = await readRunStateByThreadId({ ctx, threadId })
    if (runState?.lastCompactedMessageId) {
      const boundary = await ctx.db.get(runState.lastCompactedMessageId as Id<'messages'>)
      if (boundary?.threadId === threadId) minCreationTime = boundary._creationTime
    }
    if (promptMessageId) {
      const prompt = await ctx.db.get(promptMessageId as Id<'messages'>)
      if (prompt?.threadId !== threadId) return []
      maxCreationTime = prompt._creationTime
    }
    const rows = await ctx.db
      .query('messages')
      .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
      .order('desc')
      .take(200)
    const selected: Doc<'messages'>[] = []
    for (const row of rows)
      if (!(row._creationTime > maxCreationTime || row._creationTime <= minCreationTime)) {
        selected.push(row)
        if (selected.length >= 100) break
      }
    selected.reverse()
    return selected
  }
})
const createAssistantMessage = internalMutation({
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
})
const patchStreamingMessage = internalMutation({
  args: { messageId: v.id('messages'), streamingContent: v.string() },
  handler: async (ctx, { messageId, streamingContent }) => {
    const msg = await ctx.db.get(messageId)
    if (!msg) return
    if (msg.isComplete) return
    await ctx.db.patch(messageId, { streamingContent })
  }
})
const appendStepMetadata = internalMutation({
  args: { messageId: v.id('messages'), stepPayload: v.string() },
  handler: async (ctx, { messageId, stepPayload }) => {
    const msg = await ctx.db.get(messageId)
    if (!msg) return
    const metadata = msg.metadata ? `${msg.metadata}\n${stepPayload}` : stepPayload
    await ctx.db.patch(messageId, { metadata })
  }
})
const finalizeMessage = internalMutation({
  args: {
    content: v.string(),
    messageId: v.id('messages'),
    parts: v.array(messagePartValidator)
  },
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
})
const recordRunError = internalMutation({
  args: { error: v.string(), threadId: v.string() },
  handler: async (ctx, { error, threadId }) => {
    const state = await ensureRunStateInline({ ctx, threadId })
    await ctx.db.patch(state._id, { lastError: error })
  }
})
const submitMessage = m({
  args: { content: string(), sessionId: zid('session') },
  handler: async (ctx, { content, sessionId }) => {
    const userId = ctx.user._id as never
    const session = await ctx.db.get(sessionId)
    if (session?.userId !== userId) throw new Error('session_not_found')
    if (session.status === 'archived') throw new Error('session_archived')
    await enforceRateLimit({
      ctx,
      key: ctx.user._id,
      name: 'submitMessage'
    })
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
  consumeTaskReminder,
  createAssistantMessage,
  enqueueRun,
  ensureRunState,
  finalizeMessage,
  finishRun,
  heartbeatRun,
  incrementTaskToolCounter,
  listActiveTasksByThread,
  listMessagesForPrompt,
  patchStreamingMessage,
  postTurnAuditFenced,
  readRunState,
  readSessionByThread,
  recordRunError,
  submitMessage,
  timeoutStaleRuns
}

import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

import { internalMutation, internalQuery } from './_generated/server'

const LOCK_TTL_MS = 10 * 60 * 1000,
  MESSAGE_THRESHOLD = 200,
  CHAR_THRESHOLD = 100_000,
  SCAN_LIMIT = 500,
  resolveSessionByThreadId = async ({ ctx, threadId }: { ctx: Pick<QueryCtx, 'db'>; threadId: string }) =>
    ctx.db
      .query('session')
      .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
      .unique(),
  hasTerminalToolParts = ({ parts }: { parts: { status?: 'error' | 'pending' | 'success'; type: string }[] }) => {
    for (const p of parts) if (p.type === 'tool-call' && !(p.status === 'success' || p.status === 'error')) return false
    return true
  },
  readRunStateByThreadId = async ({ ctx, threadId }: { ctx: Pick<QueryCtx, 'db'>; threadId: string }) =>
    ctx.db
      .query('threadRunState')
      .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
      .unique(),
  getContextSizeInline = async ({ ctx, threadId }: { ctx: Pick<QueryCtx, 'db'>; threadId: string }) => {
    const runState = await readRunStateByThreadId({ ctx, threadId }),
      rows = await ctx.db
        .query('messages')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .order('desc')
        .take(SCAN_LIMIT + 1),
      hasMore = rows.length > SCAN_LIMIT,
      selected = rows.slice(0, SCAN_LIMIT)
    let charCount = runState?.compactionSummary?.length ?? 0
    for (const m of selected) charCount += m.content.length
    return { charCount, hasMore, messageCount: selected.length }
  },
  acquireCompactionLockInline = async ({ ctx, threadId }: { ctx: Pick<MutationCtx, 'db'>; threadId: string }) => {
    const runState = await readRunStateByThreadId({ ctx, threadId })
    if (!runState) return { lockToken: '', ok: false }
    const now = Date.now(),
      lockExpired = runState.compactionLockAt !== undefined && now - runState.compactionLockAt > LOCK_TTL_MS,
      lockOpen = !(runState.compactionLock && runState.compactionLockAt) || lockExpired,
      lockToken = crypto.randomUUID()
    if (lockOpen) {
      await ctx.db.patch(runState._id, {
        compactionLock: lockToken,
        compactionLockAt: now
      })
      return { lockToken, ok: true }
    }
    return { lockToken: runState.compactionLock ?? '', ok: false }
  },
  listClosedPrefixGroupsInline = async ({ ctx, threadId }: { ctx: Pick<QueryCtx, 'db'>; threadId: string }) => {
    const runState = await readRunStateByThreadId({ ctx, threadId }),
      rows = await ctx.db
        .query('messages')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .order('asc')
        .take(SCAN_LIMIT)
    let boundaryCreationTime = Number.NEGATIVE_INFINITY
    if (runState?.lastCompactedMessageId) {
      const boundaryMessage = await ctx.db.get(runState.lastCompactedMessageId as Id<'messages'>)
      if (boundaryMessage) boundaryCreationTime = boundaryMessage._creationTime
    }
    const groups: { endMessageId: string; messageIds: string[] }[] = []
    for (const m of rows)
      if (m._creationTime > boundaryCreationTime)
        if (m.isComplete && hasTerminalToolParts({ parts: m.parts }))
          groups.push({
            endMessageId: String(m._id),
            messageIds: [String(m._id)]
          })
        else break

    return groups
  },
  releaseCompactionLockInline = async ({
    ctx,
    lockToken,
    threadId
  }: {
    ctx: Pick<MutationCtx, 'db'>
    lockToken: string
    threadId: string
  }) => {
    const runState = await readRunStateByThreadId({ ctx, threadId })
    if (runState?.compactionLock === lockToken)
      await ctx.db.patch(runState._id, {
        compactionLock: undefined,
        compactionLockAt: undefined
      })
  },
  snapshotTodosInline = async ({ ctx, threadId }: { ctx: Pick<MutationCtx, 'db'>; threadId: string }) => {
    const session = await resolveSessionByThreadId({ ctx, threadId })
    if (!session)
      return {
        snapshot: [] as {
          content: string
          position: number
          priority: 'high' | 'low' | 'medium'
          status: 'cancelled' | 'completed' | 'in_progress' | 'pending'
        }[]
      }
    const todos = await ctx.db
        .query('todos')
        .withIndex('by_session_position', idx => idx.eq('sessionId', session._id))
        .collect(),
      snapshot: {
        content: string
        position: number
        priority: 'high' | 'low' | 'medium'
        status: 'cancelled' | 'completed' | 'in_progress' | 'pending'
      }[] = []
    for (const t of todos)
      snapshot.push({
        content: t.content,
        position: t.position,
        priority: t.priority,
        status: t.status
      })

    return { snapshot }
  },
  restoreTodosIfMissingInline = async ({
    ctx,
    snapshot,
    threadId
  }: {
    ctx: Pick<MutationCtx, 'db'>
    snapshot: {
      content: string
      position: number
      priority: 'high' | 'low' | 'medium'
      status: 'cancelled' | 'completed' | 'in_progress' | 'pending'
    }[]
    threadId: string
  }) => {
    if (snapshot.length === 0) return { restored: 0 }
    const session = await resolveSessionByThreadId({ ctx, threadId })
    if (!session) return { restored: 0 }
    const existing = await ctx.db
      .query('todos')
      .withIndex('by_session_position', idx => idx.eq('sessionId', session._id))
      .collect()
    if (existing.length > 0) return { restored: 0 }
    await Promise.all(
      snapshot.map(async t =>
        ctx.db.insert('todos', {
          content: t.content,
          position: t.position,
          priority: t.priority,
          sessionId: session._id,
          status: t.status
        })
      )
    )
    const restored = snapshot.length
    return { restored }
  },
  getContextSize = internalQuery({
    args: { threadId: v.string() },
    handler: async (ctx, { threadId }) => getContextSizeInline({ ctx, threadId })
  }),
  acquireCompactionLock = internalMutation({
    args: { threadId: v.string() },
    handler: async (ctx, { threadId }) => acquireCompactionLockInline({ ctx, threadId })
  }),
  listClosedPrefixGroups = internalQuery({
    args: { threadId: v.string() },
    handler: async (ctx, { threadId }) => listClosedPrefixGroupsInline({ ctx, threadId })
  }),
  setCompactionSummary = internalMutation({
    args: {
      compactionSummary: v.string(),
      lastCompactedMessageId: v.string(),
      lockToken: v.string(),
      threadId: v.string()
    },
    handler: async (ctx, { compactionSummary, lastCompactedMessageId, lockToken, threadId }) => {
      const runState = await readRunStateByThreadId({ ctx, threadId })
      if (!runState) return { ok: false }
      if (runState.compactionLock !== lockToken) return { ok: false }
      const nextBoundary = await ctx.db.get(lastCompactedMessageId as Id<'messages'>)
      if (nextBoundary?.threadId !== threadId) return { ok: false }
      if (runState.lastCompactedMessageId) {
        const currentBoundary = await ctx.db.get(runState.lastCompactedMessageId as Id<'messages'>)
        if (!currentBoundary) return { ok: false }
        if (nextBoundary._creationTime <= currentBoundary._creationTime) return { ok: false }
      }
      await ctx.db.patch(runState._id, {
        compactionLock: undefined,
        compactionLockAt: undefined,
        compactionSummary,
        lastCompactedMessageId
      })
      return { ok: true }
    }
  }),
  snapshotTodos = internalMutation({
    args: { threadId: v.string() },
    handler: async (ctx, { threadId }) => snapshotTodosInline({ ctx, threadId })
  }),
  restoreTodosIfMissing = internalMutation({
    args: {
      snapshot: v.array(
        v.object({
          content: v.string(),
          position: v.number(),
          priority: v.union(v.literal('high'), v.literal('medium'), v.literal('low')),
          status: v.union(v.literal('pending'), v.literal('in_progress'), v.literal('completed'), v.literal('cancelled'))
        })
      ),
      threadId: v.string()
    },
    handler: async (ctx, { snapshot, threadId }) => restoreTodosIfMissingInline({ ctx, snapshot, threadId })
  }),
  compactIfNeeded = internalMutation({
    args: { threadId: v.string() },
    handler: async (ctx, { threadId }) => {
      const contextSize = await getContextSizeInline({ ctx, threadId }),
        overThreshold = contextSize.charCount > CHAR_THRESHOLD || contextSize.messageCount > MESSAGE_THRESHOLD
      if (!overThreshold) return { compacted: false, reason: 'under_threshold' as const }
      const { snapshot } = await snapshotTodosInline({ ctx, threadId }),
        lock = await acquireCompactionLockInline({ ctx, threadId })
      if (!lock.ok) return { compacted: false, reason: 'lock_denied' as const }
      const groups = await listClosedPrefixGroupsInline({ ctx, threadId })
      if (groups.length === 0) {
        await releaseCompactionLockInline({
          ctx,
          lockToken: lock.lockToken,
          threadId
        })
        await restoreTodosIfMissingInline({ ctx, snapshot, threadId })
        return { compacted: false, reason: 'no_closed_groups' as const }
      }
      await releaseCompactionLockInline({
        ctx,
        lockToken: lock.lockToken,
        threadId
      })
      await restoreTodosIfMissingInline({ ctx, snapshot, threadId })
      return { compacted: false, reason: 'placeholder' as const }
    }
  })

export {
  acquireCompactionLock,
  compactIfNeeded,
  getContextSize,
  listClosedPrefixGroups,
  restoreTodosIfMissing,
  setCompactionSummary,
  snapshotTodos
}

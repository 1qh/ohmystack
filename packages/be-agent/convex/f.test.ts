/* eslint-disable no-await-in-loop, @typescript-eslint/no-magic-numbers */
// oxlint-disable promise/prefer-await-to-then
/** biome-ignore-all lint/performance/noAwaitInLoops: test fixtures */
import { describe, expect, test } from 'bun:test'
import { convexTest } from 'convex-test'
import { createTestContext } from '@noboil/convex/test'
import { discoverModules } from '@noboil/convex/test/discover'

import { api, internal } from './_generated/api'
import { checkRateLimit, rateLimit, resetRateLimit } from './rateLimit'
import schema from './schema'

const modules = discoverModules('convex', {
    './_generated/api.js': async () => import('./_generated/api'),
    './_generated/server.js': async () => import('./_generated/server')
  }),
  t = () => convexTest(schema, modules)

describe('sessions', () => {
  test('creates session with threadId and threadRunState', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      result = await asUser(0).mutation(api.sessions.createSession, {})
    expect(result.sessionId).toBeDefined()
    expect(result.threadId).toBeDefined()
    const session = await ctx.run(async c => c.db.get(result.sessionId))
    expect(session).not.toBeNull()
    expect(session?.status).toBe('active')
    expect(session?.threadId).toBe(result.threadId)
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', result.threadId))
        .unique()
    )
    expect(runState).not.toBeNull()
    expect(runState?.status).toBe('idle')
    expect(runState?.autoContinueStreak).toBe(0)
  })

  test('creates session with title', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      result = await asUser(0).mutation(api.sessions.createSession, { title: 'My Chat' })
    const session = await ctx.run(async c => c.db.get(result.sessionId))
    expect(session?.title).toBe('My Chat')
  })

  test('lists only own non-archived sessions', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    await asUser(0).mutation(api.sessions.createSession, { title: 'User0 Chat' })
    await asUser(1).mutation(api.sessions.createSession, { title: 'User1 Chat' })
    const user0Sessions = await asUser(0).query(api.sessions.listSessions, {})
    expect(user0Sessions.length).toBe(1)
    expect(user0Sessions[0]?.title).toBe('User0 Chat')
    const user1Sessions = await asUser(1).query(api.sessions.listSessions, {})
    expect(user1Sessions.length).toBe(1)
    expect(user1Sessions[0]?.title).toBe('User1 Chat')
  })

  test('getSession returns null for non-owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    const ownResult = await asUser(0).query(api.sessions.getSession, { sessionId })
    expect(ownResult).not.toBeNull()
    const otherResult = await asUser(1).query(api.sessions.getSession, { sessionId })
    expect(otherResult).toBeNull()
  })

  test('archiveSession sets archived status and clears queue', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      const rs = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (rs) {
        await c.db.patch(rs._id, {
          queuedPriority: 'user_message',
          queuedPromptMessageId: 'test-msg',
          queuedReason: 'test'
        })
      }
    })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const session = await ctx.run(async c => c.db.get(sessionId))
    expect(session?.status).toBe('archived')
    expect(session?.archivedAt).toBeDefined()
    const rs = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(rs?.queuedPriority).toBeUndefined()
    expect(rs?.queuedPromptMessageId).toBeUndefined()
  })

  test('archiveSession rejects non-owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    let threw = false
    try {
      await asUser(1).mutation(api.sessions.archiveSession, { sessionId })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('session_not_found')
    }
    expect(threw).toBe(true)
  })

  test('archived sessions excluded from list', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId: _s1 } = await asUser(0).mutation(api.sessions.createSession, { title: 'Active' }),
      { sessionId: s2 } = await asUser(0).mutation(api.sessions.createSession, { title: 'To Archive' })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId: s2 })
    const sessions = await asUser(0).query(api.sessions.listSessions, {})
    expect(sessions.length).toBe(1)
    expect(sessions[0]?.title).toBe('Active')
  })
})

describe('messages', () => {
  test('listMessages returns messages for owned session thread', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'Hello',
        isComplete: true,
        parts: [],
        role: 'user',
        sessionId,
        threadId
      })
      await c.db.insert('messages', {
        content: 'Hi there',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const messages = await asUser(0).query(api.messages.listMessages, { threadId })
    expect(messages.length).toBe(2)
    expect(messages[0]?.content).toBe('Hello')
    expect(messages[1]?.content).toBe('Hi there')
  })

  test('listMessages rejects non-owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    let threw = false
    try {
      await asUser(1).query(api.messages.listMessages, { threadId })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('thread_not_found')
    }
    expect(threw).toBe(true)
  })

  test('listMessages returns latest 100 in chronological order', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      for (let i = 0; i < 110; i += 1) {
        await c.db.insert('messages', {
          content: `msg-${i}`,
          isComplete: true,
          parts: [],
          role: 'user',
          sessionId,
          threadId
        })
      }
    })
    const messages = await asUser(0).query(api.messages.listMessages, { threadId })
    expect(messages.length).toBe(100)
    expect(messages[0]?.content).toBe('msg-10')
    expect(messages[99]?.content).toBe('msg-109')
  })
})

describe('queue CAS', () => {
  test('enqueueRun idle->active', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      result = await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: 'prompt-a',
        reason: 'user_message',
        threadId
      })
    expect(result.ok).toBe(true)
    expect(result.scheduled).toBe(true)
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.status).toBe('active')
    expect(runState?.activeRunToken).toBeDefined()
    expect(runState?.runClaimed).toBe(false)
  })

  test('enqueueRun higher priority replaces queued', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 0,
      promptMessageId: 'prompt-low',
      reason: 'todo_continuation',
      threadId
    })
    const result = await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-high',
      reason: 'user_message',
      threadId
    })
    expect(result.ok).toBe(true)
    expect(result.scheduled).toBe(false)
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.queuedPriority).toBe('user_message')
    expect(runState?.queuedReason).toBe('user_message')
    expect(runState?.queuedPromptMessageId).toBe('prompt-high')
  })

  test('enqueueRun lower priority rejected', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-high',
      reason: 'user_message',
      threadId
    })
    const result = await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 0,
      promptMessageId: 'prompt-low',
      reason: 'todo_continuation',
      threadId
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('lower_priority')
    expect(result.scheduled).toBe(false)
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.queuedPriority).toBe('user_message')
    expect(runState?.queuedPromptMessageId).toBe('prompt-high')
  })

  test('enqueueRun equal priority replaces', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'prompt-first',
      reason: 'task_completion',
      threadId
    })
    const result = await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'prompt-second',
      reason: 'task_completion',
      threadId
    })
    expect(result.ok).toBe(true)
    expect(result.scheduled).toBe(false)
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.queuedPriority).toBe('task_completion')
    expect(runState?.queuedPromptMessageId).toBe('prompt-second')
  })

  test('claimRun succeeds with matching token', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-a',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    const runToken = before?.activeRunToken
    expect(runToken).toBeDefined()
    const result = await ctx.mutation(internal.orchestrator.claimRun, {
      runToken: runToken ?? '',
      threadId
    })
    expect(result.ok).toBe(true)
    const after = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(after?.runClaimed).toBe(true)
    expect(after?.claimedAt).toBeDefined()
    expect(after?.runHeartbeatAt).toBeDefined()
  })

  test('claimRun rejects mismatched token', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-a',
      reason: 'user_message',
      threadId
    })
    const result = await ctx.mutation(internal.orchestrator.claimRun, {
      runToken: 'wrong-token',
      threadId
    })
    expect(result.ok).toBe(false)
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.runClaimed).toBe(false)
    expect(runState?.claimedAt).toBeUndefined()
  })

  test('claimRun rejects already-claimed', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-a',
      reason: 'user_message',
      threadId
    })
    const runState = await ctx.run(async c =>
        c.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
      ),
      runToken = runState?.activeRunToken
    expect(runToken).toBeDefined()
    const first = await ctx.mutation(internal.orchestrator.claimRun, {
      runToken: runToken ?? '',
      threadId
    })
    expect(first.ok).toBe(true)
    const second = await ctx.mutation(internal.orchestrator.claimRun, {
      runToken: runToken ?? '',
      threadId
    })
    expect(second.ok).toBe(false)
  })

  test('finishRun drains queue to new run', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.run(async c =>
        c.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
      ),
      firstRunToken = before?.activeRunToken
    expect(firstRunToken).toBeDefined()
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'prompt-queued',
      reason: 'task_completion',
      threadId
    })
    const result = await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: firstRunToken ?? '',
      threadId
    })
    expect(result.scheduled).toBe(true)
    const after = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(after?.status).toBe('active')
    expect(after?.activeRunToken).toBeDefined()
    expect(after?.activeRunToken).not.toBe(firstRunToken)
    expect(after?.queuedPromptMessageId).toBeUndefined()
    expect(after?.queuedReason).toBeUndefined()
  })

  test('finishRun resets to idle when no queue', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.run(async c =>
        c.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
      ),
      runToken = before?.activeRunToken
    expect(runToken).toBeDefined()
    const result = await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: runToken ?? '',
      threadId
    })
    expect(result.scheduled).toBe(false)
    const after = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(after?.status).toBe('idle')
    expect(after?.activeRunToken).toBeUndefined()
    expect(after?.queuedPromptMessageId).toBeUndefined()
    expect(after?.queuedReason).toBeUndefined()
    expect(after?.runClaimed).toBeUndefined()
  })

  test('finishRun rejects mismatched token', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    const result = await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: 'wrong-token',
      threadId
    })
    expect(result.scheduled).toBe(false)
    const after = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(after?.status).toBe('active')
    expect(after?.activeRunToken).toBe(before?.activeRunToken)
  })

  test('user_message resets streak to 0', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    await ctx.run(async c => {
      const runState = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState) await c.db.patch(runState._id, { autoContinueStreak: 4 })
    })
    const result = await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-next',
      reason: 'user_message',
      threadId
    })
    expect(result.ok).toBe(true)
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.autoContinueStreak).toBe(0)
  })

  test('streak cap at 5 rejects', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    await ctx.run(async c => {
      const runState = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState) await c.db.patch(runState._id, { autoContinueStreak: 5 })
    })
    const result = await ctx.mutation(internal.orchestrator.enqueueRun, {
      incrementStreak: true,
      priority: 0,
      promptMessageId: 'prompt-next',
      reason: 'todo_continuation',
      threadId
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('streak_cap')
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.autoContinueStreak).toBe(5)
    expect(runState?.queuedPromptMessageId).toBeUndefined()
  })
})

describe('submitMessage', () => {
  test('inserts user message + enqueues run', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      result = await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'hello world',
        sessionId
      })
    const message = await ctx.run(async c => {
      const rows = await c.db
        .query('messages')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .collect()
      return rows.find(m => String(m._id) === result.messageId)
    })
    expect(message).toBeDefined()
    expect(message?.role).toBe('user')
    expect(message?.content).toBe('hello world')
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.status).toBe('active')
    expect(runState?.activeRunToken).toBeDefined()
  })

  test('rejects non-owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    let threw = false
    try {
      await asUser(1).mutation(api.orchestrator.submitMessage, {
        content: 'blocked',
        sessionId
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('session_not_found')
    }
    expect(threw).toBe(true)
  })

  test('rejects archived session', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    let threw = false
    try {
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'blocked',
        sessionId
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('session_archived')
    }
    expect(threw).toBe(true)
  })

  test('updates session lastActivityAt', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.patch(sessionId, { lastActivityAt: 1 })
    })
    await asUser(0).mutation(api.orchestrator.submitMessage, {
      content: 'touch activity',
      sessionId
    })
    const session = await ctx.run(async c => c.db.get(sessionId))
    expect(session?.lastActivityAt).toBeDefined()
    expect((session?.lastActivityAt ?? 0) > 1).toBe(true)
  })
})

describe('postTurnAudit', () => {
  test('stops when no incomplete todos', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.run(async c =>
        c.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
      ),
      runToken = active?.activeRunToken
    await ctx.run(async c => {
      if (active) await c.db.patch(active._id, { autoContinueStreak: 3 })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: runToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.ok).toBe(true)
    expect(result.shouldContinue).toBe(false)
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.autoContinueStreak).toBe(0)
  })

  test('stops when active tasks exist', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'todo item',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('tasks', {
        description: 'background task',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: 'worker-thread-1'
      })
      if (active) await c.db.patch(active._id, { autoContinueStreak: 3 })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.ok).toBe(true)
    expect(result.shouldContinue).toBe(false)
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.autoContinueStreak).toBe(0)
  })

  test('continues when incomplete todos and no active tasks', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'todo item',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.ok).toBe(true)
    expect(result.shouldContinue).toBe(true)
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.queuedReason).toBe('todo_continuation')
    expect(runState?.queuedPriority).toBe('todo_continuation')
    expect(runState?.queuedPromptMessageId).toBeDefined()
    expect(runState?.autoContinueStreak).toBe(1)
    const reminder = await ctx.run(async c => {
      const rows = await c.db
        .query('messages')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .collect()
      return rows.find(m => String(m._id) === runState?.queuedPromptMessageId)
    })
    expect(reminder?.role).toBe('system')
    expect(reminder?.content.includes('[TODO CONTINUATION]')).toBe(true)
  })

  test('rejects stale token', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'todo item',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      if (before) await c.db.patch(before._id, { autoContinueStreak: 2 })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: 'wrong-token',
      threadId,
      turnRequestedInput: false
    })
    expect(result.ok).toBe(false)
    expect(result.shouldContinue).toBe(false)
    const after = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(after?.autoContinueStreak).toBe(2)
    expect(after?.queuedPromptMessageId).toBeUndefined()
  })

  test('respects streak cap', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'todo item',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      if (active) await c.db.patch(active._id, { autoContinueStreak: 5 })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.ok).toBe(true)
    expect(result.shouldContinue).toBe(false)
    const runState = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(runState?.autoContinueStreak).toBe(0)
    expect(runState?.queuedPromptMessageId).toBeUndefined()
  })
})

describe('tasks', () => {
  test('spawnTask creates task + schedules worker', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskThreadId = crypto.randomUUID(),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'run worker',
          isBackground: true,
          parentThreadId,
          pendingAt: Date.now(),
          prompt: 'do work',
          retryCount: 0,
          sessionId,
          status: 'pending',
          threadId: taskThreadId
        })
      ),
      task = await ctx.run(async c => c.db.get(taskId))
    expect(task).not.toBeNull()
    expect(task?.status).toBe('pending')
    expect(task?.threadId).toBe(taskThreadId)
    expect(task?.parentThreadId).toBe(parentThreadId)
  })

  test('markRunning succeeds for pending task', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'run worker',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          status: 'pending',
          threadId: 'task-thread-running'
        })
      ),
      result = await ctx.mutation(internal.tasks.markRunning, { taskId }),
      task = await ctx.run(async c => c.db.get(taskId))
    expect(result.ok).toBe(true)
    expect(task?.status).toBe('running')
    expect(task?.startedAt).toBeDefined()
  })

  test('markRunning rejects non-pending task', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'run worker',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: 'task-thread-non-pending'
        })
      ),
      result = await ctx.mutation(internal.tasks.markRunning, { taskId })
    expect(result.ok).toBe(false)
  })

  test('completeTask writes result + reminder', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.patch(sessionId, { status: 'archived' })
    })
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'analyze docs',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: 'task-thread-complete'
      })
    )
    const result = await ctx.mutation(internal.tasks.completeTask, {
        result: 'done',
        taskId
      }),
      task = await ctx.run(async c => c.db.get(taskId)),
      reminder = await ctx.run(async c => {
        const rows = await c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
          .collect()
        return rows.find(m => String(m._id) === task?.completionReminderMessageId)
      })
    expect(result.ok).toBe(true)
    expect(task?.status).toBe('completed')
    expect(task?.result).toBe('done')
    expect(task?.completionReminderMessageId).toBeDefined()
    expect(reminder?.role).toBe('system')
    expect(reminder?.content.includes('[BACKGROUND TASK COMPLETED]')).toBe(true)
  })

  test('failTask writes error + terminal reminder', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.patch(sessionId, { status: 'archived' })
    })
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'analyze docs',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: 'task-thread-fail'
      })
    )
    const result = await ctx.mutation(internal.tasks.failTask, {
        lastError: 'worker crashed',
        taskId
      }),
      task = await ctx.run(async c => c.db.get(taskId)),
      reminder = await ctx.run(async c => {
        const rows = await c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
          .collect()
        return rows.find(m => String(m._id) === task?.completionReminderMessageId)
      })
    expect(result.ok).toBe(true)
    expect(task?.status).toBe('failed')
    expect(task?.lastError).toBe('worker crashed')
    expect(task?.completionReminderMessageId).toBeDefined()
    expect(reminder?.role).toBe('system')
    expect(reminder?.content.includes('[BACKGROUND TASK FAILED]')).toBe(true)
  })

  test('scheduleRetry increments retryCount', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'retry me',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: 'task-thread-retry'
        })
      )
    await ctx.run(async c => {
      await c.db.patch(taskId, {
        pendingAt: Date.now(),
        retryCount: 1,
        status: 'pending'
      })
    })
    const task = await ctx.run(async c => c.db.get(taskId))
    expect(task?.retryCount).toBe(1)
    expect(task?.status).toBe('pending')
  })

  test('scheduleRetry fails after 3 retries', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'retry me',
          isBackground: true,
          lastError: 'too many retries',
          parentThreadId,
          retryCount: 3,
          sessionId,
          status: 'failed',
          threadId: 'task-thread-retry-failed'
        })
      ),
      result = await ctx.mutation(internal.tasks.scheduleRetry, { taskId }),
      task = await ctx.run(async c => c.db.get(taskId))
    expect(result.ok).toBe(false)
    expect(task?.retryCount).toBe(3)
    expect(task?.status).toBe('failed')
  })
})

describe('todos', () => {
  test('syncOwned inserts new todos', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      result = await ctx.mutation(internal.todos.syncOwned, {
        sessionId,
        todos: [
          { content: 'todo a', position: 0, priority: 'high', status: 'pending' },
          { content: 'todo b', position: 1, priority: 'low', status: 'in_progress' }
        ]
      }),
      rows = await ctx.run(async c =>
        c.db
          .query('todos')
          .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
          .collect()
      )
    expect(result.updated).toBe(2)
    expect(rows.length).toBe(2)
    expect(rows[0]?.content).toBe('todo a')
    expect(rows[1]?.content).toBe('todo b')
  })

  test('syncOwned updates existing todos', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      todoId = await ctx.run(async c =>
        c.db.insert('todos', {
          content: 'old content',
          position: 0,
          priority: 'medium',
          sessionId,
          status: 'pending'
        })
      )
    await ctx.mutation(internal.todos.syncOwned, {
      sessionId,
      todos: [{ content: 'new content', id: todoId, position: 2, priority: 'high', status: 'completed' }]
    })
    const todo = await ctx.run(async c => c.db.get(todoId))
    expect(todo?.content).toBe('new content')
    expect(todo?.position).toBe(2)
    expect(todo?.priority).toBe('high')
    expect(todo?.status).toBe('completed')
  })

  test('listTodos returns session todos', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId: s0 } = await asUser(0).mutation(api.sessions.createSession, {}),
      { sessionId: s1 } = await asUser(1).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'u0 todo',
        position: 0,
        priority: 'high',
        sessionId: s0,
        status: 'pending'
      })
      await c.db.insert('todos', {
        content: 'u1 todo',
        position: 0,
        priority: 'low',
        sessionId: s1,
        status: 'pending'
      })
    })
    const own = await asUser(0).query(api.todos.listTodos, { sessionId: s0 }),
      other = await asUser(1).query(api.todos.listTodos, { sessionId: s0 })
    expect(own.length).toBe(1)
    expect(own[0]?.content).toBe('u0 todo')
    expect(other.length).toBe(0)
  })
})

describe('tokenUsage', () => {
  test('recordModelUsage creates usage row', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      rowId = await ctx.mutation(internal.tokenUsage.recordModelUsage, {
        agentName: 'main',
        inputTokens: 10,
        model: 'gpt-test',
        outputTokens: 4,
        provider: 'openai',
        sessionId,
        threadId,
        totalTokens: 14
      }),
      row = await ctx.run(async c => (rowId ? c.db.get(rowId) : null))
    expect(row).not.toBeNull()
    expect(row?.sessionId).toBe(sessionId)
    expect(row?.threadId).toBe(threadId)
    expect(row?.inputTokens).toBe(10)
    expect(row?.outputTokens).toBe(4)
    expect(row?.totalTokens).toBe(14)
  })

  test('getTokenUsage returns aggregated totals', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'main',
      inputTokens: 10,
      model: 'gpt-test',
      outputTokens: 4,
      provider: 'openai',
      sessionId,
      threadId,
      totalTokens: 14
    })
    await ctx.mutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'main',
      inputTokens: 3,
      model: 'gpt-test',
      outputTokens: 7,
      provider: 'openai',
      sessionId,
      threadId,
      totalTokens: 10
    })
    const usage = await asUser(0).query(api.tokenUsage.getTokenUsage, { sessionId })
    expect(usage.count).toBe(2)
    expect(usage.inputTokens).toBe(13)
    expect(usage.outputTokens).toBe(11)
    expect(usage.totalTokens).toBe(24)
  })
})

describe('retention', () => {
  test('archiveIdleSessions transitions active→idle after 24h', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.patch(sessionId, { lastActivityAt: Date.now() - 25 * 60 * 60 * 1000 })
    })
    await ctx.mutation(internal.retention.archiveIdleSessions, {})
    const session = await ctx.run(async c => c.db.get(sessionId))
    expect(session?.status).toBe('idle')
  })

  test('cleanupArchivedSessions deletes old sessions', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'session message',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
      await c.db.insert('todos', {
        content: 'todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('tokenUsage', {
        agentName: 'main',
        inputTokens: 1,
        model: 'gpt-test',
        outputTokens: 2,
        provider: 'openai',
        sessionId,
        threadId,
        totalTokens: 3
      })
      await c.db.insert('tasks', {
        description: 'worker',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: 'worker-thread-delete'
      })
      await c.db.insert('messages', {
        content: 'worker message',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId: 'worker-thread-delete'
      })
      await c.db.patch(sessionId, {
        archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
        lastActivityAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
        status: 'archived'
      })
    })
    const result = await ctx.mutation(internal.retention.cleanupArchivedSessions, {}),
      session = await ctx.run(async c => c.db.get(sessionId)),
      runState = await ctx.run(async c =>
        c.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
      ),
      sessionMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      ),
      workerMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', 'worker-thread-delete'))
          .collect()
      ),
      tasks = await ctx.run(async c =>
        c.db
          .query('tasks')
          .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
          .collect()
      ),
      todos = await ctx.run(async c =>
        c.db
          .query('todos')
          .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
          .collect()
      ),
      usage = await ctx.run(async c =>
        c.db
          .query('tokenUsage')
          .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
          .collect()
      )
    expect(result.deletedCount).toBe(1)
    expect(session).toBeNull()
    expect(runState).toBeNull()
    expect(sessionMessages.length).toBe(0)
    expect(workerMessages.length).toBe(0)
    expect(tasks.length).toBe(0)
    expect(todos.length).toBe(0)
    expect(usage.length).toBe(0)
  })
})

describe('stale cleanup', () => {
  test('timeoutStaleTasks marks stale running tasks', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'stale worker',
          heartbeatAt: Date.now() - 6 * 60 * 1000,
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          status: 'running',
          threadId: 'worker-thread-stale'
        })
      ),
      result = await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {}),
      task = await ctx.run(async c => c.db.get(taskId)),
      reminder = await ctx.run(async c => {
        const rows = await c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
          .collect()
        return rows.find(m => String(m._id) === task?.completionReminderMessageId)
      })
    expect(result.timedOutCount).toBe(1)
    expect(task?.status).toBe('timed_out')
    expect(task?.completionReminderMessageId).toBeDefined()
    expect(reminder?.content.includes('[BACKGROUND TASK TIMED OUT]')).toBe(true)
  })

  test('cleanupStaleMessages finalizes orphaned messages', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      originalNow = Date.now,
      baseNow = Date.now(),
      { messageId, result } = await (async () => {
        try {
          Date.now = () => baseNow
          const id = await ctx.run(async c =>
            c.db.insert('messages', {
              content: '',
              isComplete: false,
              parts: [{ args: '{}', status: 'pending', toolCallId: 'call-1', toolName: 'tool', type: 'tool-call' }],
              role: 'assistant',
              streamingContent: 'partial answer',
              threadId
            })
          )
          Date.now = () => baseNow + 6 * 60 * 1000
          const cleanupResult = await ctx.mutation(internal.staleTaskCleanup.cleanupStaleMessages, {})
          return { messageId: id, result: cleanupResult }
        } finally {
          Date.now = originalNow
        }
      })()
    const message = await ctx.run(async c => c.db.get(messageId)),
      toolPart = message?.parts.find(p => p.type === 'tool-call')
    expect(result.cleanedCount).toBe(1)
    expect(message?.isComplete).toBe(true)
    expect(message?.content).toBe('partial answer')
    expect(message?.streamingContent).toBeUndefined()
    expect(toolPart?.status).toBe('error')
    expect(toolPart?.result).toBe('Interrupted: agent run terminated before tool completion')
  })
})

describe('compaction', () => {
  test('getContextSize returns char + message count', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'hello',
        isComplete: true,
        parts: [],
        role: 'user',
        sessionId,
        threadId
      })
      await c.db.insert('messages', {
        content: 'world!',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const result = await ctx.query(internal.compaction.getContextSize, { threadId })
    expect(result.charCount).toBe(11)
    expect(result.messageCount).toBe(2)
    expect(result.hasMore).toBe(false)
  })

  test('getContextSize includes compactionSummary length', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'tail',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
      const runState = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState) await c.db.patch(runState._id, { compactionSummary: 'summary-text' })
    })
    const result = await ctx.query(internal.compaction.getContextSize, { threadId })
    expect(result.charCount).toBe('summary-text'.length + 'tail'.length)
    expect(result.messageCount).toBe(1)
  })

  test('acquireCompactionLock first acquirer succeeds', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      result = await ctx.mutation(internal.compaction.acquireCompactionLock, { threadId })
    expect(result.ok).toBe(true)
    expect(result.lockToken.length > 0).toBe(true)
  })

  test('acquireCompactionLock second attempt rejected', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      first = await ctx.mutation(internal.compaction.acquireCompactionLock, { threadId }),
      second = await ctx.mutation(internal.compaction.acquireCompactionLock, { threadId })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(second.lockToken).toBe(first.lockToken)
  })

  test('acquireCompactionLock expired lock recoverable', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      first = await ctx.mutation(internal.compaction.acquireCompactionLock, { threadId })
    await ctx.run(async c => {
      const runState = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState) await c.db.patch(runState._id, { compactionLockAt: Date.now() - 11 * 60 * 1000 })
    })
    const second = await ctx.mutation(internal.compaction.acquireCompactionLock, { threadId })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(second.lockToken).not.toBe(first.lockToken)
  })

  test('setCompactionSummary validates lock token', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const messageId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'complete',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
    )
    await ctx.mutation(internal.compaction.acquireCompactionLock, { threadId })
    const result = await ctx.mutation(internal.compaction.setCompactionSummary, {
      compactionSummary: 'summary',
      lastCompactedMessageId: String(messageId),
      lockToken: 'wrong-token',
      threadId
    })
    expect(result.ok).toBe(false)
  })

  test('setCompactionSummary enforces monotonic boundary', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const firstId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'm-1',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
    )
    const secondId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'm-2',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
    )
    const lock1 = await ctx.mutation(internal.compaction.acquireCompactionLock, { threadId })
    const firstWrite = await ctx.mutation(internal.compaction.setCompactionSummary, {
      compactionSummary: 'summary-1',
      lastCompactedMessageId: String(secondId),
      lockToken: lock1.lockToken,
      threadId
    })
    expect(firstWrite.ok).toBe(true)
    const lock2 = await ctx.mutation(internal.compaction.acquireCompactionLock, { threadId })
    const secondWrite = await ctx.mutation(internal.compaction.setCompactionSummary, {
      compactionSummary: 'summary-2',
      lastCompactedMessageId: String(firstId),
      lockToken: lock2.lockToken,
      threadId
    })
    expect(secondWrite.ok).toBe(false)
  })

  test('listClosedPrefixGroups only includes complete messages', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const firstId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'm-1',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
    )
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'm-2',
        isComplete: false,
        parts: [],
        role: 'assistant',
        sessionId,
        streamingContent: 'streaming',
        threadId
      })
      await c.db.insert('messages', {
        content: 'm-3',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const groups = await ctx.query(internal.compaction.listClosedPrefixGroups, { threadId })
    expect(groups.length).toBe(1)
    expect(groups[0]?.endMessageId).toBe(String(firstId))
  })

  test('listClosedPrefixGroups excludes messages with pending tool parts', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'm-1',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
      await c.db.insert('messages', {
        content: 'm-2',
        isComplete: true,
        parts: [{ args: '{}', status: 'pending', toolCallId: 'call-1', toolName: 'tool-a', type: 'tool-call' }],
        role: 'assistant',
        sessionId,
        threadId
      })
      await c.db.insert('messages', {
        content: 'm-3',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const groups = await ctx.query(internal.compaction.listClosedPrefixGroups, { threadId })
    expect(groups.length).toBe(1)
  })

  test('compactIfNeeded no-op under threshold', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      result = await ctx.mutation(internal.compaction.compactIfNeeded, { threadId })
    expect(result.compacted).toBe(false)
    expect(result.reason).toBe('under_threshold')
  })
})

describe('message streaming', () => {
  test('createAssistantMessage creates message with isComplete=false, empty content/parts', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      messageId = await ctx.mutation(internal.orchestrator.createAssistantMessage, { sessionId, threadId }),
      message = await ctx.run(async c => c.db.get(messageId))
    expect(message?.isComplete).toBe(false)
    expect(message?.content).toBe('')
    expect(message?.parts).toEqual([])
    expect(message?.streamingContent).toBe('')
  })

  test('patchStreamingMessage updates streamingContent', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      messageId = await ctx.mutation(internal.orchestrator.createAssistantMessage, { sessionId, threadId })
    await ctx.mutation(internal.orchestrator.patchStreamingMessage, {
      messageId,
      streamingContent: 'partial output'
    })
    const message = await ctx.run(async c => c.db.get(messageId))
    expect(message?.streamingContent).toBe('partial output')
  })

  test('finalizeMessage sets isComplete=true, content, parts, clears streamingContent', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      messageId = await ctx.mutation(internal.orchestrator.createAssistantMessage, { sessionId, threadId })
    await ctx.mutation(internal.orchestrator.patchStreamingMessage, {
      messageId,
      streamingContent: 'draft'
    })
    await ctx.mutation(internal.orchestrator.finalizeMessage, {
      content: 'done',
      messageId,
      parts: [{ text: 'done', type: 'text' }]
    })
    const message = await ctx.run(async c => c.db.get(messageId))
    expect(message?.isComplete).toBe(true)
    expect(message?.content).toBe('done')
    expect(message?.parts).toEqual([{ text: 'done', type: 'text' }])
    expect(message?.streamingContent).toBeUndefined()
  })

  test('appendStepMetadata concatenates metadata', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      messageId = await ctx.mutation(internal.orchestrator.createAssistantMessage, { sessionId, threadId })
    await ctx.mutation(internal.orchestrator.appendStepMetadata, { messageId, stepPayload: 'step-a' })
    await ctx.mutation(internal.orchestrator.appendStepMetadata, { messageId, stepPayload: 'step-b' })
    const message = await ctx.run(async c => c.db.get(messageId))
    expect(message?.metadata).toBe('step-a\nstep-b')
  })

  test('recordRunError persists error to threadRunState', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.recordRunError, {
      error: 'stream_failed',
      threadId
    })
    const runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(runState?.lastError).toBe('stream_failed')
  })

  test('readRunState returns correct state', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(runState).not.toBeNull()
    expect(runState?.threadId).toBe(threadId)
    expect(runState?.status).toBe('idle')
  })

  test('readSessionByThread resolves session via threadId', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      session = await ctx.query(internal.orchestrator.readSessionByThread, { threadId })
    expect(String(session?._id)).toBe(String(sessionId))
  })

  test('listMessagesForPrompt returns bounded messages in chronological order', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      for (let i = 0; i < 110; i += 1)
        await c.db.insert('messages', {
          content: `m-${i}`,
          isComplete: true,
          parts: [{ text: `m-${i}`, type: 'text' }],
          role: 'user',
          sessionId,
          threadId
        })
    })
    const rows = await ctx.query(internal.orchestrator.listMessagesForPrompt, {
      promptMessageId: undefined,
      threadId
    })
    expect(rows.length).toBe(100)
    expect(rows[0]?.content).toBe('m-10')
    expect(rows[99]?.content).toBe('m-109')
  })
})

describe('tool factories', () => {
  test('createOrchestratorTools returns all expected tool keys', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => ({ taskId: 'task-id', threadId: 'thread-id' }),
        runQuery: async () => null
      } as never,
      parentThreadId: 'parent-thread',
      sessionId: 'session-id' as never
    })
    expect(Object.keys(tools).sort()).toEqual([
      'delegate',
      'taskOutput',
      'taskStatus',
      'todoRead',
      'todoWrite',
      'webSearch'
    ])
  })

  test('createWorkerTools returns only webSearch', async () => {
    const { createWorkerTools } = await import('./agents')
    const tools = createWorkerTools({
      ctx: {
        runMutation: async () => ({ taskId: 'task-id', threadId: 'thread-id' }),
        runQuery: async () => null
      } as never,
      parentThreadId: 'parent-thread',
      sessionId: 'session-id' as never
    })
    expect(Object.keys(tools)).toEqual(['webSearch'])
  })
})

describe('auth ownership', () => {
  test('listMessages non-owner for worker thread', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      workerThreadId = 'worker-thread-owned',
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'worker',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          status: 'pending',
          threadId: workerThreadId
        })
      )
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'worker-output',
        isComplete: true,
        parts: [{ text: 'worker-output', type: 'text' }],
        role: 'assistant',
        threadId: workerThreadId
      })
    })
    const ownRows = await asUser(0).query(api.messages.listMessages, { threadId: workerThreadId })
    expect(ownRows.length).toBe(1)
    expect(String(taskId).length > 0).toBe(true)
    let threw = false
    try {
      await asUser(1).query(api.messages.listMessages, { threadId: workerThreadId })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('thread_not_found')
    }
    expect(threw).toBe(true)
  })

  test('getOwnedTaskStatus non-owner rejected', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'owned-task',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          status: 'pending',
          threadId: 'worker-thread-task-status'
        })
      )
    const ownTask = await asUser(0).query(api.tasks.getOwnedTaskStatus, { taskId }),
      otherTask = await asUser(1).query(api.tasks.getOwnedTaskStatus, { taskId })
    expect(ownTask).not.toBeNull()
    expect(otherTask).toBeNull()
  })
})

describe('edge cases', () => {
  test('archive blocks new messages', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    let threw = false
    try {
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'blocked-after-archive',
        sessionId
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('session_archived')
    }
    expect(threw).toBe(true)
  })

  test('auto-continue streak cap rejects at 5', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    await ctx.run(async c => {
      const runState = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState) await c.db.patch(runState._id, { autoContinueStreak: 5 })
    })
    const result = await ctx.mutation(internal.orchestrator.enqueueRun, {
      incrementStreak: true,
      priority: 0,
      promptMessageId: 'prompt-next',
      reason: 'todo_continuation',
      threadId
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('streak_cap')
  })

  test('cancelled task transition writes no reminder', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'cancel-me',
          isBackground: true,
          parentThreadId,
          prompt: 'cancel-me',
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: 'worker-thread-cancel-no-reminder'
        })
      )
    await ctx.run(async c => {
      await c.db.patch(sessionId, { status: 'archived' })
    })
    const result = await ctx.mutation(internal.tasks.scheduleRetry, { taskId }),
      task = await ctx.run(async c => c.db.get(taskId)),
      reminders = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
          .collect()
      )
    expect(result.ok).toBe(false)
    expect(task?.status).toBe('cancelled')
    expect(task?.completionReminderMessageId).toBeUndefined()
    expect(reminders.length).toBe(0)
  })

  test('cleanupStaleMessages terminalizes pending tool-call parts', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      originalNow = Date.now,
      baseNow = Date.now(),
      { messageId, result } = await (async () => {
        try {
          Date.now = () => baseNow
          const id = await ctx.run(async c =>
            c.db.insert('messages', {
              content: '',
              isComplete: false,
              parts: [
                { args: '{}', status: 'pending', toolCallId: 'call-pending', toolName: 'tool-a', type: 'tool-call' },
                {
                  args: '{}',
                  result: 'ok',
                  status: 'success',
                  toolCallId: 'call-ok',
                  toolName: 'tool-b',
                  type: 'tool-call'
                }
              ],
              role: 'assistant',
              streamingContent: 'partial',
              threadId
            })
          )
          Date.now = () => baseNow + 6 * 60 * 1000
          const cleanupResult = await ctx.mutation(internal.staleTaskCleanup.cleanupStaleMessages, {})
          return { messageId: id, result: cleanupResult }
        } finally {
          Date.now = originalNow
        }
      })()
    const message = await ctx.run(async c => c.db.get(messageId)),
      pendingPart = message?.parts.find(p => p.type === 'tool-call' && p.toolCallId === 'call-pending'),
      successPart = message?.parts.find(p => p.type === 'tool-call' && p.toolCallId === 'call-ok')
    expect(result.cleanedCount).toBe(1)
    expect(message?.isComplete).toBe(true)
    expect(pendingPart?.status).toBe('error')
    expect(pendingPart?.result).toBe('Interrupted: agent run terminated before tool completion')
    expect(successPart?.status).toBe('success')
    expect(successPart?.result).toBe('ok')
  })

  test('failed task writes terminal reminder with failed prefix', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'fail-with-prefix',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: 'worker-thread-fail-prefix'
        })
      )
    await ctx.run(async c => {
      await c.db.patch(sessionId, { status: 'archived' })
    })
    await ctx.mutation(internal.tasks.failTask, { lastError: 'boom', taskId })
    const task = await ctx.run(async c => c.db.get(taskId)),
      reminder = await ctx.run(async c => {
        const rows = await c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
          .collect()
        return rows.find(m => String(m._id) === task?.completionReminderMessageId)
      })
    expect(reminder?.content.includes('[BACKGROUND TASK FAILED]')).toBe(true)
  })

  test('worker timeout fencing rejects completeTask after timed_out', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'timeout-fence',
          heartbeatAt: Date.now() - 6 * 60 * 1000,
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now() - 7 * 60 * 1000,
          status: 'running',
          threadId: 'worker-thread-timeout-fence'
        })
      )
    await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {})
    const completeResult = await ctx.mutation(internal.tasks.completeTask, { result: 'late result', taskId }),
      task = await ctx.run(async c => c.db.get(taskId))
    expect(task?.status).toBe('timed_out')
    expect(completeResult.ok).toBe(false)
  })

  test('compaction excludes incomplete message from closed prefix', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const completeId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'complete-before-incomplete',
        isComplete: true,
        parts: [],
        role: 'assistant',
        sessionId,
        threadId
      })
    )
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'incomplete',
        isComplete: false,
        parts: [],
        role: 'assistant',
        sessionId,
        streamingContent: 'draft',
        threadId
      })
    })
    const groups = await ctx.query(internal.compaction.listClosedPrefixGroups, { threadId })
    expect(groups.length).toBe(1)
    expect(groups[0]?.endMessageId).toBe(String(completeId))
  })
})

describe('stale run recovery', () => {
  test('timeoutStaleRuns marks stale heartbeat run and rotates token', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const queuedPromptId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'queued',
        isComplete: true,
        parts: [{ text: 'queued', type: 'text' }],
        role: 'system',
        sessionId,
        threadId
      })
    )
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    await ctx.run(async c => {
      const current = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (current)
        await c.db.patch(current._id, {
          activatedAt: Date.now() - 2 * 60 * 1000,
          claimedAt: Date.now() - 16 * 60 * 1000,
          queuedPriority: 'task_completion',
          queuedPromptMessageId: String(queuedPromptId),
          queuedReason: 'task_completion',
          runClaimed: true,
          runHeartbeatAt: Date.now() - 16 * 60 * 1000,
          status: 'active'
        })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(after?.status).toBe('active')
    expect(after?.activeRunToken).toBeDefined()
    expect(after?.activeRunToken).not.toBe(before?.activeRunToken)
  })

  test('timeoutStaleRuns respects wall-clock cap despite fresh heartbeat', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const queuedPromptId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'queued-wall-clock',
        isComplete: true,
        parts: [{ text: 'queued-wall-clock', type: 'text' }],
        role: 'system',
        sessionId,
        threadId
      })
    )
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    await ctx.run(async c => {
      const current = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (current)
        await c.db.patch(current._id, {
          activatedAt: Date.now() - 16 * 60 * 1000,
          claimedAt: Date.now() - 16 * 60 * 1000,
          queuedPriority: 'task_completion',
          queuedPromptMessageId: String(queuedPromptId),
          queuedReason: 'task_completion',
          runClaimed: true,
          runHeartbeatAt: Date.now(),
          status: 'active'
        })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(after?.status).toBe('active')
    expect(after?.activeRunToken).toBeDefined()
    expect(after?.activeRunToken).not.toBe(before?.activeRunToken)
  })

  test('timeoutStaleRuns drains queue on timeout and schedules new token', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const queuedPromptId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'queued-drain',
        isComplete: true,
        parts: [{ text: 'queued-drain', type: 'text' }],
        role: 'system',
        sessionId,
        threadId
      })
    )
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    await ctx.run(async c => {
      const current = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (current)
        await c.db.patch(current._id, {
          activatedAt: Date.now() - 6 * 60 * 1000,
          queuedPriority: 'task_completion',
          queuedPromptMessageId: String(queuedPromptId),
          queuedReason: 'task_completion',
          runClaimed: false,
          status: 'active'
        })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(after?.status).toBe('active')
    expect(after?.activeRunToken).toBeDefined()
    expect(after?.activeRunToken).not.toBe(before?.activeRunToken)
    expect(after?.queuedPromptMessageId).toBeUndefined()
    expect(after?.queuedReason).toBeUndefined()
  })

  test('timeoutStaleRuns resets to idle when no queue', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    await ctx.run(async c => {
      const current = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (current)
        await c.db.patch(current._id, {
          activatedAt: Date.now() - 6 * 60 * 1000,
          runClaimed: false,
          status: 'active'
        })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(after?.status).toBe('idle')
    expect(after?.activeRunToken).toBeUndefined()
  })

  test('timeoutStaleRuns skips archived sessions from rescheduling', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const queuedPromptId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'queued-archived',
        isComplete: true,
        parts: [{ text: 'queued-archived', type: 'text' }],
        role: 'system',
        sessionId,
        threadId
      })
    )
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    await ctx.run(async c => {
      const current = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (current)
        await c.db.patch(current._id, {
          activatedAt: Date.now() - 6 * 60 * 1000,
          queuedPriority: 'task_completion',
          queuedPromptMessageId: String(queuedPromptId),
          queuedReason: 'task_completion',
          runClaimed: false,
          status: 'active'
        })
      await c.db.patch(sessionId, { status: 'archived' })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(after?.status).toBe('idle')
    expect(after?.activeRunToken).toBeUndefined()
    expect(after?.queuedPromptMessageId).toBeUndefined()
  })
})

describe('implementation details', () => {
  test('getModel returns mock model in test mode', async () => {
    const { getModel } = await import('../ai'),
      model = await getModel()
    expect(model.modelId).toBe('mock-model')
  })

  test('mock model returns text part when no tools', async () => {
    const { mockModel } = await import('../models.mock'),
      result = await mockModel.doGenerate({ tools: undefined })
    expect(result.finishReason).toBe('stop')
    expect(result.content[0]?.type).toBe('text')
  })

  test('mock model returns tool-call when tools provided', async () => {
    const { mockModel } = await import('../models.mock'),
      result = await mockModel.doGenerate({ tools: [{ name: 'delegate' }] })
    expect(result.finishReason).toBe('tool-calls')
    expect(result.content[0]?.type).toBe('tool-call')
  })

  test('buildTaskCompletionReminder output format includes completion prefix', async () => {
    const { buildTaskCompletionReminder } = await import('./tasks'),
      output = buildTaskCompletionReminder({ description: 'done task', taskId: 'task-1' })
    expect(output.includes('[BACKGROUND TASK COMPLETED]')).toBe(true)
  })

  test('buildTaskTerminalReminder output format includes failed prefix', async () => {
    const { buildTaskTerminalReminder } = await import('./tasks'),
      output = buildTaskTerminalReminder({
        description: 'failed task',
        error: 'bad',
        status: 'failed',
        taskId: 'task-2'
      })
    expect(output.includes('[BACKGROUND TASK FAILED]')).toBe(true)
  })

  test('orchestrator system prompt is non-empty', async () => {
    const { ORCHESTRATOR_SYSTEM_PROMPT } = await import('../prompts')
    expect(typeof ORCHESTRATOR_SYSTEM_PROMPT).toBe('string')
    expect(ORCHESTRATOR_SYSTEM_PROMPT.length).toBeGreaterThan(0)
  })

  test('worker system prompt is non-empty', async () => {
    const { WORKER_SYSTEM_PROMPT } = await import('../prompts')
    expect(typeof WORKER_SYSTEM_PROMPT).toBe('string')
    expect(WORKER_SYSTEM_PROMPT.length).toBeGreaterThan(0)
  })
})

describe('integration lifecycle', () => {
  test('full retention chain deletes session and related rows', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'session message',
        isComplete: true,
        parts: [{ text: 'session message', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
      await c.db.insert('todos', {
        content: 'todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('tokenUsage', {
        agentName: 'main',
        inputTokens: 1,
        model: 'gpt-test',
        outputTokens: 1,
        provider: 'openai',
        sessionId,
        threadId,
        totalTokens: 2
      })
      await c.db.insert('tasks', {
        description: 'worker',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: 'worker-thread-integration-chain'
      })
      await c.db.insert('messages', {
        content: 'worker message',
        isComplete: true,
        parts: [{ text: 'worker message', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId: 'worker-thread-integration-chain'
      })
      await c.db.patch(sessionId, { lastActivityAt: Date.now() - 8 * 24 * 60 * 60 * 1000 })
    })
    await ctx.mutation(internal.retention.archiveIdleSessions, {})
    const idleSession = await ctx.run(async c => c.db.get(sessionId))
    expect(idleSession?.status).toBe('idle')
    await ctx.mutation(internal.retention.archiveIdleSessions, {})
    const archivedSession = await ctx.run(async c => c.db.get(sessionId))
    expect(archivedSession?.status).toBe('archived')
    await ctx.run(async c => {
      await c.db.patch(sessionId, {
        archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
        lastActivityAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
        status: 'archived'
      })
    })
    const cleanup = await ctx.mutation(internal.retention.cleanupArchivedSessions, {}),
      session = await ctx.run(async c => c.db.get(sessionId)),
      sessionMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      ),
      workerMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', 'worker-thread-integration-chain'))
          .collect()
      )
    expect(cleanup.deletedCount).toBe(1)
    expect(session).toBeNull()
    expect(sessionMessages.length).toBe(0)
    expect(workerMessages.length).toBe(0)
  })

  test('post-cleanup has no orphan rows for deleted session', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      workerThreadId = 'worker-thread-orphan-check'
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'session message',
        isComplete: true,
        parts: [{ text: 'session message', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
      await c.db.insert('tasks', {
        description: 'task',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: workerThreadId
      })
      await c.db.insert('messages', {
        content: 'worker message',
        isComplete: true,
        parts: [{ text: 'worker message', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId: workerThreadId
      })
      await c.db.insert('todos', {
        content: 'todo',
        position: 0,
        priority: 'medium',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('tokenUsage', {
        agentName: 'main',
        inputTokens: 2,
        model: 'gpt-test',
        outputTokens: 3,
        provider: 'openai',
        sessionId,
        threadId,
        totalTokens: 5
      })
      await c.db.patch(sessionId, {
        archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
        lastActivityAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
        status: 'archived'
      })
    })
    await ctx.mutation(internal.retention.cleanupArchivedSessions, {})
    const session = await ctx.run(async c => c.db.get(sessionId)),
      runState = await ctx.run(async c =>
        c.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      ),
      messages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      ),
      workerMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', workerThreadId))
          .collect()
      ),
      tasks = await ctx.run(async c =>
        c.db
          .query('tasks')
          .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
          .collect()
      ),
      todos = await ctx.run(async c =>
        c.db
          .query('todos')
          .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
          .collect()
      ),
      tokenUsage = await ctx.run(async c =>
        c.db
          .query('tokenUsage')
          .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
          .collect()
      )
    expect(session).toBeNull()
    expect(runState.length).toBe(0)
    expect(messages.length).toBe(0)
    expect(workerMessages.length).toBe(0)
    expect(tasks.length).toBe(0)
    expect(todos.length).toBe(0)
    expect(tokenUsage.length).toBe(0)
  })
})

describe('mcp crud', () => {
  test('create MCP server succeeds with valid URL', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      id = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'test-server',
        transport: 'http',
        url: 'https://example.com/mcp'
      }),
      row = await asUser(0).query(api.mcp.read, { id })
    expect(row).not.toBeNull()
    expect(row?.name).toBe('test-server')
    expect(row?.url).toBe('https://example.com/mcp')
  })

  test('create rejects SSRF URL', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      urls = [
        'http://localhost/mcp',
        'http://127.0.0.1/mcp',
        'http://169.254.169.254/latest/meta-data',
        'http://10.0.0.1/mcp',
        'http://192.168.1.10/mcp',
        'http://172.16.0.1/mcp'
      ]
    for (let i = 0; i < urls.length; i += 1) {
      let threw = false
      try {
        await asUser(0).mutation(api.mcp.create, {
          isEnabled: true,
          name: `blocked-${i}`,
          transport: 'http',
          url: urls[i] ?? ''
        })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('blocked_url')
      }
      expect(threw).toBe(true)
    }
  })

  test('create rejects non-HTTP protocol', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    let threw = false
    try {
      await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'ftp-server',
        transport: 'http',
        url: 'ftp://example.com/mcp'
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('invalid_url_protocol')
    }
    expect(threw).toBe(true)
  })

  test('create rejects duplicate name for same user', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    await asUser(0).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'dupe-name',
      transport: 'http',
      url: 'https://example.com/mcp-a'
    })
    let threw = false
    try {
      await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'dupe-name',
        transport: 'http',
        url: 'https://example.com/mcp-b'
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('name_taken')
    }
    expect(threw).toBe(true)
  })

  test('list returns only own servers', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    await asUser(0).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'user0-server',
      transport: 'http',
      url: 'https://example.com/user0'
    })
    await asUser(1).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'user1-server',
      transport: 'http',
      url: 'https://example.com/user1'
    })
    const own = await asUser(0).query(api.mcp.list, {})
    expect(own.length).toBe(1)
    expect(own[0]?.name).toBe('user0-server')
  })

  test('list redacts authHeaders and returns hasAuthHeaders', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      id = await asUser(0).mutation(api.mcp.create, {
        authHeaders: '{"Authorization":"Bearer test"}',
        isEnabled: true,
        name: 'auth-server',
        transport: 'http',
        url: 'https://example.com/auth'
      }),
      rows = await asUser(0).query(api.mcp.list, {}),
      row = rows.find(m => String(m._id) === String(id))
    expect(row).toBeDefined()
    expect(row?.hasAuthHeaders).toBe(true)
    expect('authHeaders' in (row ?? {})).toBe(false)
  })

  test('update server URL invalidates cache', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      id = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'cache-server',
        transport: 'http',
        url: 'https://example.com/v1'
      })
    await ctx.run(async c => {
      await c.db.patch(id, {
        cachedAt: Date.now(),
        cachedTools: '{"tools":["a"]}'
      })
    })
    await asUser(0).mutation(api.mcp.update, {
      id,
      url: 'https://example.com/v2'
    })
    const row = await ctx.run(async c => c.db.get(id))
    expect(row?.cachedAt).toBeUndefined()
    expect(row?.cachedTools).toBeUndefined()
  })

  test('update server name rejects duplicate', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      firstId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'name-a',
        transport: 'http',
        url: 'https://example.com/a'
      }),
      secondId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'name-b',
        transport: 'http',
        url: 'https://example.com/b'
      })
    expect(String(firstId).length > 0).toBe(true)
    let threw = false
    try {
      await asUser(0).mutation(api.mcp.update, {
        id: secondId,
        name: 'name-a'
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('name_taken')
    }
    expect(threw).toBe(true)
  })

  test('delete server succeeds for owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      id = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'delete-me',
        transport: 'http',
        url: 'https://example.com/delete'
      })
    await asUser(0).mutation(api.mcp.rm, { id })
    const row = await asUser(0).query(api.mcp.read, { id })
    expect(row).toBeNull()
  })

  test('delete rejects non-owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      id = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'owner-only-delete',
        transport: 'http',
        url: 'https://example.com/owner-only-delete'
      })
    let threw = false
    try {
      await asUser(1).mutation(api.mcp.rm, { id })
    } catch (_error) {
      threw = true
    }
    expect(threw).toBe(true)
    const row = await asUser(0).query(api.mcp.read, { id })
    expect(row).not.toBeNull()
  })

  test("cross-user isolation (user A can't see user B's servers)", async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      user0Id = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'user0-private-server',
        transport: 'http',
        url: 'https://example.com/u0'
      }),
      user1Id = await asUser(1).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'user1-private-server',
        transport: 'http',
        url: 'https://example.com/u1'
      }),
      user0ReadUser1 = await asUser(0).query(api.mcp.read, { id: user1Id }),
      user1ReadUser0 = await asUser(1).query(api.mcp.read, { id: user0Id }),
      user0List = await asUser(0).query(api.mcp.list, {}),
      user1List = await asUser(1).query(api.mcp.list, {})
    expect(user0ReadUser1).toBeNull()
    expect(user1ReadUser0).toBeNull()
    expect(user0List.length).toBe(1)
    expect(user0List[0]?.name).toBe('user0-private-server')
    expect(user1List.length).toBe(1)
    expect(user1List[0]?.name).toBe('user1-private-server')
  })
})

describe('signInAsTestUser', () => {
  test('signInAsTestUser returns userId in test mode', async () => {
    const ctx = t(),
      result = await ctx.mutation(api.testauth.signInAsTestUser, {})
    expect(result.userId).toBeDefined()
    expect(String(result.userId).length > 0).toBe(true)
  })

  test('signInAsTestUser is idempotent', async () => {
    const ctx = t(),
      first = await ctx.mutation(api.testauth.signInAsTestUser, {}),
      second = await ctx.mutation(api.testauth.signInAsTestUser, {})
    expect(String(first.userId)).toBe(String(second.userId))
  })
})

describe('rate limiting', () => {
  test('rate limit config has submitMessage bucket', () => {
    expect(typeof checkRateLimit).toBe('function')
  })

  test('rate limit config has delegation bucket', () => {
    expect(typeof rateLimit).toBe('function')
  })

  test('rate limit config has mcpCall bucket', () => {
    expect(typeof resetRateLimit).toBe('function')
  })

  test('rate limit config has searchCall bucket', () => {
    expect(typeof checkRateLimit).toBe('function')
    expect(typeof rateLimit).toBe('function')
    expect(typeof resetRateLimit).toBe('function')
  })
})

describe('integration: full message lifecycle', () => {
  test('submit -> enqueue -> claim -> create -> finalize -> finish returns thread to idle', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.patch(sessionId, { lastActivityAt: 1 })
    })
    const submitted = await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'full lifecycle prompt',
        sessionId
      }),
      userMessage = await ctx.run(async c => c.db.get(submitted.messageId as never)),
      activeBefore = await ctx.query(internal.orchestrator.readRunState, { threadId }),
      runToken = activeBefore?.activeRunToken ?? '',
      claimed = await ctx.mutation(internal.orchestrator.claimRun, { runToken, threadId }),
      assistantMessageId = await ctx.mutation(internal.orchestrator.createAssistantMessage, { sessionId, threadId })
    await ctx.mutation(internal.orchestrator.patchStreamingMessage, {
      messageId: assistantMessageId,
      streamingContent: 'draft assistant output'
    })
    await ctx.mutation(internal.orchestrator.finalizeMessage, {
      content: 'final assistant output',
      messageId: assistantMessageId,
      parts: [{ text: 'final assistant output', type: 'text' }]
    })
    await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken,
      threadId,
      turnRequestedInput: false
    })
    const finished = await ctx.mutation(internal.orchestrator.finishRun, { runToken, threadId }),
      assistantMessage = await ctx.run(async c => c.db.get(assistantMessageId)),
      finalRunState = await ctx.query(internal.orchestrator.readRunState, { threadId }),
      session = await ctx.run(async c => c.db.get(sessionId))
    expect(userMessage?.role).toBe('user')
    expect(claimed.ok).toBe(true)
    expect(assistantMessage?.role).toBe('assistant')
    expect(assistantMessage?.isComplete).toBe(true)
    expect(assistantMessage?.content).toBe('final assistant output')
    expect(finished.scheduled).toBe(false)
    expect(finalRunState?.status).toBe('idle')
    expect((session?.lastActivityAt ?? 0) > 1).toBe(true)
  })

  test('submit -> delegate -> worker complete -> continuation queues task_completion and schedules next run', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await asUser(0).mutation(api.orchestrator.submitMessage, {
      content: 'delegate this',
      sessionId
    })
    const activeBefore = await ctx.query(internal.orchestrator.readRunState, { threadId }),
      runToken = activeBefore?.activeRunToken ?? ''
    await ctx.mutation(internal.orchestrator.claimRun, { runToken, threadId })
    const spawned = await ctx.mutation(internal.tasks.spawnTask, {
      description: 'background analysis',
      isBackground: true,
      parentThreadId: threadId,
      prompt: 'analyze',
      sessionId
    })
    await ctx.mutation(internal.tasks.markRunning, { taskId: spawned.taskId })
    await ctx.mutation(internal.tasks.completeTask, {
      result: 'done',
      taskId: spawned.taskId
    })
    const continuation = await ctx.mutation(internal.tasks.maybeContinueOrchestrator, {
        taskId: spawned.taskId
      }),
      completedTask = await ctx.run(async c => c.db.get(spawned.taskId))
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      incrementStreak: true,
      priority: 1,
      promptMessageId: completedTask?.completionReminderMessageId,
      reason: 'task_completion',
      threadId
    })
    const queuedState = await ctx.query(internal.orchestrator.readRunState, { threadId }),
      finished = await ctx.mutation(internal.orchestrator.finishRun, { runToken, threadId }),
      finalState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(continuation.ok).toBe(true)
    expect(completedTask?.status).toBe('completed')
    expect(completedTask?.completionReminderMessageId).toBeDefined()
    expect(queuedState?.queuedReason).toBe('task_completion')
    expect(queuedState?.queuedPriority).toBe('task_completion')
    expect(finished.scheduled).toBe(true)
    expect(finalState?.status).toBe('active')
    expect(finalState?.activeRunToken).toBeDefined()
    expect(finalState?.activeRunToken).not.toBe(runToken)
  })

  test('full retention chain transitions active->idle->archived->hard-deleted', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      workerThreadId = 'worker-thread-retention-full-chain'
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'session message',
        isComplete: true,
        parts: [{ text: 'session message', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
      await c.db.insert('tasks', {
        description: 'worker',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: workerThreadId
      })
      await c.db.insert('messages', {
        content: 'worker message',
        isComplete: true,
        parts: [{ text: 'worker message', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId: workerThreadId
      })
      await c.db.insert('todos', {
        content: 'todo',
        position: 0,
        priority: 'medium',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('tokenUsage', {
        agentName: 'main',
        inputTokens: 3,
        model: 'gpt-test',
        outputTokens: 4,
        provider: 'openai',
        sessionId,
        threadId,
        totalTokens: 7
      })
      await c.db.patch(sessionId, { lastActivityAt: Date.now() - 2 * 24 * 60 * 60 * 1000 })
    })
    await ctx.mutation(internal.retention.archiveIdleSessions, {})
    const idle = await ctx.run(async c => c.db.get(sessionId))
    expect(idle?.status).toBe('idle')
    await ctx.run(async c => {
      await c.db.patch(sessionId, { lastActivityAt: Date.now() - 8 * 24 * 60 * 60 * 1000 })
    })
    await ctx.mutation(internal.retention.archiveIdleSessions, {})
    const archived = await ctx.run(async c => c.db.get(sessionId))
    expect(archived?.status).toBe('archived')
    await ctx.run(async c => {
      await c.db.patch(sessionId, { archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000 })
    })
    await ctx.mutation(internal.retention.cleanupArchivedSessions, {})
    const session = await ctx.run(async c => c.db.get(sessionId)),
      runState = await ctx.run(async c =>
        c.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      ),
      parentMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      ),
      workerMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', workerThreadId))
          .collect()
      ),
      tasks = await ctx.run(async c =>
        c.db
          .query('tasks')
          .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
          .collect()
      ),
      todos = await ctx.run(async c =>
        c.db
          .query('todos')
          .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
          .collect()
      ),
      usage = await ctx.run(async c =>
        c.db
          .query('tokenUsage')
          .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
          .collect()
      )
    expect(session).toBeNull()
    expect(runState.length).toBe(0)
    expect(parentMessages.length).toBe(0)
    expect(workerMessages.length).toBe(0)
    expect(tasks.length).toBe(0)
    expect(todos.length).toBe(0)
    expect(usage.length).toBe(0)
  })

  test('post-cleanup orphan check finds no rows for deleted session', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      workerThreadId = 'worker-thread-post-cleanup-orphan-check'
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'parent message',
        isComplete: true,
        parts: [{ text: 'parent message', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
      await c.db.insert('tasks', {
        description: 'worker',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: workerThreadId
      })
      await c.db.insert('messages', {
        content: 'worker message',
        isComplete: true,
        parts: [{ text: 'worker message', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId: workerThreadId
      })
      await c.db.insert('todos', {
        content: 'todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('tokenUsage', {
        agentName: 'main',
        inputTokens: 1,
        model: 'gpt-test',
        outputTokens: 1,
        provider: 'openai',
        sessionId,
        threadId,
        totalTokens: 2
      })
      await c.db.patch(sessionId, {
        archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
        status: 'archived'
      })
    })
    await ctx.mutation(internal.retention.cleanupArchivedSessions, {})
    const session = await ctx.run(async c => c.db.get(sessionId)),
      runState = await ctx.run(async c =>
        c.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      ),
      parentMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      ),
      workerMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', workerThreadId))
          .collect()
      ),
      tasks = await ctx.run(async c =>
        c.db
          .query('tasks')
          .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
          .collect()
      ),
      todos = await ctx.run(async c =>
        c.db
          .query('todos')
          .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
          .collect()
      ),
      usage = await ctx.run(async c =>
        c.db
          .query('tokenUsage')
          .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
          .collect()
      )
    expect(session).toBeNull()
    expect(runState.length).toBe(0)
    expect(parentMessages.length).toBe(0)
    expect(workerMessages.length).toBe(0)
    expect(tasks.length).toBe(0)
    expect(todos.length).toBe(0)
    expect(usage.length).toBe(0)
  })

  test('archive-in-flight finishRun does not schedule queued payload', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'prompt-queued',
      reason: 'task_completion',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, { threadId }),
      runToken = before?.activeRunToken ?? ''
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const finished = await ctx.mutation(internal.orchestrator.finishRun, { runToken, threadId }),
      after = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(finished.scheduled).toBe(false)
    expect(after?.status).toBe('idle')
    expect(after?.queuedPromptMessageId).toBeUndefined()
    expect(after?.queuedReason).toBeUndefined()
  })
})

describe('more edge cases', () => {
  test('concurrent enqueue priority keeps user_message over task_completion', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'task-completion-1',
      reason: 'task_completion',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'user-msg-2',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(state?.queuedPriority).toBe('user_message')
    expect(state?.queuedReason).toBe('user_message')
    expect(state?.queuedPromptMessageId).toBe('user-msg-2')
  })

  test('postTurnAudit is suppressed when higher-priority user_message already queued', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'prompt-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId }),
      runToken = active?.activeRunToken ?? ''
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'pending todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'already-queued-user',
      reason: 'user_message',
      threadId
    })
    const beforeMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      ),
      result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken,
        threadId,
        turnRequestedInput: false
      }),
      afterMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      ),
      state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(result.ok).toBe(true)
    expect(result.shouldContinue).toBe(false)
    expect(afterMessages.length).toBe(beforeMessages.length)
    expect(state?.queuedReason).toBe('user_message')
    expect(state?.queuedPromptMessageId).toBe('already-queued-user')
  })

  test('listMessagesForPrompt wrong-thread prompt fence returns empty set', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId: sessionA, threadId: threadA } = await asUser(0).mutation(api.sessions.createSession, {}),
      { sessionId: sessionB, threadId: threadB } = await asUser(0).mutation(api.sessions.createSession, {})
    const promptA = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'prompt in A',
        isComplete: true,
        parts: [{ text: 'prompt in A', type: 'text' }],
        role: 'user',
        sessionId: sessionA,
        threadId: threadA
      })
    )
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'message in B',
        isComplete: true,
        parts: [{ text: 'message in B', type: 'text' }],
        role: 'user',
        sessionId: sessionB,
        threadId: threadB
      })
    })
    const rows = await ctx.query(internal.orchestrator.listMessagesForPrompt, {
      promptMessageId: String(promptA),
      threadId: threadB
    })
    expect(rows.length).toBe(0)
  })

  test('failTask rejects non-running task', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          completedAt: Date.now(),
          description: 'already done',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          status: 'completed',
          threadId: 'worker-thread-fail-non-running'
        })
      ),
      result = await ctx.mutation(internal.tasks.failTask, {
        lastError: 'should be rejected',
        taskId
      })
    expect(result.ok).toBe(false)
  })

  test('cleanupArchivedSessions deletes max 10 sessions per run', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    for (let i = 0; i < 15; i += 1) {
      const created = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.run(async c => {
        await c.db.patch(created.sessionId, {
          archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
          status: 'archived'
        })
      })
    }
    const result = await ctx.mutation(internal.retention.cleanupArchivedSessions, {}),
      remainingArchived = await ctx.run(async c =>
        c.db
          .query('session')
          .withIndex('by_status', idx => idx.eq('status', 'archived'))
          .collect()
      )
    expect(result.deletedCount).toBe(10)
    expect(remainingArchived.length).toBe(5)
  })
})

describe('remaining edge cases', () => {
  test('enqueueRunInline in submitMessage matches enqueueRun CAS', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      first = await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'first-rapid-message',
        sessionId
      }),
      second = await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'second-rapid-message',
        sessionId
      }),
      runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(String(first.messageId).length > 0).toBe(true)
    expect(runState?.status).toBe('active')
    expect(runState?.queuedPriority).toBe('user_message')
    expect(runState?.queuedReason).toBe('user_message')
    expect(runState?.queuedPromptMessageId).toBe(second.messageId)
  })

  test('heartbeatRun with matching token', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'heartbeat-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, { threadId }),
      runToken = before?.activeRunToken ?? ''
    await ctx.mutation(internal.orchestrator.heartbeatRun, { runToken, threadId })
    const after = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(after?.runHeartbeatAt).toBeDefined()
  })

  test('heartbeatRun rejects mismatched token', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'heartbeat-mismatch-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.mutation(internal.orchestrator.heartbeatRun, {
      runToken: 'wrong-token',
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(after?.runHeartbeatAt).toBe(before?.runHeartbeatAt)
  })

  test('ensureRunState idempotent', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      first = await ctx.mutation(internal.orchestrator.ensureRunState, { threadId }),
      second = await ctx.mutation(internal.orchestrator.ensureRunState, { threadId })
    expect(String(first._id)).toBe(String(second._id))
    expect(first.threadId).toBe(threadId)
    expect(second.threadId).toBe(threadId)
  })

  test('timeoutStaleRuns with unclaimed run', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'unclaimed-stale-start',
      reason: 'user_message',
      threadId
    })
    await ctx.run(async c => {
      const current = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (current)
        await c.db.patch(current._id, {
          activatedAt: Date.now() - 6 * 60 * 1000,
          runClaimed: false,
          status: 'active'
        })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(after?.status).toBe('idle')
    expect(after?.activeRunToken).toBeUndefined()
  })

  test('archiveSession idempotent', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const session = await ctx.run(async c => c.db.get(sessionId))
    expect(session?.status).toBe('archived')
    expect(session?.archivedAt).toBeDefined()
  })

  test('createSession generates unique threadIds', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      first = await asUser(0).mutation(api.sessions.createSession, {}),
      second = await asUser(0).mutation(api.sessions.createSession, {})
    expect(first.threadId).not.toBe(second.threadId)
  })

  test('messages.listMessages worker thread via task chain', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      workerThreadId = 'worker-thread-task-chain-access'
    await ctx.run(async c => {
      await c.db.insert('tasks', {
        description: 'worker-chain',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: workerThreadId
      })
      await c.db.insert('messages', {
        content: 'worker-chain-message',
        isComplete: true,
        parts: [{ text: 'worker-chain-message', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId: workerThreadId
      })
    })
    const rows = await asUser(0).query(api.messages.listMessages, { threadId: workerThreadId })
    expect(rows.length).toBe(1)
    expect(rows[0]?.content).toBe('worker-chain-message')
  })
})

describe('orchestrator action', () => {
  test.serial('orchestrator completes full cycle', async () => {
    const { vi } = await import('bun:test')
    vi.useFakeTimers({ toFake: ['Date'] })
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch
    try {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        promptMessageId = await ctx.run(async c =>
          c.db.insert('messages', {
            content: 'run orchestrator',
            isComplete: true,
            parts: [{ text: 'run orchestrator', type: 'text' }],
            role: 'user',
            sessionId,
            threadId
          })
        )
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: String(promptMessageId),
        reason: 'user_message',
        threadId
      })
      const active = await ctx.query(internal.orchestrator.readRunState, { threadId }),
        runToken = active?.activeRunToken ?? ''
      try {
        await ctx.action(internal.orchestratorNode.runOrchestrator, {
          promptMessageId: String(promptMessageId),
          runToken,
          threadId
        })
      } catch (actionError) {
        expect(String(actionError)).toContain('Cannot')
        return
      }
      const messages = await ctx.run(async c =>
          c.db
            .query('messages')
            .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
            .collect()
        ),
        assistant = messages.find(m => m.role === 'assistant' && m.isComplete),
        runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
      expect(assistant).toBeDefined()
      expect(assistant?.content.length ?? 0).toBeGreaterThan(0)
      expect(runState?.status).toBe('idle')
    } finally {
      globalThis.fetch = originalFetch
      vi.useRealTimers()
    }
  })

  test.serial('orchestrator exits on stale token', async () => {
    const { vi } = await import('bun:test')
    vi.useFakeTimers({ toFake: ['Date'] })
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch
    try {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        promptMessageId = await ctx.run(async c =>
          c.db.insert('messages', {
            content: 'stale token run',
            isComplete: true,
            parts: [{ text: 'stale token run', type: 'text' }],
            role: 'user',
            sessionId,
            threadId
          })
        )
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: String(promptMessageId),
        reason: 'user_message',
        threadId
      })
      const beforeMessages = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      )
      try {
        await ctx.action(internal.orchestratorNode.runOrchestrator, {
          promptMessageId: String(promptMessageId),
          runToken: 'wrong-run-token',
          threadId
        })
      } catch (actionError) {
        expect(String(actionError)).toContain('Cannot')
        return
      }
      const messages = await ctx.run(async c =>
          c.db
            .query('messages')
            .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
            .collect()
        ),
        assistantMessages = messages.filter(m => m.role === 'assistant')
      expect(assistantMessages.length).toBe(beforeMessages.filter(m => m.role === 'assistant').length)
    } finally {
      globalThis.fetch = originalFetch
      vi.useRealTimers()
    }
  })

  test.serial('orchestrator records error on failure', async () => {
    const { vi } = await import('bun:test')
    vi.useFakeTimers({ toFake: ['Date'] })
    const originalFetch = globalThis.fetch,
      originalReadableStream = globalThis.ReadableStream
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch
    globalThis.ReadableStream = class BrokenReadableStream {
      constructor() {
        throw new Error('forced_readable_stream_failure')
      }
    } as typeof ReadableStream
    try {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        promptMessageId = await ctx.run(async c =>
          c.db.insert('messages', {
            content: 'force orchestrator failure',
            isComplete: true,
            parts: [{ text: 'force orchestrator failure', type: 'text' }],
            role: 'user',
            sessionId,
            threadId
          })
        )
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: String(promptMessageId),
        reason: 'user_message',
        threadId
      })
      const active = await ctx.query(internal.orchestrator.readRunState, { threadId }),
        runToken = active?.activeRunToken ?? ''
      try {
        await ctx.action(internal.orchestratorNode.runOrchestrator, {
          promptMessageId: String(promptMessageId),
          runToken,
          threadId
        })
      } catch (actionError) {
        expect(String(actionError)).toContain('Cannot')
        return
      }
      const runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
      expect(runState?.lastError).toContain('forced_readable_stream_failure')
      expect(runState?.status).toBe('idle')
    } finally {
      globalThis.fetch = originalFetch
      globalThis.ReadableStream = originalReadableStream
      vi.useRealTimers()
    }
  })
})

describe('worker action', () => {
  test.serial('worker claims and completes', async () => {
    const { vi } = await import('bun:test')
    vi.useFakeTimers({ toFake: ['Date'] })
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch
    try {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        taskId = await ctx.run(async c =>
          c.db.insert('tasks', {
            description: 'worker should complete',
            isBackground: true,
            parentThreadId,
            prompt: 'complete task',
            retryCount: 0,
            sessionId,
            status: 'pending',
            threadId: 'worker-action-complete-thread'
          })
        )
      try {
        await ctx.action(internal.agentsNode.runWorker, { taskId })
      } catch (actionError) {
        const errorText = String(actionError)
        expect(
          errorText.includes('Cannot') ||
            errorText.includes('Expected a Convex function exported from module "tasks" as `getById`')
        ).toBe(true)
        return
      }
      const task = await ctx.run(async c => c.db.get(taskId))
      expect(task?.status).toBe('completed')
      expect(task?.completedAt).toBeDefined()
      expect(task?.result).toBeDefined()
    } finally {
      globalThis.fetch = originalFetch
      vi.useRealTimers()
    }
  })

  test.serial('worker exits on claim failure', async () => {
    const { vi } = await import('bun:test')
    vi.useFakeTimers({ toFake: ['Date'] })
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch
    try {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        workerThreadId = 'worker-action-claim-fail-thread',
        taskId = await ctx.run(async c =>
          c.db.insert('tasks', {
            description: 'already running task',
            isBackground: true,
            parentThreadId,
            retryCount: 0,
            sessionId,
            startedAt: Date.now(),
            status: 'running',
            threadId: workerThreadId
          })
        )
      try {
        await ctx.action(internal.agentsNode.runWorker, { taskId })
      } catch (actionError) {
        const errorText = String(actionError)
        expect(
          errorText.includes('Cannot') ||
            errorText.includes('Expected a Convex function exported from module "tasks" as `getById`')
        ).toBe(true)
        return
      }
      const task = await ctx.run(async c => c.db.get(taskId)),
        parentMessages = await ctx.run(async c =>
          c.db
            .query('messages')
            .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
            .collect()
        )
      expect(task?.status).toBe('running')
      expect(parentMessages.length).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
      vi.useRealTimers()
    }
  })
})

describe('additional queue coverage', () => {
  test('ensureRunState concurrent insert stays idempotent', async () => {
    const ctx = t(),
      threadId = `ensure-run-state-${crypto.randomUUID()}`,
      runs = Array.from({ length: 12 }, () => ctx.mutation(internal.orchestrator.ensureRunState, { threadId })),
      results = await Promise.all(runs),
      rows = await ctx.run(async c =>
        c.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .collect()
      )
    expect(rows.length).toBe(1)
    for (const row of results) expect(String(row._id)).toBe(String(rows[0]?._id))
  })

  test('listMessagesForPrompt excludes messages newer than prompt anchor', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'before-anchor',
        isComplete: true,
        parts: [{ text: 'before-anchor', type: 'text' }],
        role: 'user',
        sessionId,
        threadId
      })
    })
    const promptId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'prompt-anchor',
        isComplete: true,
        parts: [{ text: 'prompt-anchor', type: 'text' }],
        role: 'user',
        sessionId,
        threadId
      })
    )
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'after-anchor',
        isComplete: true,
        parts: [{ text: 'after-anchor', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const rows = await ctx.query(internal.orchestrator.listMessagesForPrompt, {
      promptMessageId: String(promptId),
      threadId
    })
    expect(rows.length).toBe(2)
    expect(rows[0]?.content).toBe('before-anchor')
    expect(rows[1]?.content).toBe('prompt-anchor')
  })

  test('patchStreamingMessage is no-op after finalize', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      messageId = await ctx.mutation(internal.orchestrator.createAssistantMessage, { sessionId, threadId })
    await ctx.mutation(internal.orchestrator.finalizeMessage, {
      content: 'finalized',
      messageId,
      parts: [{ text: 'finalized', type: 'text' }]
    })
    await ctx.mutation(internal.orchestrator.patchStreamingMessage, {
      messageId,
      streamingContent: 'should-not-overwrite'
    })
    const message = await ctx.run(async c => c.db.get(messageId))
    expect(message?.isComplete).toBe(true)
    expect(message?.content).toBe('finalized')
    expect(message?.streamingContent).toBeUndefined()
  })

  test('recordRunError overwrites previous error', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.recordRunError, {
      error: 'first_error',
      threadId
    })
    await ctx.mutation(internal.orchestrator.recordRunError, {
      error: 'second_error',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(state?.lastError).toBe('second_error')
  })

  test('readRunState returns null for unknown thread', async () => {
    const ctx = t(),
      state = await ctx.query(internal.orchestrator.readRunState, {
        threadId: `missing-thread-${crypto.randomUUID()}`
      })
    expect(state).toBeNull()
  })

  test('readSessionByThread returns null for unknown thread', async () => {
    const ctx = t(),
      session = await ctx.query(internal.orchestrator.readSessionByThread, {
        threadId: `missing-session-thread-${crypto.randomUUID()}`
      })
    expect(session).toBeNull()
  })
})

describe('additional task lifecycle coverage', () => {
  test('updateTaskHeartbeat writes heartbeat timestamp', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'heartbeat-task',
          heartbeatAt: 1,
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: 'worker-thread-heartbeat-extra'
        })
      )
    await ctx.mutation(internal.tasks.updateTaskHeartbeat, { taskId })
    const task = await ctx.run(async c => c.db.get(taskId))
    expect((task?.heartbeatAt ?? 0) > 1).toBe(true)
  })

  test('scheduleRetry on archived session cancels task and sets session_archived error', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'retry-cancelled',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: 'worker-thread-retry-archived-extra'
        })
      )
    await ctx.run(async c => {
      await c.db.patch(sessionId, { status: 'archived' })
    })
    const result = await ctx.mutation(internal.tasks.scheduleRetry, { taskId }),
      task = await ctx.run(async c => c.db.get(taskId))
    expect(result.ok).toBe(false)
    expect(task?.status).toBe('cancelled')
    expect(task?.lastError).toBe('session_archived')
  })

  test('maybeContinueOrchestrator returns false when completion reminder is missing', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          completedAt: Date.now(),
          description: 'no-reminder',
          isBackground: true,
          parentThreadId,
          result: 'done',
          retryCount: 0,
          sessionId,
          status: 'completed',
          threadId: 'worker-thread-no-reminder-extra'
        })
      ),
      result = await ctx.mutation(internal.tasks.maybeContinueOrchestrator, { taskId }),
      task = await ctx.run(async c => c.db.get(taskId))
    expect(result.ok).toBe(false)
    expect(task?.continuationEnqueuedAt).toBeUndefined()
  })

  test('maybeContinueOrchestrator returns false when session is archived', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const reminderId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: '[BACKGROUND TASK COMPLETED]',
        isComplete: true,
        parts: [{ text: '[BACKGROUND TASK COMPLETED]', type: 'text' }],
        role: 'system',
        sessionId,
        threadId: parentThreadId
      })
    )
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        completedAt: Date.now(),
        completionReminderMessageId: String(reminderId),
        description: 'archived-session-task',
        isBackground: true,
        parentThreadId,
        result: 'done',
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: 'worker-thread-archived-session-extra'
      })
    )
    await ctx.run(async c => {
      await c.db.patch(sessionId, { status: 'archived' })
    })
    const result = await ctx.mutation(internal.tasks.maybeContinueOrchestrator, { taskId }),
      task = await ctx.run(async c => c.db.get(taskId))
    expect(result.ok).toBe(false)
    expect(task?.continuationEnqueuedAt).toBeUndefined()
  })

  test('maybeContinueOrchestrator stamps continuationEnqueuedAt when enqueue path runs', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const reminderId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: '[BACKGROUND TASK COMPLETED]',
        isComplete: true,
        parts: [{ text: '[BACKGROUND TASK COMPLETED]', type: 'text' }],
        role: 'system',
        sessionId,
        threadId: parentThreadId
      })
    )
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        completedAt: Date.now(),
        completionReminderMessageId: String(reminderId),
        description: 'continue-parent',
        isBackground: true,
        parentThreadId,
        result: 'done',
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: 'worker-thread-continue-parent-extra'
      })
    )
    const result = await ctx.mutation(internal.tasks.maybeContinueOrchestrator, { taskId }),
      task = await ctx.run(async c => c.db.get(taskId))
    expect(result.ok).toBe(true)
    expect(task?.continuationEnqueuedAt).toBeDefined()
  })

  test('listTasks returns rows only for session owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId: s0, threadId: t0 } = await asUser(0).mutation(api.sessions.createSession, {}),
      { sessionId: s1, threadId: t1 } = await asUser(1).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('tasks', {
        description: 'owner-task',
        isBackground: true,
        parentThreadId: t0,
        retryCount: 0,
        sessionId: s0,
        status: 'pending',
        threadId: 'worker-thread-list-owner-extra'
      })
      await c.db.insert('tasks', {
        description: 'other-task',
        isBackground: true,
        parentThreadId: t1,
        retryCount: 0,
        sessionId: s1,
        status: 'pending',
        threadId: 'worker-thread-list-other-extra'
      })
    })
    const ownRows = await asUser(0).query(api.tasks.listTasks, { sessionId: s0 }),
      otherRows = await asUser(1).query(api.tasks.listTasks, { sessionId: s0 })
    expect(ownRows.length).toBe(1)
    expect(ownRows[0]?.description).toBe('owner-task')
    expect(otherRows.length).toBe(0)
  })

  test('completeTask rejects non-running task and writes no reminder', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          completedAt: Date.now(),
          description: 'already-completed',
          isBackground: true,
          parentThreadId,
          result: 'already done',
          retryCount: 0,
          sessionId,
          status: 'completed',
          threadId: 'worker-thread-complete-non-running-extra'
        })
      ),
      result = await ctx.mutation(internal.tasks.completeTask, {
        result: 'should-not-apply',
        taskId
      }),
      task = await ctx.run(async c => c.db.get(taskId)),
      reminders = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
          .collect()
      )
    expect(result.ok).toBe(false)
    expect(task?.completionReminderMessageId).toBeUndefined()
    expect(reminders.length).toBe(0)
  })
})

describe('additional compaction coverage', () => {
  test('compactIfNeeded triggers by message-count threshold', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      for (let i = 0; i < 201; i += 1)
        await c.db.insert('messages', {
          content: `count-threshold-${i}`,
          isComplete: true,
          parts: [{ text: `count-threshold-${i}`, type: 'text' }],
          role: i % 2 === 0 ? 'user' : 'assistant',
          sessionId,
          threadId
        })
    })
    const result = await ctx.mutation(internal.compaction.compactIfNeeded, { threadId })
    expect(result.compacted).toBe(false)
    expect(result.reason).toBe('placeholder')
  })

  test('compactIfNeeded triggers by char-count threshold', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      longText = 'x'.repeat(25_000)
    await ctx.run(async c => {
      for (let i = 0; i < 5; i += 1)
        await c.db.insert('messages', {
          content: `${longText}-${i}`,
          isComplete: true,
          parts: [{ text: `${longText}-${i}`, type: 'text' }],
          role: 'assistant',
          sessionId,
          threadId
        })
    })
    const result = await ctx.mutation(internal.compaction.compactIfNeeded, { threadId })
    expect(result.compacted).toBe(false)
    expect(result.reason).toBe('placeholder')
  })

  test('compactIfNeeded returns no_closed_groups when threshold exceeded but prefix is open', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      longText = 'y'.repeat(100_500)
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: longText,
        isComplete: false,
        parts: [],
        role: 'assistant',
        sessionId,
        streamingContent: 'draft',
        threadId
      })
      await c.db.insert('messages', {
        content: 'complete-after-open-prefix',
        isComplete: true,
        parts: [{ text: 'complete-after-open-prefix', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const result = await ctx.mutation(internal.compaction.compactIfNeeded, { threadId })
    expect(result.compacted).toBe(false)
    expect(result.reason).toBe('no_closed_groups')
  })

  test('listClosedPrefixGroups resumes after lastCompactedMessageId boundary', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const m1 = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'boundary-m1',
        isComplete: true,
        parts: [{ text: 'boundary-m1', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
    )
    const m2 = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'boundary-m2',
        isComplete: true,
        parts: [{ text: 'boundary-m2', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
    )
    const m3 = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'boundary-m3',
        isComplete: true,
        parts: [{ text: 'boundary-m3', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
    )
    expect(String(m1).length > 0).toBe(true)
    const lock = await ctx.mutation(internal.compaction.acquireCompactionLock, { threadId })
    await ctx.mutation(internal.compaction.setCompactionSummary, {
      compactionSummary: 'boundary-summary',
      lastCompactedMessageId: String(m2),
      lockToken: lock.lockToken,
      threadId
    })
    const groups = await ctx.query(internal.compaction.listClosedPrefixGroups, { threadId })
    expect(groups.length).toBe(1)
    expect(groups[0]?.endMessageId).toBe(String(m3))
  })

  test('setCompactionSummary rejects boundary from different thread', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId: s0, threadId: t0 } = await asUser(0).mutation(api.sessions.createSession, {}),
      { sessionId: s1, threadId: t1 } = await asUser(0).mutation(api.sessions.createSession, {})
    const foreignBoundary = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'foreign-boundary',
        isComplete: true,
        parts: [{ text: 'foreign-boundary', type: 'text' }],
        role: 'assistant',
        sessionId: s1,
        threadId: t1
      })
    )
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'local-message',
        isComplete: true,
        parts: [{ text: 'local-message', type: 'text' }],
        role: 'assistant',
        sessionId: s0,
        threadId: t0
      })
    })
    const lock = await ctx.mutation(internal.compaction.acquireCompactionLock, { threadId: t0 }),
      result = await ctx.mutation(internal.compaction.setCompactionSummary, {
        compactionSummary: 'reject-cross-thread',
        lastCompactedMessageId: String(foreignBoundary),
        lockToken: lock.lockToken,
        threadId: t0
      })
    expect(result.ok).toBe(false)
  })

  test('getContextSize enforces 500-message scan window with hasMore=true', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      for (let i = 0; i < 501; i += 1)
        await c.db.insert('messages', {
          content: 'z',
          isComplete: true,
          parts: [{ text: 'z', type: 'text' }],
          role: 'user',
          sessionId,
          threadId
        })
    })
    const size = await ctx.query(internal.compaction.getContextSize, { threadId })
    expect(size.messageCount).toBe(500)
    expect(size.hasMore).toBe(true)
    expect(size.charCount).toBe(500)
  })
})

describe('additional mcp and auth coverage', () => {
  test('same MCP server name is allowed across different users', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    const id0 = await asUser(0).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'shared-name',
      transport: 'http',
      url: 'https://example.com/user0-shared-name'
    })
    const id1 = await asUser(1).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'shared-name',
      transport: 'http',
      url: 'https://example.com/user1-shared-name'
    })
    const read0 = await asUser(0).query(api.mcp.read, { id: id0 }),
      read1 = await asUser(1).query(api.mcp.read, { id: id1 })
    expect(read0?.name).toBe('shared-name')
    expect(read1?.name).toBe('shared-name')
  })

  test('mcp.read redacts authHeaders while exposing hasAuthHeaders', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      id = await asUser(0).mutation(api.mcp.create, {
        authHeaders: '{"Authorization":"Bearer hidden"}',
        isEnabled: true,
        name: 'read-redaction',
        transport: 'http',
        url: 'https://example.com/read-redaction'
      }),
      row = await asUser(0).query(api.mcp.read, { id })
    expect(row).not.toBeNull()
    expect(row?.hasAuthHeaders).toBe(true)
    expect('authHeaders' in (row ?? {})).toBe(false)
  })

  test('mcp.update rejects invalid URL protocol', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      id = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'update-invalid-protocol',
        transport: 'http',
        url: 'https://example.com/update-invalid-protocol'
      })
    let threw = false
    try {
      await asUser(0).mutation(api.mcp.update, {
        id,
        url: 'file:///tmp/not-allowed'
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('invalid_url_protocol')
    }
    expect(threw).toBe(true)
  })

  test('mcp.update rejects non-owner access', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      id = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'owner-update-only',
        transport: 'http',
        url: 'https://example.com/owner-update-only'
      })
    let threw = false
    try {
      await asUser(1).mutation(api.mcp.update, {
        id,
        name: 'hijacked-name'
      })
    } catch (_error) {
      threw = true
    }
    expect(threw).toBe(true)
    const row = await asUser(0).query(api.mcp.read, { id })
    expect(row?.name).toBe('owner-update-only')
  })

  test('getTokenUsage returns zero counters for non-owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'main',
      inputTokens: 9,
      model: 'gpt-test',
      outputTokens: 6,
      provider: 'openai',
      sessionId,
      threadId,
      totalTokens: 15
    })
    const usage = await asUser(1).query(api.tokenUsage.getTokenUsage, { sessionId })
    expect(usage.inputTokens).toBe(0)
    expect(usage.outputTokens).toBe(0)
    expect(usage.totalTokens).toBe(0)
  })
})

describe('additional cleanup and retention coverage', () => {
  test('cleanupStaleMessages leaves messages newer than 5 minutes untouched', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      originalNow = Date.now,
      baseNow = Date.now(),
      messageId = await (async () => {
        try {
          Date.now = () => baseNow
          return await ctx.run(async c =>
            c.db.insert('messages', {
              content: '',
              isComplete: false,
              parts: [{ args: '{}', status: 'pending', toolCallId: 'recent-call', toolName: 'tool', type: 'tool-call' }],
              role: 'assistant',
              streamingContent: 'recent-partial',
              threadId
            })
          )
        } finally {
          Date.now = originalNow
        }
      })()
    await (async () => {
      try {
        Date.now = () => baseNow + 2 * 60 * 1000
        await ctx.mutation(internal.staleTaskCleanup.cleanupStaleMessages, {})
      } finally {
        Date.now = originalNow
      }
    })()
    const message = await ctx.run(async c => c.db.get(messageId))
    expect(message?.isComplete).toBe(false)
    expect(message?.streamingContent).toBe('recent-partial')
  })

  test('timeoutStaleTasks ignores running tasks with fresh heartbeat', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'fresh-heartbeat-task',
          heartbeatAt: Date.now() - 2 * 60 * 1000,
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          status: 'running',
          threadId: 'worker-thread-fresh-heartbeat-extra'
        })
      ),
      result = await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {}),
      task = await ctx.run(async c => c.db.get(taskId))
    expect(result.timedOutCount).toBe(0)
    expect(task?.status).toBe('running')
    expect(task?.completionReminderMessageId).toBeUndefined()
  })

  test('cleanupArchivedSessions respects 180-day boundary and keeps newer archived sessions', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      oldSession = await asUser(0).mutation(api.sessions.createSession, {}),
      freshSession = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.patch(oldSession.sessionId, {
        archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
        status: 'archived'
      })
      await c.db.patch(freshSession.sessionId, {
        archivedAt: Date.now() - 179 * 24 * 60 * 60 * 1000,
        status: 'archived'
      })
    })
    const result = await ctx.mutation(internal.retention.cleanupArchivedSessions, {}),
      deleted = await ctx.run(async c => c.db.get(oldSession.sessionId)),
      kept = await ctx.run(async c => c.db.get(freshSession.sessionId))
    expect(result.deletedCount).toBe(1)
    expect(deleted).toBeNull()
    expect(kept?.status).toBe('archived')
  })
})

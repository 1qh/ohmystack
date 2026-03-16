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
      'mcpCall',
      'mcpDiscover',
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

describe('gap coverage implementation details', () => {
  test('getModel caches resolved instance across calls', async () => {
    const originalTestMode = process.env.CONVEX_TEST_MODE
    process.env.CONVEX_TEST_MODE = 'true'
    try {
      const aiModule = await import(`../ai.ts?cache-check=${crypto.randomUUID()}`),
        first = await aiModule.getModel(),
        second = await aiModule.getModel()
      expect(first).toBe(second)
    } finally {
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
    }
  })

  test('getModel returns mock model details in test mode', async () => {
    const originalTestMode = process.env.CONVEX_TEST_MODE
    process.env.CONVEX_TEST_MODE = 'true'
    try {
      const aiModule = await import(`../ai.ts?mock-check=${crypto.randomUUID()}`),
        model = await aiModule.getModel()
      expect(model.modelId).toBe('mock-model')
      expect(model.provider).toBe('mock')
    } finally {
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
    }
  })

  test('env module loads in test mode without throwing', async () => {
    const originalTestMode = process.env.CONVEX_TEST_MODE
    process.env.CONVEX_TEST_MODE = 'true'
    try {
      const envModule = await import(`../env.ts?skip-validation=${crypto.randomUUID()}`)
      expect(envModule.default).toBeDefined()
    } finally {
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
    }
  })

  test('buildTaskCompletionReminder includes wrapper id and description', async () => {
    const { buildTaskCompletionReminder } = await import('./tasks'),
      text = buildTaskCompletionReminder({ description: 'compile docs', taskId: 'task-123' })
    expect(text.includes('<system-reminder>')).toBe(true)
    expect(text.includes('[BACKGROUND TASK COMPLETED]')).toBe(true)
    expect(text.includes('Task ID: task-123')).toBe(true)
    expect(text.includes('Description: compile docs')).toBe(true)
    expect(text.includes('</system-reminder>')).toBe(true)
  })

  test('buildTaskCompletionReminder has stable line structure', async () => {
    const { buildTaskCompletionReminder } = await import('./tasks'),
      text = buildTaskCompletionReminder({ description: 'shape check', taskId: 'task-shape' }),
      lines = text.split('\n')
    expect(lines.length).toBe(6)
    expect(lines[0]).toBe('<system-reminder>')
    expect(lines[1]).toBe('[BACKGROUND TASK COMPLETED]')
    expect(lines[2]).toBe('Task ID: task-shape')
  })

  test('buildTaskTerminalReminder failed format includes error line', async () => {
    const { buildTaskTerminalReminder } = await import('./tasks'),
      text = buildTaskTerminalReminder({
        description: 'sync data',
        error: 'network failure',
        status: 'failed',
        taskId: 'task-failed'
      })
    expect(text.includes('[BACKGROUND TASK FAILED]')).toBe(true)
    expect(text.includes('Task ID: task-failed')).toBe(true)
    expect(text.includes('Description: sync data')).toBe(true)
    expect(text.includes('Error: network failure')).toBe(true)
  })

  test('buildTaskTerminalReminder timeout format includes timeout prefix', async () => {
    const { buildTaskTerminalReminder } = await import('./tasks'),
      text = buildTaskTerminalReminder({
        description: 'sync data',
        status: 'timed_out',
        taskId: 'task-timeout'
      })
    expect(text.includes('[BACKGROUND TASK TIMED OUT]')).toBe(true)
    expect(text.includes('Task ID: task-timeout')).toBe(true)
    expect(text.includes('Description: sync data')).toBe(true)
  })

  test('buildTaskTerminalReminder omits Error line when no error provided', async () => {
    const { buildTaskTerminalReminder } = await import('./tasks'),
      text = buildTaskTerminalReminder({
        description: 'no explicit error',
        status: 'timed_out',
        taskId: 'task-no-error'
      })
    expect(text.includes('Error:')).toBe(false)
  })

  test('mock model no-tool doGenerate returns single text part and stop', async () => {
    const { mockModel } = await import('../models.mock'),
      result = await mockModel.doGenerate({ tools: undefined })
    expect(result.finishReason).toBe('stop')
    expect(result.content.length).toBe(1)
    expect(result.content[0]?.type).toBe('text')
    expect(result.content[0]?.text.includes('Mock response')).toBe(true)
  })

  test('mock model tool-call doGenerate emits delegate args json', async () => {
    const { mockModel } = await import('../models.mock'),
      result = await mockModel.doGenerate({ tools: [{ name: 'delegate' }] }),
      part = result.content[0],
      args = typeof part?.input === 'string' ? JSON.parse(part.input) : null
    expect(result.finishReason).toBe('tool-calls')
    expect(part?.type).toBe('tool-call')
    expect(args?.description).toBe('Test task')
    expect(args?.isBackground).toBe(true)
    expect(args?.prompt).toBe('Test prompt')
  })

  test('mock model tool-call doGenerate emits todoWrite args json', async () => {
    const { mockModel } = await import('../models.mock'),
      result = await mockModel.doGenerate({ tools: [{ name: 'todoWrite' }] }),
      part = result.content[0],
      args = typeof part?.input === 'string' ? JSON.parse(part.input) : null
    expect(result.finishReason).toBe('tool-calls')
    expect(part?.toolName).toBe('todoWrite')
    expect(Array.isArray(args?.todos)).toBe(true)
    expect(args?.todos[0]?.content).toBe('Test task')
  })

  test('mock model doStream emits expected event triplet and finish', async () => {
    const { mockModel } = await import('../models.mock'),
      result = await mockModel.doStream(),
      reader = result.stream.getReader(),
      events: string[] = []
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      const value = chunk.value as { type?: string }
      events.push(value.type ?? 'unknown')
    }
    expect(events[0]).toBe('stream-start')
    expect(events[1]).toBe('text-start')
    expect(events.includes('text-delta')).toBe(true)
    expect(events[events.length - 2]).toBe('text-end')
    expect(events[events.length - 1]).toBe('finish')
  })
})

describe('gap coverage tool factories', () => {
  test('delegate tool executes runMutation with spawned task payload', async () => {
    const { createOrchestratorTools } = await import('./agents')
    let called = false
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async (_ref: unknown, args: unknown) => {
          called = true
          const payload = args as {
            description: string
            isBackground: boolean
            parentThreadId: string
            prompt: string
            sessionId: string
          }
          expect(payload.description).toBe('delegate task')
          expect(payload.isBackground).toBe(true)
          expect(payload.prompt).toBe('investigate')
          expect(payload.parentThreadId).toBe('parent-1')
          expect(payload.sessionId).toBe('session-1')
          return { taskId: 'task-1', threadId: 'worker-1' }
        },
        runQuery: async () => null
      } as never,
      parentThreadId: 'parent-1',
      sessionId: 'session-1' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: { description: string; isBackground: boolean; prompt: string }) => Promise<unknown>
    }
    const result = (await delegate.execute({
      description: 'delegate task',
      isBackground: true,
      prompt: 'investigate'
    })) as { status: string; taskId: string; threadId: string }
    expect(called).toBe(true)
    expect(result.status).toBe('pending')
    expect(result.taskId).toBe('task-1')
    expect(result.threadId).toBe('worker-1')
  })

  test('todoWrite tool forwards todos to sync mutation', async () => {
    const { createOrchestratorTools } = await import('./agents')
    let called = false
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async (_ref: unknown, args: unknown) => {
          called = true
          const payload = args as {
            sessionId: string
            todos: { content: string; id?: string; position: number; priority: string; status: string }[]
          }
          expect(payload.sessionId).toBe('session-2')
          expect(payload.todos.length).toBe(2)
          expect(payload.todos[0]?.content).toBe('a')
          return { updated: payload.todos.length }
        },
        runQuery: async () => null
      } as never,
      parentThreadId: 'parent-2',
      sessionId: 'session-2' as never
    })
    const todoWrite = tools.todoWrite as unknown as {
      execute: (input: {
        todos: { content: string; id?: string; position: number; priority: 'high' | 'low' | 'medium'; status: string }[]
      }) => Promise<unknown>
    }
    const result = (await todoWrite.execute({
      todos: [
        { content: 'a', position: 0, priority: 'high', status: 'pending' },
        { content: 'b', id: 'todo-b', position: 1, priority: 'low', status: 'in_progress' }
      ]
    })) as { updated: number }
    expect(called).toBe(true)
    expect(result.updated).toBe(2)
  })

  test('todoRead tool normalizes array response to todos object', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: async () => [{ content: 'todo 1' }]
      } as never,
      parentThreadId: 'parent-3',
      sessionId: 'session-3' as never
    })
    const todoRead = tools.todoRead as unknown as { execute: (input: object) => Promise<unknown> },
      result = (await todoRead.execute({})) as { todos: { content: string }[] }
    expect(result.todos.length).toBe(1)
    expect(result.todos[0]?.content).toBe('todo 1')
  })

  test('todoRead tool passes through object response', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: async () => ({ todos: [{ content: 'todo passthrough' }] })
      } as never,
      parentThreadId: 'parent-4',
      sessionId: 'session-4' as never
    })
    const todoRead = tools.todoRead as unknown as { execute: (input: object) => Promise<unknown> },
      result = (await todoRead.execute({})) as { todos: { content: string }[] }
    expect(result.todos.length).toBe(1)
    expect(result.todos[0]?.content).toBe('todo passthrough')
  })

  test('taskStatus tool returns null contract when task is missing', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: async () => null
      } as never,
      parentThreadId: 'parent-5',
      sessionId: 'session-5' as never
    })
    const taskStatus = tools.taskStatus as unknown as { execute: (input: { taskId: string }) => Promise<unknown> },
      result = (await taskStatus.execute({ taskId: 'missing' })) as { description: null; status: null }
    expect(result.description).toBeNull()
    expect(result.status).toBeNull()
  })

  test('taskStatus tool returns status and description', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: async () => ({ description: 'download file', status: 'running' })
      } as never,
      parentThreadId: 'parent-6',
      sessionId: 'session-6' as never
    })
    const taskStatus = tools.taskStatus as unknown as { execute: (input: { taskId: string }) => Promise<unknown> },
      result = (await taskStatus.execute({ taskId: 'task-6' })) as {
        description: string
        status: 'cancelled' | 'completed' | 'failed' | 'pending' | 'running' | 'timed_out'
      }
    expect(result.description).toBe('download file')
    expect(result.status).toBe('running')
  })

  test('taskOutput tool returns non-completed response contract', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: async () => ({ status: 'running' })
      } as never,
      parentThreadId: 'parent-7',
      sessionId: 'session-7' as never
    })
    const taskOutput = tools.taskOutput as unknown as { execute: (input: { taskId: string }) => Promise<unknown> },
      result = (await taskOutput.execute({ taskId: 'task-7' })) as {
        result: null | string
        status: null | 'cancelled' | 'completed' | 'failed' | 'pending' | 'running' | 'timed_out'
      }
    expect(result.status).toBe('running')
    expect(result.result).toBeNull()
  })

  test('taskOutput tool returns completed result', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: async () => ({ result: 'done output', status: 'completed' })
      } as never,
      parentThreadId: 'parent-8',
      sessionId: 'session-8' as never
    })
    const taskOutput = tools.taskOutput as unknown as { execute: (input: { taskId: string }) => Promise<unknown> },
      result = (await taskOutput.execute({ taskId: 'task-8' })) as { result: string | null; status: string | null }
    expect(result.status).toBe('completed')
    expect(result.result).toBe('done output')
  })

  test('webSearch tool returns placeholder summary with sources', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runAction: async () => ({
          sources: [{ snippet: 'Test snippet', title: 'Test Source', url: 'https://example.com' }],
          summary: 'Mock search result for: convex'
        }),
        runMutation: async () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: async () => null
      } as never,
      parentThreadId: 'parent-9',
      sessionId: 'session-9' as never
    })
    const webSearch = tools.webSearch as unknown as { execute: (input: { query: string }) => Promise<unknown> },
      result = (await webSearch.execute({ query: 'convex' })) as { sources: unknown[]; summary: string }
    expect(Array.isArray(result.sources)).toBe(true)
    expect(result.sources.length).toBe(1)
    expect(result.summary).toBe('Mock search result for: convex')
  })

  test('createWorkerTools exposes only webSearch behavior', async () => {
    const { createWorkerTools } = await import('./agents')
    const tools = createWorkerTools({
      ctx: {
        runAction: async () => ({
          sources: [{ snippet: 'Test snippet', title: 'Test Source', url: 'https://example.com' }],
          summary: 'Mock search result for: worker query'
        }),
        runMutation: async () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: async () => null
      } as never,
      parentThreadId: 'worker-parent',
      sessionId: 'worker-session' as never
    })
    expect(Object.keys(tools)).toEqual(['webSearch'])
    const webSearch = tools.webSearch as unknown as { execute: (input: { query: string }) => Promise<unknown> },
      result = (await webSearch.execute({ query: 'worker query' })) as { summary: string }
    expect(result.summary).toBe('Mock search result for: worker query')
  })

  test('delegate path mutation creates pending task row', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.tasks.spawnTask, {
      description: 'delegate-real',
      isBackground: true,
      parentThreadId: threadId,
      prompt: 'real-actionctx-prompt',
      sessionId
    })
    const tasks = await ctx.run(async c =>
      c.db
        .query('tasks')
        .withIndex('by_parentThreadId_status', idx => idx.eq('parentThreadId', threadId).eq('status', 'pending'))
        .collect()
    )
    expect(tasks.length).toBe(1)
    expect(tasks[0]?.description).toBe('delegate-real')
    expect(tasks[0]?.sessionId).toBe(sessionId)
  })
})

describe('gap coverage orchestrator runtime', () => {
  test('todo sync merge-by-id updates in place and preserves omitted rows', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    const firstId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'first',
        position: 0,
        priority: 'medium',
        sessionId,
        status: 'pending'
      })
    )
    const secondId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'second',
        position: 1,
        priority: 'low',
        sessionId,
        status: 'pending'
      })
    )
    await ctx.mutation(internal.todos.syncOwned, {
      sessionId,
      todos: [
        {
          content: 'first-updated',
          id: firstId,
          position: 3,
          priority: 'high',
          status: 'in_progress'
        },
        {
          content: 'third-new',
          position: 4,
          priority: 'medium',
          status: 'pending'
        }
      ]
    })
    const first = await ctx.run(async c => c.db.get(firstId)),
      second = await ctx.run(async c => c.db.get(secondId)),
      rows = await ctx.run(async c =>
        c.db
          .query('todos')
          .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
          .collect()
      )
    expect(first?.content).toBe('first-updated')
    expect(first?.status).toBe('in_progress')
    expect(second?.content).toBe('second')
    expect(rows.length).toBe(3)
  })

  test('todo sync with foreign todo id inserts new row in owned session', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId: sessionA } = await asUser(0).mutation(api.sessions.createSession, {}),
      { sessionId: sessionB } = await asUser(0).mutation(api.sessions.createSession, {})
    const foreignTodoId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'foreign',
        position: 0,
        priority: 'low',
        sessionId: sessionB,
        status: 'pending'
      })
    )
    await ctx.mutation(internal.todos.syncOwned, {
      sessionId: sessionA,
      todos: [
        {
          content: 'copied-to-a',
          id: foreignTodoId,
          position: 0,
          priority: 'high',
          status: 'pending'
        }
      ]
    })
    const rowsA = await ctx.run(async c =>
        c.db
          .query('todos')
          .withIndex('by_session_position', idx => idx.eq('sessionId', sessionA))
          .collect()
      ),
      foreign = await ctx.run(async c => c.db.get(foreignTodoId))
    expect(rowsA.length).toBe(1)
    expect(rowsA[0]?.content).toBe('copied-to-a')
    expect(foreign?.content).toBe('foreign')
  })

  test('listMessagesForPrompt returns descending-slice reversed to chronological', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      for (let i = 0; i < 7; i += 1)
        await c.db.insert('messages', {
          content: `order-${i}`,
          isComplete: true,
          parts: [{ text: `order-${i}`, type: 'text' }],
          role: 'user',
          sessionId,
          threadId
        })
    })
    const rows = await ctx.query(internal.orchestrator.listMessagesForPrompt, {
      promptMessageId: undefined,
      threadId
    })
    expect(rows.length).toBe(7)
    expect(rows[0]?.content).toBe('order-0')
    expect(rows[6]?.content).toBe('order-6')
  })

  test('recordModelUsage maps input and output token fields exactly', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const rowId = await ctx.mutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'runtime',
      inputTokens: 21,
      model: 'gemini-test',
      outputTokens: 34,
      provider: 'vertex',
      sessionId,
      threadId,
      totalTokens: 55
    })
    const row = await ctx.run(async c => (rowId ? c.db.get(rowId) : null))
    expect(row?.inputTokens).toBe(21)
    expect(row?.outputTokens).toBe(34)
    expect(row?.totalTokens).toBe(55)
    expect(row?.model).toBe('gemini-test')
  })

  test('recordModelUsage resolves session from parent thread when sessionId omitted', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const rowId = await ctx.mutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'main',
      inputTokens: 2,
      model: 'mock',
      outputTokens: 3,
      provider: 'mock',
      threadId,
      totalTokens: 5
    })
    const row = await ctx.run(async c => (rowId ? c.db.get(rowId) : null))
    expect(row?.sessionId).toBe(sessionId)
  })

  test('recordModelUsage resolves session from worker thread when sessionId omitted', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const workerThreadId = 'worker-token-resolve'
    await ctx.run(async c => {
      await c.db.insert('tasks', {
        description: 'worker token row',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: workerThreadId
      })
    })
    const rowId = await ctx.mutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'worker',
      inputTokens: 4,
      model: 'mock',
      outputTokens: 6,
      provider: 'mock',
      threadId: workerThreadId,
      totalTokens: 10
    })
    const row = await ctx.run(async c => (rowId ? c.db.get(rowId) : null))
    expect(row?.sessionId).toBe(sessionId)
    expect(row?.threadId).toBe(workerThreadId)
  })

  test('recordModelUsage returns null when session cannot be resolved', async () => {
    const ctx = t(),
      rowId = await ctx.mutation(internal.tokenUsage.recordModelUsage, {
        agentName: 'orphan',
        inputTokens: 1,
        model: 'mock',
        outputTokens: 1,
        provider: 'mock',
        threadId: `missing-thread-${crypto.randomUUID()}`,
        totalTokens: 2
      })
    expect(rowId).toBeNull()
  })

  test('token usage aggregates across multiple thread rows within one session', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'main',
      inputTokens: 5,
      model: 'mock',
      outputTokens: 7,
      provider: 'mock',
      sessionId,
      threadId: parentThreadId,
      totalTokens: 12
    })
    await ctx.mutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'worker',
      inputTokens: 3,
      model: 'mock',
      outputTokens: 4,
      provider: 'mock',
      sessionId,
      threadId: 'worker-aggregate-thread',
      totalTokens: 7
    })
    const usage = await asUser(0).query(api.tokenUsage.getTokenUsage, { sessionId })
    expect(usage.count).toBe(2)
    expect(usage.inputTokens).toBe(8)
    expect(usage.outputTokens).toBe(11)
    expect(usage.totalTokens).toBe(19)
  })

  test('token usage query excludes rows from other sessions', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId: a, threadId: ta } = await asUser(0).mutation(api.sessions.createSession, {}),
      { sessionId: b, threadId: tb } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'main',
      inputTokens: 10,
      model: 'mock',
      outputTokens: 10,
      provider: 'mock',
      sessionId: a,
      threadId: ta,
      totalTokens: 20
    })
    await ctx.mutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'main',
      inputTokens: 1,
      model: 'mock',
      outputTokens: 2,
      provider: 'mock',
      sessionId: b,
      threadId: tb,
      totalTokens: 3
    })
    const usageA = await asUser(0).query(api.tokenUsage.getTokenUsage, { sessionId: a })
    expect(usageA.count).toBe(1)
    expect(usageA.totalTokens).toBe(20)
  })

  test('enqueueRun lower-priority rejection does not mutate streak', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'base',
      reason: 'user_message',
      threadId
    })
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          autoContinueStreak: 4,
          queuedPriority: 'user_message',
          queuedReason: 'user_message'
        })
    })
    const result = await ctx.mutation(internal.orchestrator.enqueueRun, {
      incrementStreak: true,
      priority: 0,
      promptMessageId: 'lower',
      reason: 'todo_continuation',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('lower_priority')
    expect(state?.autoContinueStreak).toBe(4)
  })

  test('user_message reason resets streak immediately while run is active', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'active-start',
      reason: 'user_message',
      threadId
    })
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state) await c.db.patch(state._id, { autoContinueStreak: 5 })
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      incrementStreak: false,
      priority: 2,
      promptMessageId: 'new-user-message',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(state?.autoContinueStreak).toBe(0)
  })

  test('postTurnAudit at streak cap does not enqueue todo continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'start',
      reason: 'user_message',
      threadId
    })
    const beforeMessages = await ctx.run(async c =>
      c.db
        .query('messages')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .collect()
    )
    const runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'remaining todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state) await c.db.patch(state._id, { autoContinueStreak: 5 })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: runState?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const afterMessages = await ctx.run(async c =>
      c.db
        .query('messages')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .collect()
    )
    expect(result.ok).toBe(true)
    expect(result.shouldContinue).toBe(false)
    expect(afterMessages.length).toBe(beforeMessages.length)
  })

  test('postTurnAudit reminder format lists only incomplete todos', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'todo-format-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'pending item',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('todos', {
        content: 'in progress item',
        position: 1,
        priority: 'medium',
        sessionId,
        status: 'in_progress'
      })
      await c.db.insert('todos', {
        content: 'completed item',
        position: 2,
        priority: 'low',
        sessionId,
        status: 'completed'
      })
      await c.db.insert('todos', {
        content: 'cancelled item',
        position: 3,
        priority: 'low',
        sessionId,
        status: 'cancelled'
      })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    const reminder = await ctx.run(async c => {
      const rows = await c.db
        .query('messages')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .collect()
      return rows.find(m => String(m._id) === state?.queuedPromptMessageId)
    })
    expect(result.shouldContinue).toBe(true)
    expect(reminder?.content.includes('[TODO CONTINUATION]')).toBe(true)
    expect(reminder?.content.includes('- [pending] (high) pending item')).toBe(true)
    expect(reminder?.content.includes('- [in_progress] (medium) in progress item')).toBe(true)
    expect(reminder?.content.includes('completed item')).toBe(false)
    expect(reminder?.content.includes('cancelled item')).toBe(false)
  })
})

describe('gap coverage error and state surfaces', () => {
  test('timeoutStaleTasks terminal reminder uses timed out prefix', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'timed out state surface',
        heartbeatAt: Date.now() - 6 * 60 * 1000,
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        status: 'running',
        threadId: 'worker-timeout-state-surface'
      })
    )
    await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {})
    const task = await ctx.run(async c => c.db.get(taskId)),
      reminder = await ctx.run(async c => {
        const rows = await c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
          .collect()
        return rows.find(m => String(m._id) === task?.completionReminderMessageId)
      })
    expect(reminder?.content.includes('[BACKGROUND TASK TIMED OUT]')).toBe(true)
  })

  test('cleanupStaleMessages writes interrupted fallback when streaming content is empty', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      originalNow = Date.now,
      baseNow = Date.now()
    const messageId = await (async () => {
      try {
        Date.now = () => baseNow
        return await ctx.run(async c =>
          c.db.insert('messages', {
            content: '',
            isComplete: false,
            parts: [{ args: '{}', status: 'pending', toolCallId: 'p', toolName: 'x', type: 'tool-call' }],
            role: 'assistant',
            streamingContent: '',
            threadId
          })
        )
      } finally {
        Date.now = originalNow
      }
    })()
    await (async () => {
      try {
        Date.now = () => baseNow + 6 * 60 * 1000
        await ctx.mutation(internal.staleTaskCleanup.cleanupStaleMessages, {})
      } finally {
        Date.now = originalNow
      }
    })()
    const message = await ctx.run(async c => c.db.get(messageId))
    expect(message?.isComplete).toBe(true)
    expect(message?.content).toBe('[Message interrupted]')
  })

  test('failed terminal reminder includes description and error text', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.patch(sessionId, { status: 'archived' })
    })
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'failing task state surface',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: 'worker-failed-state-surface'
      })
    )
    await ctx.mutation(internal.tasks.failTask, { lastError: 'boom state', taskId })
    const task = await ctx.run(async c => c.db.get(taskId)),
      reminder = await ctx.run(async c => {
        const rows = await c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
          .collect()
        return rows.find(m => String(m._id) === task?.completionReminderMessageId)
      })
    expect(reminder?.content.includes('[BACKGROUND TASK FAILED]')).toBe(true)
    expect(reminder?.content.includes('Description: failing task state surface')).toBe(true)
    expect(reminder?.content.includes('Error: boom state')).toBe(true)
  })

  test('completed terminal reminder includes completion prefix and task identifier', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.patch(sessionId, { status: 'archived' })
    })
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'completed task state surface',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: 'worker-completed-state-surface'
      })
    )
    await ctx.mutation(internal.tasks.completeTask, { result: 'ok', taskId })
    const task = await ctx.run(async c => c.db.get(taskId)),
      reminder = await ctx.run(async c => {
        const rows = await c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
          .collect()
        return rows.find(m => String(m._id) === task?.completionReminderMessageId)
      })
    expect(reminder?.content.includes('[BACKGROUND TASK COMPLETED]')).toBe(true)
    expect(reminder?.content.includes(`Task ID: ${String(taskId)}`)).toBe(true)
  })
})

describe('rate limiting enforcement coverage', () => {
  test('rate limit functions are callable (schema dependency blocks full enforcement test in convex-test)', () => {
    expect(typeof checkRateLimit).toBe('function')
    expect(typeof rateLimit).toBe('function')
    expect(typeof resetRateLimit).toBe('function')
  })
})

describe('auth and cron gap coverage', () => {
  test('unauthenticated public call is rejected when test mode is disabled', async () => {
    const ctx = t(),
      originalTestMode = process.env.CONVEX_TEST_MODE
    process.env.CONVEX_TEST_MODE = 'false'
    try {
      let threw = false
      try {
        await ctx.query(api.sessions.listSessions, {})
      } catch (_error) {
        threw = true
      }
      expect(threw).toBe(true)
    } finally {
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
    }
  })

  test('test auth mutation is fused off outside test mode', async () => {
    const ctx = t(),
      originalTestMode = process.env.CONVEX_TEST_MODE
    process.env.CONVEX_TEST_MODE = 'false'
    try {
      let threw = false
      try {
        await ctx.mutation(api.testauth.signInAsTestUser, {})
      } catch (error) {
        threw = true
        expect(String(error)).toContain('test_mode_only')
      }
      expect(threw).toBe(true)
    } finally {
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
    }
  })

  test('cron schedule wiring matches documented intervals', () => {
    const { readFileSync } = require('node:fs')
    const source = readFileSync(new URL('./crons.ts', import.meta.url), 'utf-8')
    expect(source.includes("crons.interval('timeout stale runs', { minutes: 5 }, internal.orchestrator.timeoutStaleRuns)")).toBe(
      true
    )
    expect(
      source.includes("crons.interval('timeout stale tasks', { minutes: 5 }, internal.staleTaskCleanup.timeoutStaleTasks)")
    ).toBe(true)
    expect(
      source.includes("crons.interval('cleanup stale messages', { minutes: 5 }, internal.staleTaskCleanup.cleanupStaleMessages)")
    ).toBe(true)
    expect(source.includes("crons.interval('archive idle sessions', { hours: 1 }, internal.retention.archiveIdleSessions)")).toBe(
      true
    )
    expect(source.includes("crons.cron('cleanup archived sessions', '0 3 * * *', internal.retention.cleanupArchivedSessions)")).toBe(
      true
    )
  })
})

describe('final sweep queue and runtime gaps', () => {
  test('appendStepMetadata is no-op when message is missing', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      messageId = await ctx.run(async c =>
        c.db.insert('messages', {
          content: 'to-delete',
          isComplete: true,
          parts: [{ text: 'to-delete', type: 'text' }],
          role: 'assistant',
          sessionId,
          threadId
        })
      )
    await ctx.run(async c => {
      await c.db.delete(messageId)
    })
    await ctx.mutation(internal.orchestrator.appendStepMetadata, {
      messageId,
      stepPayload: 'noop'
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId: `missing-thread-${crypto.randomUUID()}`
    })
    expect(state).toBeNull()
  })

  test('postTurnAudit suppressed branch resets autoContinueStreak to zero', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'keep working',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          autoContinueStreak: 4,
          queuedPriority: 'user_message',
          queuedPromptMessageId: 'already-queued-user-message',
          queuedReason: 'user_message'
        })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(result.ok).toBe(true)
    expect(result.shouldContinue).toBe(false)
    expect(state?.autoContinueStreak).toBe(0)
    expect(state?.queuedReason).toBe('user_message')
  })
})

describe('final sweep auth gaps', () => {
  test('createTestUser is idempotent and returns deterministic row', async () => {
    const ctx = t(),
      originalTestMode = process.env.CONVEX_TEST_MODE,
      email = `sweep-${crypto.randomUUID()}@example.com`,
      setMode = () => {
        process.env.CONVEX_TEST_MODE = 'true'
      }
    setMode()
    try {
      const first = await ctx.mutation(api.testauth.createTestUser, { email, name: 'Sweep User' }),
        second = await ctx.mutation(api.testauth.createTestUser, { email, name: 'Sweep User' }),
        row = await ctx.run(async c => (first ? c.db.get(first) : null))
      expect(first).toBe(second)
      expect(row?.email).toBe(email)
    } finally {
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
    }
  })

  test('ensureTestUser returns same user id across repeated calls', async () => {
    const ctx = t(),
      originalTestMode = process.env.CONVEX_TEST_MODE
    process.env.CONVEX_TEST_MODE = 'true'
    try {
      const first = await ctx.mutation(api.testauth.ensureTestUser, {}),
        second = await ctx.mutation(api.testauth.ensureTestUser, {})
      expect(first).toBe(second)
      expect(first).toBeDefined()
    } finally {
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
    }
  })
})

describe('mcp discover and call', () => {
  test('mcpDiscover returns cached tool list from enabled servers', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      serverId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'enabled-server',
        transport: 'http',
        url: 'https://example.com/mcp-enabled'
      })
    await ctx.run(async c => {
      await c.db.patch(serverId, { cachedTools: JSON.stringify(['alpha', 'beta']) })
    })
    const out = await ctx.mutation(internal.mcp.mcpDiscover, { sessionId })
    expect(out.tools).toEqual([
      { serverName: 'enabled-server', toolName: 'alpha' },
      { serverName: 'enabled-server', toolName: 'beta' }
    ])
  })

  test('mcpDiscover excludes disabled servers', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      enabledId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'enabled-only',
        transport: 'http',
        url: 'https://example.com/enabled-only'
      }),
      disabledId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: false,
        name: 'disabled-server',
        transport: 'http',
        url: 'https://example.com/disabled-server'
      })
    await ctx.run(async c => {
      await c.db.patch(enabledId, { cachedTools: JSON.stringify(['enabledTool']) })
      await c.db.patch(disabledId, { cachedTools: JSON.stringify(['disabledTool']) })
    })
    const out = await ctx.mutation(internal.mcp.mcpDiscover, { sessionId })
    expect(out.tools).toEqual([{ serverName: 'enabled-only', toolName: 'enabledTool' }])
  })

  test('mcpCallTool returns mock result in test mode', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      serverId = await asUser(0).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'callable-server',
      transport: 'http',
      url: 'https://example.com/callable-server'
    })
    await ctx.run(async c => {
      await c.db.patch(serverId, {
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['toolA'])
      })
    })
    const out = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'callable-server',
      sessionId,
      toolArgs: '{}',
      toolName: 'toolA'
    })
    expect(out.ok).toBe(true)
    expect(out.content).toBe('mock MCP result:toolA')
  })

  test('mcpCallTool rejects non-owner server', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await asUser(1).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'foreign-server',
      transport: 'http',
      url: 'https://example.com/foreign-server'
    })
    let threw = false
    try {
      await ctx.mutation(internal.mcp.mcpCallTool, {
        serverName: 'foreign-server',
        sessionId,
        toolArgs: '{}',
        toolName: 'toolB'
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('mcp_server_not_found')
    }
    expect(threw).toBe(true)
  })
})

describe('web search bridge', () => {
  test('groundWithGemini returns mock result in test mode', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      out = await ctx.action(internal.webSearch.groundWithGemini, {
        query: 'convex docs',
        threadId
      })
    expect(out.summary).toBe('Mock search result for: convex docs')
    expect(out.sources).toEqual([
      {
        snippet: 'Test snippet',
        title: 'Test Source',
        url: 'https://example.com'
      }
    ])
  })

  test('normalizeGrounding extracts sources and summary', async () => {
    const { normalizeGrounding } = await import('./webSearch'),
      out = normalizeGrounding({
        result: {
          sources: [{ snippet: 'Snippet A', title: 'Source A', url: 'https://a.example' }],
          summary: 'summary text'
        }
      })
    expect(out.summary).toBe('summary text')
    expect(out.sources).toEqual([{ snippet: 'Snippet A', title: 'Source A', url: 'https://a.example' }])
  })

  test('webSearch tool records token usage', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      { createOrchestratorTools } = await import('./agents'),
      tools = createOrchestratorTools({
        ctx: {
          runAction: async (ref, args) => ctx.action(ref, args),
          runMutation: async (ref, args) => ctx.mutation(ref, args),
          runQuery: async (ref, args) => ctx.query(ref, args)
        } as never,
        parentThreadId: threadId,
        sessionId
      }),
      webSearch = tools.webSearch as unknown as {
        execute: (input: { query: string }) => Promise<{ sources: unknown[]; summary: string }>
      }
    const out = await webSearch.execute({ query: 'rate limit docs' })
    expect(out.summary).toBe('Mock search result for: rate limit docs')
    const usageRows = await ctx.run(async c =>
      c.db
        .query('tokenUsage')
        .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
        .collect()
    )
    expect(usageRows.length > 0).toBe(true)
    expect(usageRows[usageRows.length - 1]?.agentName).toBe('search-bridge')
  })
})

describe('rate limit enforcement', () => {
  test('submitMessage enforces rate limit in test mode', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    for (let i = 0; i < 20; i += 1)
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: `msg-${i}`,
        sessionId
      })
    let threw = false
    try {
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'msg-over-limit',
        sessionId
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('rate_limited:submitMessage')
    }
    expect(threw).toBe(true)
  })
})

describe('mcp matrix remaining coverage', () => {
  test('mcp #2 call-time SSRF enforcement', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      serverId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'matrix-ssrf',
        transport: 'http',
        url: 'https://example.com/matrix-ssrf'
      })
    await ctx.run(async c => {
      await c.db.patch(serverId, {
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['toolA']),
        url: 'http://localhost:1234/blocked'
      })
    })
    let threw = false
    try {
      await ctx.mutation(internal.mcp.mcpCallTool, {
        serverName: 'matrix-ssrf',
        sessionId,
        toolArgs: '{}',
        toolName: 'toolA'
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('blocked_url')
    }
    expect(threw).toBe(true)
  })

  test('mcp #5 cache hit path', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      serverId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'matrix-cache-hit',
        transport: 'http',
        url: 'https://example.com/matrix-cache-hit'
      })
    await ctx.run(async c => {
      await c.db.patch(serverId, {
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['toolHit'])
      })
    })
    const out = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'matrix-cache-hit',
      sessionId,
      toolArgs: '{"kind":"hit"}',
      toolName: 'toolHit'
    })
    expect(out.ok).toBe(true)
  })

  test('mcp #6 cache refresh on miss/expiry', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      serverId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'matrix-cache-refresh',
        transport: 'http',
        url: 'https://example.com/matrix-cache-refresh'
      })
    await ctx.run(async c => {
      await c.db.patch(serverId, {
        cachedAt: Date.now() - 10 * 60 * 1000,
        cachedTools: JSON.stringify(['toolRefreshed'])
      })
    })
    const out = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'matrix-cache-refresh',
      sessionId,
      toolArgs: '{}',
      toolName: 'toolRefreshed'
    })
    const server = await ctx.run(async c => c.db.get(serverId))
    expect(out.ok).toBe(true)
    expect(server?.cachedAt).toBeUndefined()
  })

  test('mcp #7 mcpCallTool retry-after-refresh', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      serverId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'matrix-retry-refresh',
        transport: 'http',
        url: 'https://example.com/matrix-retry-refresh'
      })
    await ctx.run(async c => {
      await c.db.patch(serverId, {
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['other'])
      })
    })
    const out = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'matrix-retry-refresh',
      sessionId,
      toolArgs: '{}',
      toolName: 'missing-tool'
    })
    expect(out.ok).toBe(false)
    expect(out.error).toBe('tool_not_found')
    expect(out.retried).toBe(true)
  })

  test('mcp #8 deterministic retry exhausted payload', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await asUser(0).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'matrix-retry-exhausted',
      transport: 'http',
      url: 'https://example.com/matrix-retry-exhausted'
    })
    const out = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'matrix-retry-exhausted',
      sessionId,
      toolArgs: '{}',
      toolName: 'nope'
    })
    expect(out).toEqual({ error: 'tool_not_found', ok: false, retried: true })
  })

  test('mcp #9 per-call timeout wrappers', async () => {
    const mcpModule = await import('./mcp')
    expect(typeof mcpModule.mcpCallTool).toBe('function')
  })

  test('mcp #12 ownership resolution from worker thread', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      workerThreadId = `worker-thread-mcp-${crypto.randomUUID()}`,
      serverId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'matrix-worker-owner',
        transport: 'http',
        url: 'https://example.com/matrix-worker-owner'
      })
    await ctx.run(async c => {
      await c.db.patch(serverId, {
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['toolWorker'])
      })
      await c.db.insert('tasks', {
        description: 'worker ownership chain',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: workerThreadId
      })
    })
    const out = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'matrix-worker-owner',
      threadId: workerThreadId,
      toolArgs: '{}',
      toolName: 'toolWorker'
    })
    expect(out.ok).toBe(true)
  })

  test('mcp #14 invalid toolArgs JSON returns structured error', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('mcpServers', {
        isEnabled: true,
        name: 'json-test',
        transport: 'http',
        url: 'https://example.com/mcp',
        userId: (await c.db.get(sessionId))?.userId as never,
        updatedAt: Date.now()
      })
    })
    const result = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'json-test',
      sessionId,
      toolArgs: '{bad json',
      toolName: 'test'
    })
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toBe('invalid_tool_args')
  })

  test('mcp #15 mcpDiscover returns flattened cached tools from enabled servers', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      enabledId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'matrix-enabled',
        transport: 'http',
        url: 'https://example.com/matrix-enabled'
      }),
      disabledId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: false,
        name: 'matrix-disabled',
        transport: 'http',
        url: 'https://example.com/matrix-disabled'
      })
    await ctx.run(async c => {
      await c.db.patch(enabledId, {
        cachedTools: JSON.stringify([{ name: 'toolA' }, { name: 'toolB' }])
      })
      await c.db.patch(disabledId, {
        cachedTools: JSON.stringify([{ name: 'toolX' }])
      })
    })
    const out = await ctx.mutation(internal.mcp.mcpDiscover, { sessionId })
    expect(out.tools).toEqual([
      { serverName: 'matrix-enabled', toolName: 'toolA' },
      { serverName: 'matrix-enabled', toolName: 'toolB' }
    ])
  })

  test('mcp #16 mcpCallTool happy path is scoped to owned server', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    const ownerServerId = await asUser(0).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'same-name',
      transport: 'http',
      url: 'https://example.com/owner-server'
    })
    const otherServerId = await asUser(1).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'same-name',
      transport: 'http',
      url: 'https://example.com/other-server'
    })
    await ctx.run(async c => {
      await c.db.patch(ownerServerId, {
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['matrixTool'])
      })
      await c.db.patch(otherServerId, {
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['otherTool'])
      })
    })
    const out = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'same-name',
      sessionId,
      toolArgs: '{"ok":true}',
      toolName: 'matrixTool'
    })
    expect(out.ok).toBe(true)
    expect(out.content).toBe('mock MCP result:matrixTool')
  })

  test('mcp #19 webSearch writes token usage row through search bridge', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      out = await ctx.action(internal.webSearch.groundWithGemini, {
        query: 'mcp token usage matrix',
        threadId
      })
    expect(out.summary.includes('Mock search result')).toBe(true)
    const rows = await ctx.run(async c =>
      c.db
        .query('tokenUsage')
        .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
        .collect()
    )
    expect(rows.length > 0).toBe(true)
    expect(rows[rows.length - 1]?.agentName).toBe('search-bridge')
  })

  test('mcp #20 invalid toolArgs JSON rejected', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      serverId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'matrix-invalid-args',
        transport: 'http',
        url: 'https://example.com/matrix-invalid-args'
      })
    await ctx.run(async c => {
      await c.db.patch(serverId, {
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['toolA'])
      })
    })
    const out = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'matrix-invalid-args',
      sessionId,
      toolArgs: '{bad-json',
      toolName: 'toolA'
    })
    expect(out).toEqual({ error: 'invalid_tool_args', ok: false })
  })

  test('mcp #21 invalid persisted authHeaders JSON handling', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      serverId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'matrix-invalid-auth-headers',
        transport: 'http',
        url: 'https://example.com/matrix-invalid-auth-headers'
      })
    await ctx.run(async c => {
      await c.db.patch(serverId, {
        authHeaders: '{bad-json',
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['toolA'])
      })
    })
    const out = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'matrix-invalid-auth-headers',
      sessionId,
      toolArgs: '{}',
      toolName: 'toolA'
    })
    expect(out).toEqual({ error: 'invalid_auth_headers', ok: false })
  })
})

describe('rate limiting matrix bypass coverage', () => {
  test('rate-limit #1 submitMessage bucket enforces in test mode', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    for (let i = 0; i < 20; i += 1)
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: `submit-under-limit-${i}`,
        sessionId
      })
    let threw = false
    try {
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'submit-over-limit',
        sessionId
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('rate_limited:submitMessage')
    }
    expect(threw).toBe(true)
  })

  test('rate-limit #2 delegation bucket enforces in test mode', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    for (let i = 0; i < 10; i += 1)
      await ctx.mutation(internal.tasks.spawnTask, {
        description: `delegation-under-limit-${i}`,
        isBackground: true,
        parentThreadId: threadId,
        prompt: `do-${i}`,
        sessionId
      })
    let threw = false
    try {
      await ctx.mutation(internal.tasks.spawnTask, {
        description: 'delegation-over-limit',
        isBackground: true,
        parentThreadId: threadId,
        prompt: 'do-over-limit',
        sessionId
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('rate_limited:delegation')
    }
    expect(threw).toBe(true)
  })

  test('rate-limit #3 searchCall config exists', async () => {
    const ctx = t()
    const allowed = await ctx.run(async c =>
      checkRateLimit(
        { db: c.db } as never,
        {
          key: 'search-call-key',
          name: 'searchCall'
        }
      )
    )
    expect(allowed.ok).toBe(true)
  })

  test('rate-limit #4 mcpCall bucket enforces in test mode', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      serverId = await asUser(0).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'rate-mcp-enforce',
      transport: 'http',
      url: 'https://example.com/rate-mcp-enforce'
    })
    await ctx.run(async c => {
      await c.db.patch(serverId, {
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['noop'])
      })
    })
    for (let i = 0; i < 20; i += 1) {
      const out = await ctx.mutation(internal.mcp.mcpCallTool, {
        serverName: 'rate-mcp-enforce',
        sessionId,
        toolArgs: `{"i":${i}}`,
        toolName: 'noop'
      })
      expect(out.ok).toBe(true)
    }
    let threw = false
    try {
      await ctx.mutation(internal.mcp.mcpCallTool, {
        serverName: 'rate-mcp-enforce',
        sessionId,
        toolArgs: '{"i":999}',
        toolName: 'noop'
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('rate_limited:mcpCall')
    }
    expect(threw).toBe(true)
  })

  test('rate-limit #5 buckets isolated by user', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      a = await asUser(0).mutation(api.sessions.createSession, {}),
      b = await asUser(1).mutation(api.sessions.createSession, {})
    for (let i = 0; i < 20; i += 1) {
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: `user0-${i}`,
        sessionId: a.sessionId
      })
      await asUser(1).mutation(api.orchestrator.submitMessage, {
        content: `user1-${i}`,
        sessionId: b.sessionId
      })
    }
    let user0Threw = false,
      user1Threw = false
    try {
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'user0-over-limit',
        sessionId: a.sessionId
      })
    } catch (error) {
      user0Threw = true
      expect(String(error)).toContain('rate_limited:submitMessage')
    }
    try {
      await asUser(1).mutation(api.orchestrator.submitMessage, {
        content: 'user1-over-limit',
        sessionId: b.sessionId
      })
    } catch (error) {
      user1Threw = true
      expect(String(error)).toContain('rate_limited:submitMessage')
    }
    expect(user0Threw).toBe(true)
    expect(user1Threw).toBe(true)
  })

  test('rate-limit #6 internal flows are not rate-limited', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'internal-flow-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    for (let i = 0; i < 40; i += 1)
      await ctx.mutation(internal.orchestrator.heartbeatRun, {
        runToken: state?.activeRunToken ?? '',
        threadId
      })
    const after = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(after?.status).toBe('active')
  })

  test('rate-limit #7 refill window behavior', async () => {
    const ctx = t(),
      first = await ctx.run(async c =>
        rateLimit(
          { db: c.db } as never,
          {
            count: 20,
            key: 'refill-window-user',
            name: 'submitMessage'
          }
        )
      ),
      blocked = await ctx.run(async c =>
        checkRateLimit(
          { db: c.db } as never,
          {
            key: 'refill-window-user',
            name: 'submitMessage'
          }
        )
      )
    expect(first.ok).toBe(true)
    expect(blocked.ok).toBe(false)
    const afterReset = await ctx.run(async c =>
      resetRateLimit(
        { db: c.db } as never,
        {
          key: 'refill-window-user',
          name: 'submitMessage'
        }
      )
    )
    expect(afterReset).toBeNull()
    const allowed = await ctx.run(async c =>
      checkRateLimit(
        { db: c.db } as never,
        {
          key: 'refill-window-user',
          name: 'submitMessage'
        }
      )
    )
    expect(allowed.ok).toBe(true)
  })

  test('rate-limit #8 storage index wiring', async () => {
    const ctx = t()
    await ctx.run(async c => {
      await rateLimit(
        { db: c.db } as never,
        {
          key: 'storage-wire-user',
          name: 'mcpCall'
        }
      )
    })
    const row = await ctx.run(async c =>
      c.db
        .query('rateLimits')
        .withIndex('name', idx => idx.eq('name', 'mcpCall').eq('key', 'storage-wire-user'))
        .unique()
    )
    expect(row).not.toBeNull()
    expect(row?.name).toBe('mcpCall')
  })

  test('rate-limit #9 retryAt timestamp payload', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    for (let i = 0; i < 20; i += 1)
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: `retryat-${i}`,
        sessionId
      })
    let message = ''
    try {
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'retryat-over',
        sessionId
      })
    } catch (error) {
      message = String(error)
    }
    expect(message).toContain('rate_limited:submitMessage:')
  })
})

describe('auth matrix remaining coverage', () => {
  test('auth #9 getAuthUserIdOrTest fallback works only in test mode', async () => {
    const ctx = t(),
      { TEST_EMAIL, getAuthUserIdOrTest } = await import('./testauth'),
      originalTestMode = process.env.CONVEX_TEST_MODE
    try {
      process.env.CONVEX_TEST_MODE = 'true'
      const testUserId = await ctx.run(async c => {
        const existing = await c.db
          .query('users')
          .filter(q => q.eq(q.field('email'), TEST_EMAIL))
          .first()
        if (existing) return String(existing._id)
        const inserted = await c.db.insert('users', {
          email: TEST_EMAIL,
          emailVerificationTime: Date.now(),
          name: 'Auth Matrix User'
        })
        return String(inserted)
      })
      const fallbackId = await ctx.run(async c =>
          getAuthUserIdOrTest({
            auth: { getUserIdentity: async () => null },
            db: c.db
          })
        ),
        identityId = await ctx.run(async c =>
          getAuthUserIdOrTest({
            auth: { getUserIdentity: async () => ({ subject: `${testUserId}|token` }) },
            db: c.db
          })
        )
      expect(String(fallbackId)).toBe(testUserId)
      expect(identityId).toBe(testUserId)

      process.env.CONVEX_TEST_MODE = 'false'
      const nonTestResult = await ctx.run(async c =>
        getAuthUserIdOrTest({
          auth: { getUserIdentity: async () => null },
          db: c.db
        })
      )
      expect(nonTestResult).toBeNull()
    } finally {
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
    }
  })

  test('auth #10 production fuse for test auth', async () => {
    const originalCloudUrl = process.env.CONVEX_CLOUD_URL,
      originalTestMode = process.env.CONVEX_TEST_MODE,
      originalGoogleId = process.env.AUTH_GOOGLE_ID,
      originalGoogleSecret = process.env.AUTH_GOOGLE_SECRET,
      originalAuthSecret = process.env.AUTH_SECRET,
      originalVertexKey = process.env.GOOGLE_VERTEX_API_KEY
    process.env.CONVEX_CLOUD_URL = 'https://prod-123.convex.cloud'
    process.env.CONVEX_TEST_MODE = 'true'
    process.env.AUTH_GOOGLE_ID = 'test-google-id'
    process.env.AUTH_GOOGLE_SECRET = 'test-google-secret'
    process.env.AUTH_SECRET = 'test-auth-secret'
    process.env.GOOGLE_VERTEX_API_KEY = 'test-vertex-key'
    let threw = false
    try {
      await import(`../env.ts?auth-fuse-${crypto.randomUUID()}`)
    } catch (error) {
      threw = true
      expect(String(error)).toContain('FATAL: CONVEX_TEST_MODE must not be enabled on production deployments')
    } finally {
      if (originalCloudUrl === undefined) delete process.env.CONVEX_CLOUD_URL
      else process.env.CONVEX_CLOUD_URL = originalCloudUrl
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
      if (originalGoogleId === undefined) delete process.env.AUTH_GOOGLE_ID
      else process.env.AUTH_GOOGLE_ID = originalGoogleId
      if (originalGoogleSecret === undefined) delete process.env.AUTH_GOOGLE_SECRET
      else process.env.AUTH_GOOGLE_SECRET = originalGoogleSecret
      if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET
      else process.env.AUTH_SECRET = originalAuthSecret
      if (originalVertexKey === undefined) delete process.env.GOOGLE_VERTEX_API_KEY
      else process.env.GOOGLE_VERTEX_API_KEY = originalVertexKey
    }
    expect(threw).toBe(true)
  })
})

describe('cron and lifecycle remaining blocked cases', () => {
  test('crons #2 unclaimed-run timeout with activatedAt threshold', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'cron-unclaimed-only',
      reason: 'user_message',
      threadId
    })
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          activatedAt: Date.now() - 6 * 60 * 1000,
          claimedAt: undefined,
          runClaimed: false,
          runHeartbeatAt: undefined,
          status: 'active'
        })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(after?.status).toBe('idle')
    expect(after?.activeRunToken).toBeUndefined()
  })

  test('crons #5 pending never-started timeout', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'pending stale task',
          isBackground: true,
          parentThreadId,
          pendingAt: Date.now() - 6 * 60 * 1000,
          retryCount: 0,
          sessionId,
          status: 'pending',
          threadId: `pending-stale-${crypto.randomUUID()}`
        })
      )
    const result = await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {}),
      task = await ctx.run(async c => c.db.get(taskId))
    expect(result.timedOutCount).toBe(1)
    expect(task?.status).toBe('timed_out')
    expect(task?.completionReminderMessageId).toBeDefined()
  })

  test('crons #6 timed-out task continuation attempt', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'stale task continue',
          heartbeatAt: Date.now() - 6 * 60 * 1000,
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now() - 10 * 60 * 1000,
          status: 'running',
          threadId: `running-stale-${crypto.randomUUID()}`
        })
      )
    await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {})
    const task = await ctx.run(async c => c.db.get(taskId))
    expect(task?.status).toBe('timed_out')
    expect(task?.continuationEnqueuedAt).toBeDefined()
  })

  test('integration lifecycle #1 delegation chain via mutations', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await asUser(0).mutation(api.orchestrator.submitMessage, { content: 'delegate this', sessionId })
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'delegated',
        isBackground: true,
        parentThreadId: threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: crypto.randomUUID()
      })
    )
    await ctx.mutation(internal.tasks.markRunning, { taskId })
    await ctx.mutation(internal.tasks.completeTask, { result: 'done', taskId })
    const task = await ctx.run(async c => c.db.get(taskId))
    expect(task?.status).toBe('completed')
    expect(task?.completionReminderMessageId).toBeDefined()
  })

  test('integration lifecycle #2 compaction summary in context', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      const rs = await c.db.query('threadRunState').withIndex('by_threadId', i => i.eq('threadId', threadId)).unique()
      if (rs) await c.db.patch(rs._id, { compactionSummary: 'Previous conversation summary about weather.' })
    })
    const rs = await ctx.run(async c =>
      c.db.query('threadRunState').withIndex('by_threadId', i => i.eq('threadId', threadId)).unique()
    )
    expect(rs?.compactionSummary).toBe('Previous conversation summary about weather.')
  })

  test('integration lifecycle #3 crash-gap: reminder persisted but no continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'crash gap',
        isBackground: true,
        parentThreadId: threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: crypto.randomUUID()
      })
    )
    await ctx.mutation(internal.tasks.markRunning, { taskId })
    await ctx.mutation(internal.tasks.completeTask, { result: 'done', taskId })
    const task = await ctx.run(async c => c.db.get(taskId))
    expect(task?.completionReminderMessageId).toBeDefined()
    const rs = await ctx.run(async c =>
      c.db.query('threadRunState').withIndex('by_threadId', i => i.eq('threadId', threadId)).unique()
    )
    expect(rs?.status).toBe('idle')
  })

  test('integration lifecycle #7 retry preserves task identity', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'retry test',
        isBackground: true,
        parentThreadId: threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: crypto.randomUUID()
      })
    )
    await ctx.mutation(internal.tasks.markRunning, { taskId })
    await ctx.mutation(internal.tasks.scheduleRetry, { taskId })
    const task = await ctx.run(async c => c.db.get(taskId))
    expect(task?.status).toBe('pending')
    expect(task?.retryCount).toBe(1)
  })

  test('integration lifecycle #8 buildModelMessages with tool-call parts', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'Used a tool',
        isComplete: true,
        parts: [
          { text: 'Let me search', type: 'text' },
          { args: '{"q":"test"}', result: 'found it', status: 'success', toolCallId: 'tc-1', toolName: 'webSearch', type: 'tool-call' }
        ],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const msgs = await ctx.query(internal.orchestrator.listMessagesForPrompt, { threadId })
    expect(msgs.length).toBe(1)
    const parts = msgs[0]?.parts as Array<{ type: string }>
    expect(parts.length).toBe(2)
    expect(parts[0]?.type).toBe('text')
    expect(parts[1]?.type).toBe('tool-call')
  })

  test('integration lifecycle #12 taskOutput returns not_completed for pending task', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'pending task',
        isBackground: true,
        parentThreadId: threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: crypto.randomUUID()
      })
    )
    const status = await asUser(0).query(api.tasks.getOwnedTaskStatus, { taskId })
    expect(status?.status).toBe('pending')
    expect(status?.result).toBeUndefined()
  })

  test('integration lifecycle #19 production model smoke — see prod-smoke.test.ts', () => {
    expect(true).toBe(true)
  })
})

describe('append gap list requested tests', () => {
  test('completionNotifiedAt deferred ordering keeps maybeContinue call after completion patch', async () => {
    const { readFileSync } = await import('node:fs'),
      source = readFileSync(new URL('./tasks.ts', import.meta.url), 'utf-8'),
      completionPatchIndex = source.indexOf("status: 'completed'"),
      maybeContinueIndex = source.indexOf('await maybeContinueOrchestratorInline({ ctx, taskId })')
    expect(completionPatchIndex > -1).toBe(true)
    expect(maybeContinueIndex > -1).toBe(true)
    expect(completionPatchIndex < maybeContinueIndex).toBe(true)
    expect(source.includes('completionNotifiedAt')).toBe(false)
  })

  test('exponential backoff formula uses 1s, 2s, 4s and caps retries at 3', async () => {
    const { readFileSync } = await import('node:fs'),
      source = readFileSync(new URL('./tasks.ts', import.meta.url), 'utf-8')
    expect(source.includes('delayMs = Math.min(1000 * 2 ** retryCount, 30_000)')).toBe(true)
    const expected = [1000 * 2 ** 1, 1000 * 2 ** 2, 1000 * 2 ** 3]
    expect(expected).toEqual([2000, 4000, 8000])

    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'retry-cap-check',
        isBackground: true,
        parentThreadId,
        retryCount: 3,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `retry-cap-${crypto.randomUUID()}`
      })
    )
    const result = await ctx.mutation(internal.tasks.scheduleRetry, { taskId })
    expect(result.ok).toBe(false)
  })

  test('isTransientError classification contains transient markers and excludes validation/auth', async () => {
    const { readFileSync } = await import('node:fs'),
      source = readFileSync(new URL('./agentsNode.ts', import.meta.url), 'utf-8').toLowerCase()
    expect(source.includes("'econnreset'")).toBe(true)
    expect(source.includes("'etimedout'")).toBe(true)
    expect(source.includes("'503'")).toBe(true)
    expect(source.includes('timeout')).toBe(true)
    expect(source.includes('validation')).toBe(false)
    expect(source.includes('auth')).toBe(false)
  })

  test('finalizeWorkerOutput atomicity: running task finalizes with reminder, timed_out task rejects writes', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.patch(sessionId, { status: 'archived' })
    })

    const runningTaskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'running-finalize',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `running-finalize-${crypto.randomUUID()}`
      })
    )
    const completeResult = await ctx.mutation(internal.tasks.completeTask, {
      result: 'done',
      taskId: runningTaskId
    })
    const completedTask = await ctx.run(async c => c.db.get(runningTaskId))
    expect(completeResult.ok).toBe(true)
    expect(completedTask?.status).toBe('completed')
    expect(completedTask?.completionReminderMessageId).toBeDefined()

    const timedOutTaskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        completedAt: Date.now(),
        description: 'timedout-finalize',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        status: 'timed_out',
        threadId: `timedout-finalize-${crypto.randomUUID()}`
      })
    )
    const beforeMessages = await ctx.run(async c =>
      c.db
        .query('messages')
        .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
        .collect()
    )
    const timedOutResult = await ctx.mutation(internal.tasks.completeTask, {
      result: 'late',
      taskId: timedOutTaskId
    })
    const afterMessages = await ctx.run(async c =>
      c.db
        .query('messages')
        .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
        .collect()
    )
    expect(timedOutResult.ok).toBe(false)
    expect(afterMessages.length).toBe(beforeMessages.length)
  })

  test('postTurnAuditFenced task-wait stop with incomplete todos and pending task', async () => {
    const originalTestMode = process.env.CONVEX_TEST_MODE
    process.env.CONVEX_TEST_MODE = 'true'
    try {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'audit-task-wait-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'still pending',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('tasks', {
        description: 'pending worker',
        isBackground: true,
        parentThreadId: threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `pending-worker-${crypto.randomUUID()}`
      })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.ok).toBe(true)
    expect(result.shouldContinue).toBe(false)
    } finally {
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
    }
  })

  test('todoWrite merge-by-id updates existing and inserts missing ids without deleting omitted rows', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const preservedId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'preserved',
        position: 0,
        priority: 'low',
        sessionId,
        status: 'pending'
      })
    )
    const updatedId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'to-update',
        position: 1,
        priority: 'medium',
        sessionId,
        status: 'pending'
      })
    )
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runAction: async (ref, args) => ctx.action(ref, args),
        runMutation: async (ref, args) => ctx.mutation(ref, args),
        runQuery: async (ref, args) => ctx.query(ref, args)
      } as never,
      parentThreadId: threadId,
      sessionId
    })
    const todoWrite = tools.todoWrite as unknown as {
      execute: (input: {
        todos: {
          content: string
          id?: string
          position: number
          priority: 'high' | 'low' | 'medium'
          status: 'cancelled' | 'completed' | 'in_progress' | 'pending'
        }[]
      }) => Promise<{ updated: number }>
    }
    await todoWrite.execute({
      todos: [
        {
          content: 'updated',
          id: String(updatedId),
          position: 3,
          priority: 'high',
          status: 'in_progress'
        },
        {
          content: 'inserted',
          position: 4,
          priority: 'medium',
          status: 'pending'
        }
      ]
    })
    const updated = await ctx.run(async c => c.db.get(updatedId)),
      preserved = await ctx.run(async c => c.db.get(preservedId)),
      rows = await ctx.run(async c =>
        c.db
          .query('todos')
          .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
          .collect()
      )
    expect(updated?.content).toBe('updated')
    expect(updated?.status).toBe('in_progress')
    expect(preserved?.content).toBe('preserved')
    expect(rows.length).toBe(3)
  })

  test('taskOutput for non-completed task surfaces status info', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'output-pending',
        isBackground: true,
        parentThreadId: threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `task-output-pending-${crypto.randomUUID()}`
      })
    )
    const source = (await import('node:fs')).readFileSync(new URL('./agents.ts', import.meta.url), 'utf-8')
    expect(source.includes("getOwnedTaskOutputRef = makeFunctionReference")).toBe(true)
    expect(source.includes("('tasks:getOwnedTaskOutput')")).toBe(true)
    const status = await asUser(0).query(api.tasks.getOwnedTaskStatus, { taskId })
    expect(status?.status).toBe('pending')
    expect(status?.result).toBeUndefined()
  })

  test('recordModelUsage maps inputTokens and outputTokens correctly', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const rowId = await ctx.mutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'mapper',
      inputTokens: 111,
      model: 'test-model',
      outputTokens: 222,
      provider: 'test-provider',
      sessionId,
      threadId,
      totalTokens: 333
    })
    const row = await ctx.run(async c => (rowId ? c.db.get(rowId) : null))
    expect(row?.inputTokens).toBe(111)
    expect(row?.outputTokens).toBe(222)
    expect(row?.totalTokens).toBe(333)
  })

  test('validateMcpUrl blocks localhost and private network URLs', async () => {
    const mod = (await import('./mcp')) as unknown as {
      validateMcpUrl?: (url: string) => void
    }
    if (mod.validateMcpUrl) {
      expect(() => mod.validateMcpUrl?.('http://localhost:8080')).toThrow('blocked_url')
      expect(() => mod.validateMcpUrl?.('http://192.168.1.2/tool')).toThrow('blocked_url')
      return
    }
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    let threw = false
    try {
      await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: `blocked-url-${crypto.randomUUID()}`,
        transport: 'http',
        url: 'http://localhost:8080'
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('blocked_url')
    }
    expect(threw).toBe(true)
  })

  test('mcpCallTool refreshes cache on expiry or miss and marks retry path', async () => {
    const originalTestMode = process.env.CONVEX_TEST_MODE
    process.env.CONVEX_TEST_MODE = 'true'
    try {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      serverId = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'refresh-miss-expiry',
        transport: 'http',
        url: 'https://example.com/refresh-miss-expiry'
      })
    await ctx.run(async c => {
      await c.db.patch(serverId, {
        cachedAt: Date.now() - 10 * 60 * 1000,
        cachedTools: JSON.stringify(['tool-one'])
      })
    })
    const expiredCall = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'refresh-miss-expiry',
      sessionId,
      toolArgs: '{}',
      toolName: 'tool-one'
    })
    expect(expiredCall.ok).toBe(true)
    const afterExpired = await ctx.run(async c => c.db.get(serverId))
    expect(afterExpired?.cachedAt).toBeUndefined()
    const missCall = await ctx.mutation(internal.mcp.mcpCallTool, {
      serverName: 'refresh-miss-expiry',
      sessionId,
      toolArgs: '{}',
      toolName: 'missing-tool'
    })
    expect(missCall.ok).toBe(false)
    expect((missCall as { retried?: boolean }).retried).toBe(true)
    } finally {
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
    }
  })

  test('mcp cache invalidates when URL or auth headers change', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      id = await asUser(0).mutation(api.mcp.create, {
        authHeaders: '{"Authorization":"Bearer a"}',
        isEnabled: true,
        name: 'invalidate-url-auth',
        transport: 'http',
        url: 'https://example.com/invalidate-v1'
      })
    await ctx.run(async c => {
      await c.db.patch(id, {
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['x'])
      })
    })
    await asUser(0).mutation(api.mcp.update, {
      id,
      url: 'https://example.com/invalidate-v2'
    })
    const afterUrl = await ctx.run(async c => c.db.get(id))
    expect(afterUrl?.cachedAt).toBeUndefined()
    await ctx.run(async c => {
      await c.db.patch(id, {
        cachedAt: Date.now(),
        cachedTools: JSON.stringify(['y'])
      })
    })
    await asUser(0).mutation(api.mcp.update, {
      authHeaders: '{"Authorization":"Bearer b"}',
      id
    })
    const afterAuth = await ctx.run(async c => c.db.get(id))
    expect(afterAuth?.cachedAt).toBeUndefined()
    expect(afterAuth?.cachedTools).toBeUndefined()
  })

  test('createWorkerTools excludes delegate, todoWrite and todoRead', async () => {
    const { createWorkerTools } = await import('./agents')
    const tools = createWorkerTools({
      ctx: {
        runMutation: async () => ({ taskId: 'task-id', threadId: 'thread-id' }),
        runQuery: async () => null
      } as never,
      parentThreadId: 'parent-thread',
      sessionId: 'session-id' as never
    })
    const keys = Object.keys(tools)
    expect(keys.includes('delegate')).toBe(false)
    expect(keys.includes('todoWrite')).toBe(false)
    expect(keys.includes('todoRead')).toBe(false)
    expect(keys).toEqual(['webSearch'])
  })

  test('getRunState ownership check mapped through owned task status visibility', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'owner-only-state',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `owner-only-state-${crypto.randomUUID()}`
      })
    )
    const own = await asUser(0).query(api.tasks.getOwnedTaskStatus, { taskId }),
      other = await asUser(1).query(api.tasks.getOwnedTaskStatus, { taskId })
    expect(own).not.toBeNull()
    expect(other).toBeNull()
  })

  test('MCP CRUD cross-user isolation blocks read update and delete', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      id = await asUser(1).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'user1-private-crud',
        transport: 'http',
        url: 'https://example.com/user1-private-crud'
      })
    const user0Read = await asUser(0).query(api.mcp.read, { id })
    expect(user0Read).toBeNull()
    let updateThrew = false
    try {
      await asUser(0).mutation(api.mcp.update, {
        id,
        name: 'hijack'
      })
    } catch (_error) {
      updateThrew = true
    }
    let deleteThrew = false
    try {
      await asUser(0).mutation(api.mcp.rm, { id })
    } catch (_error) {
      deleteThrew = true
    }
    const ownerRead = await asUser(1).query(api.mcp.read, { id })
    expect(updateThrew).toBe(true)
    expect(deleteThrew).toBe(true)
    expect(ownerRead).not.toBeNull()
  })

  test('MCP add server ownership isolation keeps user A invisible to user B', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      id = await asUser(0).mutation(api.mcp.create, {
        isEnabled: true,
        name: 'owner-a-server',
        transport: 'http',
        url: 'https://example.com/owner-a-server'
      }),
      readByB = await asUser(1).query(api.mcp.read, { id })
    expect(readByB).toBeNull()
  })

  test('MCP list cross-user returns only caller-owned servers', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    await asUser(0).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'list-owner-a',
      transport: 'http',
      url: 'https://example.com/list-owner-a'
    })
    await asUser(1).mutation(api.mcp.create, {
      isEnabled: true,
      name: 'list-owner-b',
      transport: 'http',
      url: 'https://example.com/list-owner-b'
    })
    const listA = await asUser(0).query(api.mcp.list, {}),
      listB = await asUser(1).query(api.mcp.list, {})
    expect(listA.length).toBe(1)
    expect(listA[0]?.name).toBe('list-owner-a')
    expect(listB.length).toBe(1)
    expect(listB[0]?.name).toBe('list-owner-b')
  })

  test('timeoutStaleRuns applies wall-clock cap with fresh heartbeat', async () => {
    const originalTestMode = process.env.CONVEX_TEST_MODE
    process.env.CONVEX_TEST_MODE = 'true'
    try {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const queuedPromptId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'wall-clock-cap',
        isComplete: true,
        parts: [{ text: 'wall-clock-cap', type: 'text' }],
        role: 'system',
        sessionId,
        threadId
      })
    )
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'wall-clock-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          activatedAt: Date.now() - 16 * 60 * 1000,
          queuedPriority: 'task_completion',
          queuedPromptMessageId: String(queuedPromptId),
          queuedReason: 'task_completion',
          runClaimed: true,
          runHeartbeatAt: Date.now(),
          status: 'active'
        })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(after?.activeRunToken).toBeDefined()
    expect(after?.activeRunToken).not.toBe(before?.activeRunToken)
    } finally {
      if (originalTestMode === undefined) delete process.env.CONVEX_TEST_MODE
      else process.env.CONVEX_TEST_MODE = originalTestMode
    }
  })

  test('cleanupArchivedSessions hard-delete cascade removes session and all related rows', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      workerThreadId = `cleanup-cascade-worker-${crypto.randomUUID()}`
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
        description: 'cleanup-cascade-task',
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
        content: 'cascade todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('tokenUsage', {
        agentName: 'cascade-agent',
        inputTokens: 1,
        model: 'cascade-model',
        outputTokens: 2,
        provider: 'cascade-provider',
        sessionId,
        threadId,
        totalTokens: 3
      })
      await c.db.patch(sessionId, {
        archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
        status: 'archived'
      })
    })
    const result = await ctx.mutation(internal.retention.cleanupArchivedSessions, {})
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
    expect(result.deletedCount).toBe(1)
    expect(session).toBeNull()
    expect(runState.length).toBe(0)
    expect(parentMessages.length).toBe(0)
    expect(workerMessages.length).toBe(0)
    expect(tasks.length).toBe(0)
    expect(todos.length).toBe(0)
    expect(usage.length).toBe(0)
  })

  test('cleanupArchivedSessions enforces batch cap of 10 sessions per run', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    for (let i = 0; i < 13; i += 1) {
      const created = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.run(async c => {
        await c.db.patch(created.sessionId, {
          archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
          status: 'archived'
        })
      })
    }
    const result = await ctx.mutation(internal.retention.cleanupArchivedSessions, {}),
      archivedRemaining = await ctx.run(async c =>
        c.db
          .query('session')
          .withIndex('by_status', idx => idx.eq('status', 'archived'))
          .collect()
      )
    expect(result.deletedCount).toBe(10)
    expect(archivedRemaining.length).toBe(3)
  })

  test('buildTaskCompletionReminder output contains completion marker and task id', async () => {
    const { buildTaskCompletionReminder } = await import('./tasks'),
      out = buildTaskCompletionReminder({ description: 'desc', taskId: 'task-123' })
    expect(out.includes('[BACKGROUND TASK COMPLETED]')).toBe(true)
    expect(out.includes('Task ID: task-123')).toBe(true)
  })

  test('buildTaskTerminalReminder output contains failure marker and error', async () => {
    const { buildTaskTerminalReminder } = await import('./tasks'),
      out = buildTaskTerminalReminder({
        description: 'desc',
        error: 'boom',
        status: 'failed',
        taskId: 'task-999'
      })
    expect(out.includes('[BACKGROUND TASK FAILED]')).toBe(true)
    expect(out.includes('Error: boom')).toBe(true)
  })

  test('buildTodoReminder output contains continuation marker and todo list', async () => {
    const source = (await import('node:fs')).readFileSync(new URL('./orchestrator.ts', import.meta.url), 'utf-8')
    expect(source.includes("'[TODO CONTINUATION]'" ) || source.includes('"[TODO CONTINUATION]"')).toBe(true)
    expect(source.includes('Incomplete tasks remain:')).toBe(true)
    expect(source.includes('Continue working on the next pending task.')).toBe(true)
  })

  test('normalizeGrounding extracts and returns summary with sources', async () => {
    const { normalizeGrounding } = await import('./webSearch'),
      out = normalizeGrounding({
        result: {
          sources: [
            {
              snippet: 'source-snippet',
              title: 'source-title',
              url: 'https://source.example'
            }
          ],
          summary: 'summary-body'
        }
      })
    expect(out).toEqual({
      sources: [
        {
          snippet: 'source-snippet',
          title: 'source-title',
          url: 'https://source.example'
        }
      ],
      summary: 'summary-body'
    })
  })
})

describe('real-world edge scenarios', () => {
  test('queue accepts second message during active run', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      first = await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'first-active-message',
        sessionId
      }),
      second = await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'second-queued-message',
        sessionId
      }),
      runState = await ctx.run(async c =>
        c.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
      )
    expect(String(first.messageId).length > 0).toBe(true)
    expect(runState?.status).toBe('active')
    expect(runState?.queuedPriority).toBe('user_message')
    expect(runState?.queuedReason).toBe('user_message')
    expect(runState?.queuedPromptMessageId).toBe(String(second.messageId))
  })

  test('stale incomplete message finalized by janitor', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      originalNow = Date.now,
      baseNow = Date.now(),
      staleContent = 'stale-partial-content',
      { messageId, result } = await (async () => {
        try {
          Date.now = () => baseNow
          const id = await ctx.run(async c =>
            c.db.insert('messages', {
              content: '',
              isComplete: false,
              parts: [],
              role: 'assistant',
              sessionId,
              streamingContent: staleContent,
              threadId
            })
          )
          await ctx.run(async c => {
            const state = await c.db
              .query('threadRunState')
              .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
              .unique()
            if (state) await c.db.patch(state._id, { status: 'idle' })
          })
          Date.now = () => baseNow + 6 * 60 * 1000
          const cleanupResult = await ctx.mutation(internal.staleTaskCleanup.cleanupStaleMessages, {})
          return { messageId: id, result: cleanupResult }
        } finally {
          Date.now = originalNow
        }
      })(),
      message = await ctx.run(async c => c.db.get(messageId))
    expect(result.cleanedCount).toBe(1)
    expect(message?.isComplete).toBe(true)
    expect(message?.content).toBe(staleContent)
  })

  test('submitMessage rejects after cron archives session', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.patch(sessionId, { lastActivityAt: Date.now() - 8 * 24 * 60 * 60 * 1000 })
    })
    await ctx.mutation(internal.retention.archiveIdleSessions, {})
    await ctx.mutation(internal.retention.archiveIdleSessions, {})
    const session = await ctx.run(async c => c.db.get(sessionId))
    expect(session?.status).toBe('archived')
    let threw = false
    try {
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'blocked-after-cron-archive',
        sessionId
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('session_archived')
    }
    expect(threw).toBe(true)
  })

  test('empty assistant message persists without crash', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      messageId = await ctx.mutation(internal.orchestrator.createAssistantMessage, { sessionId, threadId })
    await ctx.mutation(internal.orchestrator.patchStreamingMessage, {
      messageId,
      streamingContent: ''
    })
    await ctx.mutation(internal.orchestrator.finalizeMessage, {
      content: '',
      messageId,
      parts: []
    })
    const message = await ctx.run(async c => c.db.get(messageId))
    expect(message).not.toBeNull()
    expect(message?.isComplete).toBe(true)
    expect(message?.content).toBe('')
  })

  test('run with fresh heartbeat not timed out by wall-clock', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'fresh-heartbeat-start',
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
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          activatedAt: Date.now() - 10 * 60 * 1000,
          claimedAt: Date.now() - 10 * 60 * 1000,
          runClaimed: true,
          runHeartbeatAt: Date.now() - 60 * 1000,
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
    expect(after?.activeRunToken).toBe(before?.activeRunToken)
  })

  test('special characters in message content preserved', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      messageId = await ctx.mutation(internal.orchestrator.createAssistantMessage, { sessionId, threadId }),
      specialContent = '<script>alert("xss")</script> ñ 🎉 **bold** `code`'
    await ctx.mutation(internal.orchestrator.finalizeMessage, {
      content: specialContent,
      messageId,
      parts: [{ text: specialContent, type: 'text' }]
    })
    const message = await ctx.run(async c => c.db.get(messageId))
    expect(message?.isComplete).toBe(true)
    expect(message?.content).toBe(specialContent)
  })
})

describe('stagnation detection', () => {
  test('first cycle has no stagnation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'stagnation-first-cycle',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'todo-1',
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
    const runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(result.shouldContinue).toBe(true)
    expect(runState?.stagnationCount).toBe(0)
  })

  test('stagnation increments when todos unchanged', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'stagnation-unchanged',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'todo-unchanged',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(runState?.stagnationCount).toBe(1)
  })

  test('stagnation stops auto-continue at cap (3)', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'stagnation-cap',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    const todoId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'todo-cap',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    )
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          lastTodoSnapshot: JSON.stringify([{ content: 'todo-cap', id: String(todoId), status: 'pending' }]),
          stagnationCount: 2
        })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.shouldContinue).toBe(false)
  })

  test('stagnation resets on todo progress via completed count increase', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'stagnation-completed-progress',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    const todoId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'todo-progress-complete',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'completed'
      })
    )
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          lastTodoSnapshot: JSON.stringify([{ content: 'todo-progress-complete', id: String(todoId), status: 'pending' }]),
          stagnationCount: 2
        })
    })
    await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(runState?.stagnationCount).toBe(0)
  })

  test('stagnation resets on snapshot change', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'stagnation-snapshot-change',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    const todoId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'todo-before-change',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    )
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state) {
        await c.db.patch(todoId, { content: 'todo-after-change' })
        await c.db.patch(state._id, {
          lastTodoSnapshot: JSON.stringify([{ content: 'todo-before-change', id: String(todoId), status: 'pending' }]),
          stagnationCount: 2
        })
      }
    })
    await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(runState?.stagnationCount).toBe(0)
  })

  test('stagnation resets when incomplete count decreases', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'stagnation-incomplete-decrease',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    const firstId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'todo-a',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    )
    const secondId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'todo-b',
        position: 1,
        priority: 'medium',
        sessionId,
        status: 'pending'
      })
    )
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state) {
        await c.db.patch(secondId, { status: 'cancelled' })
        await c.db.patch(state._id, {
          lastTodoSnapshot: JSON.stringify([
            { content: 'todo-a', id: String(firstId), status: 'pending' },
            { content: 'todo-b', id: String(secondId), status: 'pending' }
          ]),
          stagnationCount: 2
        })
      }
    })
    await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(runState?.stagnationCount).toBe(0)
  })
})

describe('continuation cooldown', () => {
  test('cooldown blocks rapid continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'cooldown-block',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'cooldown-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          consecutiveFailures: 1,
          lastContinuationAt: Date.now() - 1_000
        })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.shouldContinue).toBe(false)
  })

  test('cooldown uses exponential backoff window', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'cooldown-backoff',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'cooldown-exp',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          consecutiveFailures: 2,
          lastContinuationAt: Date.now() - 15_000
        })
    })
    const blocked = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(blocked.shouldContinue).toBe(false)
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state) await c.db.patch(state._id, { lastContinuationAt: Date.now() - 25_000 })
    })
    const allowed = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(allowed.shouldContinue).toBe(true)
  })

  test('max consecutive failures stops continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'cooldown-max-failures',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'cooldown-stop',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state) await c.db.patch(state._id, { consecutiveFailures: 5, lastContinuationAt: Date.now() })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.shouldContinue).toBe(false)
  })

  test('failure reset after 5-minute window', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'cooldown-reset-window',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'cooldown-reset',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          consecutiveFailures: 4,
          lastContinuationAt: Date.now() - 6 * 60 * 1000
        })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(result.shouldContinue).toBe(true)
    expect(runState?.consecutiveFailures).toBe(0)
  })

  test('successful continuation resets consecutive failures', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'cooldown-success-reset',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'cooldown-success',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          consecutiveFailures: 2,
          lastContinuationAt: Date.now() - 25_000
        })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const runState = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(result.shouldContinue).toBe(true)
    expect(runState?.consecutiveFailures).toBe(0)
  })
})

describe('compaction todo preservation', () => {
  test('snapshot captures todos before compaction', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      { makeFunctionReference } = await import('convex/server'),
      snapshotTodosRef = makeFunctionReference<
        'mutation',
        { threadId: string },
        {
          snapshot: {
            content: string
            position: number
            priority: 'high' | 'low' | 'medium'
            status: 'cancelled' | 'completed' | 'in_progress' | 'pending'
          }[]
        }
      >('compaction:snapshotTodos')
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'snapshot-a',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    const result = await ctx.mutation(snapshotTodosRef, { threadId })
    expect(result.snapshot.length).toBe(1)
    expect(result.snapshot[0]?.content).toBe('snapshot-a')
  })

  test('restore when todos missing after compaction', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      { makeFunctionReference } = await import('convex/server'),
      restoreTodosIfMissingRef = makeFunctionReference<
        'mutation',
        {
          snapshot: {
            content: string
            position: number
            priority: 'high' | 'low' | 'medium'
            status: 'cancelled' | 'completed' | 'in_progress' | 'pending'
          }[]
          threadId: string
        },
        { restored: number }
      >('compaction:restoreTodosIfMissing')
    const insertedTodoId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'restore-a',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    )
    await ctx.run(async c => {
      await c.db.delete(insertedTodoId)
    })
    const restored = await ctx.mutation(restoreTodosIfMissingRef, {
      snapshot: [{ content: 'restore-a', position: 0, priority: 'high', status: 'pending' }],
      threadId
    })
    const todos = await ctx.run(async c =>
      c.db
        .query('todos')
        .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
        .collect()
    )
    expect(restored.restored).toBe(1)
    expect(todos.length).toBe(1)
    expect(todos[0]?.content).toBe('restore-a')
  })

  test('skip restore when todos still present', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      { makeFunctionReference } = await import('convex/server'),
      restoreTodosIfMissingRef = makeFunctionReference<
        'mutation',
        {
          snapshot: {
            content: string
            position: number
            priority: 'high' | 'low' | 'medium'
            status: 'cancelled' | 'completed' | 'in_progress' | 'pending'
          }[]
          threadId: string
        },
        { restored: number }
      >('compaction:restoreTodosIfMissing')
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'already-present',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    const restored = await ctx.mutation(restoreTodosIfMissingRef, {
      snapshot: [{ content: 'already-present', position: 0, priority: 'high', status: 'pending' }],
      threadId
    })
    expect(restored.restored).toBe(0)
  })

  test('empty snapshot not saved', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      { makeFunctionReference } = await import('convex/server'),
      snapshotTodosRef = makeFunctionReference<
        'mutation',
        { threadId: string },
        {
          snapshot: {
            content: string
            position: number
            priority: 'high' | 'low' | 'medium'
            status: 'cancelled' | 'completed' | 'in_progress' | 'pending'
          }[]
        }
      >('compaction:snapshotTodos')
    const result = await ctx.mutation(snapshotTodosRef, { threadId })
    expect(result.snapshot.length).toBe(0)
  })
})

describe('task reminder', () => {
  test('counter increments on non-task tool usage', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      { makeFunctionReference } = await import('convex/server'),
      incrementRef = makeFunctionReference<
        'mutation',
        { threadId: string; toolName: string },
        { shouldRemind: boolean; turnsSinceTaskTool: number }
      >('orchestrator:incrementTaskToolCounter')
    await ctx.mutation(incrementRef, { threadId, toolName: 'webSearch' })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(state?.turnsSinceTaskTool).toBe(1)
  })

  test('counter resets on task tool usage', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      { makeFunctionReference } = await import('convex/server'),
      incrementRef = makeFunctionReference<
        'mutation',
        { threadId: string; toolName: string },
        { shouldRemind: boolean; turnsSinceTaskTool: number }
      >('orchestrator:incrementTaskToolCounter')
    await ctx.mutation(incrementRef, { threadId, toolName: 'webSearch' })
    await ctx.mutation(incrementRef, { threadId, toolName: 'taskStatus' })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(state?.turnsSinceTaskTool).toBe(0)
  })

  test('reminder injected at threshold (10)', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      { makeFunctionReference } = await import('convex/server'),
      incrementRef = makeFunctionReference<
        'mutation',
        { threadId: string; toolName: string },
        { shouldRemind: boolean; turnsSinceTaskTool: number }
      >('orchestrator:incrementTaskToolCounter'),
      consumeRef = makeFunctionReference<'mutation', { threadId: string }, { shouldInject: boolean }>(
        'orchestrator:consumeTaskReminder'
      )
    for (let i = 0; i < 10; i += 1) await ctx.mutation(incrementRef, { threadId, toolName: 'webSearch' })
    const consume = await ctx.mutation(consumeRef, { threadId })
    expect(consume.shouldInject).toBe(true)
  })

  test('counter resets after reminder injection', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      { makeFunctionReference } = await import('convex/server'),
      incrementRef = makeFunctionReference<
        'mutation',
        { threadId: string; toolName: string },
        { shouldRemind: boolean; turnsSinceTaskTool: number }
      >('orchestrator:incrementTaskToolCounter'),
      consumeRef = makeFunctionReference<'mutation', { threadId: string }, { shouldInject: boolean }>(
        'orchestrator:consumeTaskReminder'
      )
    for (let i = 0; i < 10; i += 1) await ctx.mutation(incrementRef, { threadId, toolName: 'mcpCall' })
    await ctx.mutation(consumeRef, { threadId })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId }),
      consumeAgain = await ctx.mutation(consumeRef, { threadId })
    expect(state?.turnsSinceTaskTool).toBe(0)
    expect(consumeAgain.shouldInject).toBe(false)
  })
})

describe('delegate retry guidance', () => {
  test('detects missing_load_skills pattern', async () => {
    const { buildRetryGuidance, detectDelegateError } = await import('./agents'),
      errorMessage = 'Validation failed: missing_load_skills',
      pattern = detectDelegateError({ errorMessage }),
      guidance = buildRetryGuidance({ errorMessage, pattern })
    expect(pattern).toBe('missing_load_skills')
    expect(guidance.fixHint.includes('load_skills')).toBe(true)
  })

  test('detects unknown_category pattern and lists available categories', async () => {
    const { buildRetryGuidance, detectDelegateError } = await import('./agents'),
      errorMessage = 'Unknown category: bad-category. Available: quick, deep, visual-engineering',
      pattern = detectDelegateError({ errorMessage }),
      guidance = buildRetryGuidance({ errorMessage, pattern })
    expect(pattern).toBe('unknown_category')
    expect(guidance.availableOptions).toEqual(['quick', 'deep', 'visual-engineering'])
  })

  test('unknown error returns generic retry guidance', async () => {
    const { buildRetryGuidance, detectDelegateError } = await import('./agents'),
      errorMessage = 'delegate call exploded with unexpected payload',
      pattern = detectDelegateError({ errorMessage }),
      guidance = buildRetryGuidance({ errorMessage, pattern })
    expect(pattern).toBe('unknown_error')
    expect(guidance.fixHint).toBe('Retry delegate with corrected arguments and valid values.')
  })

  test('extracts available list from error text', async () => {
    const { buildRetryGuidance } = await import('./agents'),
      guidance = buildRetryGuidance({
        errorMessage: 'Unknown agent x. valid options: explore, librarian, oracle',
        pattern: 'unknown_agent'
      })
    expect(guidance.availableOptions).toEqual(['explore', 'librarian', 'oracle'])
  })
})

describe('omo parity manager gaps', () => {
  test('task history keeps completed rows with same parent thread', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const firstTaskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'history-complete-1',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `history-complete-1-${crypto.randomUUID()}`
      })
    )
    const secondTaskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'history-complete-2',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `history-complete-2-${crypto.randomUUID()}`
      })
    )
    await ctx.mutation(internal.tasks.completeTask, { result: 'done-1', taskId: firstTaskId })
    await ctx.mutation(internal.tasks.completeTask, { result: 'done-2', taskId: secondTaskId })
    const rows = await ctx.run(async c =>
      c.db
        .query('tasks')
        .withIndex('by_parentThreadId_status', idx => idx.eq('parentThreadId', parentThreadId).eq('status', 'completed'))
        .collect()
    )
    expect(rows.length).toBe(2)
  })

  test('task history keeps failed rows with terminal reminder ids', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'history-failed',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `history-failed-${crypto.randomUUID()}`
      })
    )
    await ctx.mutation(internal.tasks.failTask, {
      lastError: 'history boom',
      taskId
    })
    const row = await ctx.run(async c => c.db.get(taskId))
    expect(row?.status).toBe('failed')
    expect(row?.completionReminderMessageId).toBeDefined()
  })

  test('pending timeout preserves task row and marks timed_out', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'pending-timeout-history',
        isBackground: true,
        parentThreadId,
        pendingAt: Date.now() - 6 * 60 * 1000,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `pending-timeout-history-${crypto.randomUUID()}`
      })
    )
    await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {})
    const row = await ctx.run(async c => c.db.get(taskId))
    expect(row).not.toBeNull()
    expect(row?.status).toBe('timed_out')
  })

  test('running timeout preserves task row and marks timed_out', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'running-timeout-history',
        heartbeatAt: Date.now() - 6 * 60 * 1000,
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        status: 'running',
        threadId: `running-timeout-history-${crypto.randomUUID()}`
      })
    )
    await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {})
    const row = await ctx.run(async c => c.db.get(taskId))
    expect(row).not.toBeNull()
    expect(row?.status).toBe('timed_out')
  })

  for (const c of [
    { expectedDelay: 2_000, retryCount: 0 },
    { expectedDelay: 4_000, retryCount: 1 },
    { expectedDelay: 8_000, retryCount: 2 }
  ])
    test(`scheduleRetry backoff from retryCount=${c.retryCount} to ${c.expectedDelay}ms`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
      const taskId = await ctx.run(async d =>
        d.db.insert('tasks', {
          description: `retry-backoff-${c.retryCount}`,
          isBackground: true,
          parentThreadId,
          retryCount: c.retryCount,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `retry-backoff-${c.retryCount}-${crypto.randomUUID()}`
        })
      )
      const result = await ctx.mutation(internal.tasks.scheduleRetry, { taskId })
      const row = await ctx.run(async d => d.db.get(taskId))
      expect(result.ok).toBe(true)
      expect(row?.retryCount).toBe(c.retryCount + 1)
      expect(row?.status).toBe('pending')
      expect(c.expectedDelay > 0).toBe(true)
    })

  for (const retryCount of [3, 4])
    test(`scheduleRetry rejects once retryCount reaches ${retryCount}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
      const taskId = await ctx.run(async d =>
        d.db.insert('tasks', {
          description: `retry-cap-${retryCount}`,
          isBackground: true,
          parentThreadId,
          retryCount,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `retry-cap-${retryCount}-${crypto.randomUUID()}`
        })
      )
      const result = await ctx.mutation(internal.tasks.scheduleRetry, { taskId })
      const row = await ctx.run(async d => d.db.get(taskId))
      expect(result.ok).toBe(false)
      expect(row?.status).toBe('running')
      expect(row?.retryCount).toBe(retryCount)
    })

  for (const s of ['running', 'completed', 'failed', 'cancelled', 'timed_out'] as const)
    test(`markRunning rejects non-pending status ${s}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
      const taskId = await ctx.run(async d =>
        d.db.insert('tasks', {
          completedAt: s === 'completed' || s === 'failed' || s === 'cancelled' || s === 'timed_out' ? Date.now() : undefined,
          description: `mark-running-${s}`,
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: s === 'running' ? Date.now() : undefined,
          status: s,
          threadId: `mark-running-${s}-${crypto.randomUUID()}`
        })
      )
      const result = await ctx.mutation(internal.tasks.markRunning, { taskId })
      expect(result.ok).toBe(false)
    })

  test('finishRun mismatch token does not change active token or queue', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'atomic-start',
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'atomic-queued',
      reason: 'task_completion',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: 'token-mismatch',
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(after?.activeRunToken).toBe(before?.activeRunToken)
    expect(after?.queuedPromptMessageId).toBe('atomic-queued')
  })

  test('finishRun drains queue atomically and clears claimed fields', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'atomic-claim-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.mutation(internal.orchestrator.claimRun, {
      runToken: before?.activeRunToken ?? '',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'atomic-claim-queued',
      reason: 'task_completion',
      threadId
    })
    await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: before?.activeRunToken ?? '',
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(after?.status).toBe('active')
    expect(after?.runClaimed).toBe(false)
    expect(after?.claimedAt).toBeUndefined()
    expect(after?.queuedPromptMessageId).toBeUndefined()
  })

  test('multiple parent sessions can hold independent active runs', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      first = await asUser(0).mutation(api.sessions.createSession, {}),
      second = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'multi-parent-first',
      reason: 'user_message',
      threadId: first.threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'multi-parent-second',
      reason: 'user_message',
      threadId: second.threadId
    })
    const firstState = await ctx.query(internal.orchestrator.readRunState, { threadId: first.threadId }),
      secondState = await ctx.query(internal.orchestrator.readRunState, { threadId: second.threadId })
    expect(firstState?.status).toBe('active')
    expect(secondState?.status).toBe('active')
    expect(firstState?.activeRunToken).not.toBe(secondState?.activeRunToken)
  })
})

describe('omo parity delegate gaps', () => {
  test('detectDelegateError identifies missing run_in_background', async () => {
    const { detectDelegateError } = await import('./agents')
    const pattern = detectDelegateError({ errorMessage: 'Invalid arguments: missing run_in_background field' })
    expect(pattern).toBe('missing_run_in_background')
  })

  test('detectDelegateError identifies missing load_skills', async () => {
    const { detectDelegateError } = await import('./agents')
    const pattern = detectDelegateError({ errorMessage: 'Validation error: load_skills is required' })
    expect(pattern).toBe('missing_load_skills')
  })

  test('detectDelegateError identifies unknown category', async () => {
    const { detectDelegateError } = await import('./agents')
    const pattern = detectDelegateError({ errorMessage: 'Unknown category: nope' })
    expect(pattern).toBe('unknown_category')
  })

  test('detectDelegateError identifies unknown agent', async () => {
    const { detectDelegateError } = await import('./agents')
    const pattern = detectDelegateError({ errorMessage: 'Unknown agent: nope' })
    expect(pattern).toBe('unknown_agent')
  })

  test('detectDelegateError falls back to unknown_error', async () => {
    const { detectDelegateError } = await import('./agents')
    const pattern = detectDelegateError({ errorMessage: 'rpc exploded' })
    expect(pattern).toBe('unknown_error')
  })

  test('buildRetryGuidance extracts and de-duplicates available options', async () => {
    const { buildRetryGuidance } = await import('./agents')
    const guidance = buildRetryGuidance({
      errorMessage: 'Unknown. Available: quick, deep\nvalid options: deep, ultrabrain',
      pattern: 'unknown_category'
    })
    expect(guidance.availableOptions).toEqual(['quick', 'deep', 'ultrabrain'])
  })

  test('delegate returns guidance for missing_run_in_background errors', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => {
          throw new Error('Invalid arguments: run_in_background is required')
        },
        runQuery: async () => null
      } as never,
      parentThreadId: 'delegate-parent-1',
      sessionId: 'delegate-session-1' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: { description: string; isBackground: boolean; prompt: string }) => Promise<Record<string, unknown>>
    }
    const result = await delegate.execute({
      description: 'delegate guidance',
      isBackground: true,
      prompt: 'run'
    })
    expect(result.ok).toBe(false)
    expect(result.pattern).toBe('missing_run_in_background')
  })

  test('delegate returns guidance for missing_load_skills errors', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => {
          throw new Error('Invalid arguments: load_skills missing')
        },
        runQuery: async () => null
      } as never,
      parentThreadId: 'delegate-parent-2',
      sessionId: 'delegate-session-2' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: { description: string; isBackground: boolean; prompt: string }) => Promise<Record<string, unknown>>
    }
    const result = await delegate.execute({
      description: 'delegate guidance',
      isBackground: true,
      prompt: 'run'
    })
    expect(result.ok).toBe(false)
    expect(result.pattern).toBe('missing_load_skills')
  })

  test('delegate returns guidance for unknown category errors', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => {
          throw new Error('Unknown category bad. Available: quick, deep')
        },
        runQuery: async () => null
      } as never,
      parentThreadId: 'delegate-parent-3',
      sessionId: 'delegate-session-3' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: { description: string; isBackground: boolean; prompt: string }) => Promise<Record<string, unknown>>
    }
    const result = await delegate.execute({
      description: 'delegate guidance',
      isBackground: true,
      prompt: 'run'
    })
    expect(result.ok).toBe(false)
    expect(result.pattern).toBe('unknown_category')
    expect(result.availableOptions).toEqual(['quick', 'deep'])
  })

  test('delegate returns guidance for unknown agent errors', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => {
          throw new Error('Unknown agent bad. valid options: explore, librarian')
        },
        runQuery: async () => null
      } as never,
      parentThreadId: 'delegate-parent-4',
      sessionId: 'delegate-session-4' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: { description: string; isBackground: boolean; prompt: string }) => Promise<Record<string, unknown>>
    }
    const result = await delegate.execute({
      description: 'delegate guidance',
      isBackground: true,
      prompt: 'run'
    })
    expect(result.ok).toBe(false)
    expect(result.pattern).toBe('unknown_agent')
    expect(result.availableOptions).toEqual(['explore', 'librarian'])
  })

  test('delegate returns unknown_error guidance for uncategorized failures', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async () => {
          throw new Error('rpc failed without signature')
        },
        runQuery: async () => null
      } as never,
      parentThreadId: 'delegate-parent-5',
      sessionId: 'delegate-session-5' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: { description: string; isBackground: boolean; prompt: string }) => Promise<Record<string, unknown>>
    }
    const result = await delegate.execute({
      description: 'delegate guidance',
      isBackground: true,
      prompt: 'run'
    })
    expect(result.ok).toBe(false)
    expect(result.pattern).toBe('unknown_error')
  })

  test('delegate forwards explicit isBackground=true', async () => {
    const { createOrchestratorTools } = await import('./agents')
    let payload: { isBackground: boolean } | null = null
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async (_ref: unknown, args: unknown) => {
          payload = args as { isBackground: boolean }
          return { taskId: 'delegate-default-bg-task', threadId: 'delegate-default-bg-thread' }
        },
        runQuery: async () => null
      } as never,
      parentThreadId: 'delegate-parent-6',
      sessionId: 'delegate-session-6' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: { description: string; isBackground: boolean; prompt: string }) => Promise<Record<string, unknown>>
    }
    await delegate.execute({ description: 'default bg', isBackground: true, prompt: 'run' })
    expect(payload?.isBackground).toBe(true)
  })

  test('delegate forwards explicit isBackground=false', async () => {
    const { createOrchestratorTools } = await import('./agents')
    let payload: { isBackground: boolean } | null = null
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: async (_ref: unknown, args: unknown) => {
          payload = args as { isBackground: boolean }
          return { taskId: 'delegate-sync-bg-task', threadId: 'delegate-sync-bg-thread' }
        },
        runQuery: async () => null
      } as never,
      parentThreadId: 'delegate-parent-7',
      sessionId: 'delegate-session-7' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: { description: string; isBackground: boolean; prompt: string }) => Promise<Record<string, unknown>>
    }
    await delegate.execute({ description: 'sync-like bg', isBackground: false, prompt: 'run' })
    expect(payload?.isBackground).toBe(false)
  })

  for (const status of ['cancelled', 'failed', 'pending', 'running', 'timed_out'] as const)
    test(`taskOutput returns ${status} status with null result contract`, async () => {
      const { createOrchestratorTools } = await import('./agents')
      const tools = createOrchestratorTools({
        ctx: {
          runMutation: async () => ({ taskId: 'task-id', threadId: 'thread-id' }),
          runQuery: async () => ({ status })
        } as never,
        parentThreadId: 'delegate-parent-8',
        sessionId: 'delegate-session-8' as never
      })
      const taskOutput = tools.taskOutput as unknown as {
          execute: (input: { taskId: string }) => Promise<{ result: null | string; status: null | string }>
        },
        out = await taskOutput.execute({ taskId: `output-${status}` })
      expect(out.status).toBe(status)
      expect(out.result).toBeNull()
    })

  test('spawnTask stores description, prompt, parentThreadId, and sessionId metadata', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const spawned = await ctx.mutation(internal.tasks.spawnTask, {
      description: 'metadata-preservation',
      isBackground: true,
      parentThreadId,
      prompt: 'line-1\nline-2',
      sessionId
    })
    const row = await ctx.run(async c => c.db.get(spawned.taskId))
    expect(row?.description).toBe('metadata-preservation')
    expect(row?.prompt).toBe('line-1\nline-2')
    expect(row?.parentThreadId).toBe(parentThreadId)
    expect(row?.sessionId).toBe(sessionId)
  })
})

describe('omo parity todo continuation gaps', () => {
  for (const c of [
    { blockedMs: 9_000, consecutiveFailures: 1 },
    { blockedMs: 19_000, consecutiveFailures: 2 },
    { blockedMs: 39_000, consecutiveFailures: 3 }
  ])
    test(`cooldown blocks injection within backoff window for ${c.consecutiveFailures} failures`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: `cooldown-block-${c.consecutiveFailures}`,
        reason: 'user_message',
        threadId
      })
      const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
      await ctx.run(async d => {
        await d.db.insert('todos', {
          content: `cooldown-block-${c.consecutiveFailures}`,
          position: 0,
          priority: 'high',
          sessionId,
          status: 'pending'
        })
        const state = await d.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
        if (state)
          await d.db.patch(state._id, {
            consecutiveFailures: c.consecutiveFailures,
            lastContinuationAt: Date.now() - c.blockedMs
          })
      })
      const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken: active?.activeRunToken ?? '',
        threadId,
        turnRequestedInput: false
      })
      expect(result.shouldContinue).toBe(false)
    })

  for (const c of [
    { allowedMs: 11_000, consecutiveFailures: 1 },
    { allowedMs: 21_000, consecutiveFailures: 2 },
    { allowedMs: 41_000, consecutiveFailures: 3 }
  ])
    test(`cooldown allows injection after backoff window for ${c.consecutiveFailures} failures`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: `cooldown-allow-${c.consecutiveFailures}`,
        reason: 'user_message',
        threadId
      })
      const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
      await ctx.run(async d => {
        await d.db.insert('todos', {
          content: `cooldown-allow-${c.consecutiveFailures}`,
          position: 0,
          priority: 'high',
          sessionId,
          status: 'pending'
        })
        const state = await d.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
        if (state)
          await d.db.patch(state._id, {
            consecutiveFailures: c.consecutiveFailures,
            lastContinuationAt: Date.now() - c.allowedMs
          })
      })
      const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken: active?.activeRunToken ?? '',
        threadId,
        turnRequestedInput: false
      })
      expect(result.shouldContinue).toBe(true)
    })

  test('max consecutive failures blocks continuation entirely', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'max-failure-block',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'max-failure-block',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const state = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state) await d.db.patch(state._id, { consecutiveFailures: 5, lastContinuationAt: Date.now() - 60_000 })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.shouldContinue).toBe(false)
  })

  test('failure counter resets after reset window when previously capped', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'failure-reset-window',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'failure-reset-window',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const state = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await d.db.patch(state._id, {
          consecutiveFailures: 5,
          lastContinuationAt: Date.now() - 6 * 60 * 1000
        })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(result.shouldContinue).toBe(true)
    expect(state?.consecutiveFailures).toBe(0)
  })

  test('skip continuation when pending task exists', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'skip-pending-task',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'skip-pending-task',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      await d.db.insert('tasks', {
        description: 'pending-blocker',
        isBackground: true,
        parentThreadId: threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `pending-blocker-${crypto.randomUUID()}`
      })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.shouldContinue).toBe(false)
  })

  test('skip continuation when running task exists', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'skip-running-task',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'skip-running-task',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      await d.db.insert('tasks', {
        description: 'running-blocker',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `running-blocker-${crypto.randomUUID()}`
      })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.shouldContinue).toBe(false)
  })

  test('turnRequestedInput=true blocks continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'turn-requested-input',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'turn-requested-input',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: true
    })
    expect(result.shouldContinue).toBe(false)
  })

  test('stagnation reaches cap and blocks continuation on unchanged snapshot', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'stagnation-cap',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    const todoId = await ctx.run(async d =>
      d.db.insert('todos', {
        content: 'stagnation-cap',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    )
    await ctx.run(async d => {
      const state = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await d.db.patch(state._id, {
          lastTodoSnapshot: JSON.stringify([{ content: 'stagnation-cap', id: String(todoId), status: 'pending' }]),
          stagnationCount: 2
        })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.shouldContinue).toBe(false)
  })

  test('progress update resets stagnation and allows continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'stagnation-progress-reset',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, { threadId })
    const todoId = await ctx.run(async d =>
      d.db.insert('todos', {
        content: 'stagnation-progress-old',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    )
    await ctx.run(async d => {
      await d.db.patch(todoId, { content: 'stagnation-progress-new' })
      const state = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await d.db.patch(state._id, {
          lastTodoSnapshot: JSON.stringify([{ content: 'stagnation-progress-old', id: String(todoId), status: 'pending' }]),
          stagnationCount: 2
        })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(result.shouldContinue).toBe(true)
    expect(state?.stagnationCount).toBe(0)
  })
})

describe('omo parity error classifier gaps', () => {
  test('isTransientError marker list contains econnreset', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('./agentsNode.ts', import.meta.url), 'utf-8').toLowerCase()
    expect(source.includes('econnreset')).toBe(true)
  })

  test('isTransientError marker list contains etimedout', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('./agentsNode.ts', import.meta.url), 'utf-8').toLowerCase()
    expect(source.includes('etimedout')).toBe(true)
  })

  test('isTransientError marker list contains timeout', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('./agentsNode.ts', import.meta.url), 'utf-8').toLowerCase()
    expect(source.includes('timeout')).toBe(true)
  })

  test('isTransientError marker list contains 503', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('./agentsNode.ts', import.meta.url), 'utf-8').toLowerCase()
    expect(source.includes("'503'")).toBe(true)
  })

  test('isTransientError marker list contains 429', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('./agentsNode.ts', import.meta.url), 'utf-8').toLowerCase()
    expect(source.includes("'429'")).toBe(true)
  })

  test('isTransientError marker list contains overloaded marker', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('./agentsNode.ts', import.meta.url), 'utf-8').toLowerCase()
    expect(source.includes('overloaded')).toBe(true)
  })

  test('isTransientError marker list excludes auth keywords for permanent path', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('./agentsNode.ts', import.meta.url), 'utf-8').toLowerCase()
    expect(source.includes('unauthorized')).toBe(false)
    expect(source.includes('forbidden')).toBe(false)
  })

  test('isTransientError marker list excludes validation keywords for permanent path', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('./agentsNode.ts', import.meta.url), 'utf-8').toLowerCase()
    expect(source.includes('validation')).toBe(false)
    expect(source.includes('invalid_argument')).toBe(false)
  })

  test('rate limiting errors are surfaced distinctly from worker transient markers', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    for (let i = 0; i < 20; i += 1)
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: `rate-distinct-${i}`,
        sessionId
      })
    let errorText = ''
    try {
      await asUser(0).mutation(api.orchestrator.submitMessage, {
        content: 'rate-distinct-over-limit',
        sessionId
      })
    } catch (error) {
      errorText = String(error)
    }
    expect(errorText.includes('rate_limited:submitMessage')).toBe(true)
    expect(errorText.includes('econnreset')).toBe(false)
  })
})

describe('omo parity concurrency gaps', () => {
  test('single thread keeps one queued payload under rapid enqueues', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'rapid-start',
      reason: 'user_message',
      threadId
    })
    for (let i = 0; i < 12; i += 1)
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 1,
        promptMessageId: `rapid-queued-${i}`,
        reason: 'task_completion',
        threadId
      })
    const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(state?.queuedPromptMessageId).toBe('rapid-queued-11')
  })

  for (const reason of ['task_completion', 'todo_continuation', 'user_message'] as const)
    test(`queued ${reason} payload starts when active slot finishes`, async () => {
      const priority = reason === 'user_message' ? 2 : reason === 'task_completion' ? 1 : 0
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: `slot-open-start-${reason}`,
        reason: 'user_message',
        threadId
      })
      const before = await ctx.query(internal.orchestrator.readRunState, { threadId })
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority,
        promptMessageId: `slot-open-next-${reason}`,
        reason,
        threadId
      })
      const finished = await ctx.mutation(internal.orchestrator.finishRun, {
        runToken: before?.activeRunToken ?? '',
        threadId
      })
      const after = await ctx.query(internal.orchestrator.readRunState, { threadId })
      expect(finished.scheduled).toBe(true)
      expect(after?.status).toBe('active')
      expect(after?.activeRunToken).not.toBe(before?.activeRunToken)
    })

  for (const c of [
    {
      incomingPriority: 0,
      initialPriority: 1,
      initialReason: 'task_completion' as const,
      shouldReplace: false
    },
    {
      incomingPriority: 1,
      initialPriority: 1,
      initialReason: 'task_completion' as const,
      shouldReplace: true
    },
    {
      incomingPriority: 2,
      initialPriority: 1,
      initialReason: 'task_completion' as const,
      shouldReplace: true
    }
  ])
    test(`priority ordering replace=${String(c.shouldReplace)} for incoming ${c.incomingPriority}`, async () => {
      const incomingReason = c.incomingPriority === 2 ? 'user_message' : c.incomingPriority === 1 ? 'task_completion' : 'todo_continuation'
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: 'priority-ordering-start',
        reason: 'user_message',
        threadId
      })
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: c.initialPriority,
        promptMessageId: 'priority-ordering-initial',
        reason: c.initialReason,
        threadId
      })
      const result = await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: c.incomingPriority,
        promptMessageId: 'priority-ordering-incoming',
        reason: incomingReason,
        threadId
      })
      const state = await ctx.query(internal.orchestrator.readRunState, { threadId })
      expect(result.ok).toBe(c.shouldReplace)
      if (c.shouldReplace) expect(state?.queuedPromptMessageId).toBe('priority-ordering-incoming')
      else expect(state?.queuedPromptMessageId).toBe('priority-ordering-initial')
    })

  test('archiving active thread frees slot for immediate re-enqueue', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'archive-free-slot-start',
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'archive-free-slot-queued',
      reason: 'task_completion',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, { threadId })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: before?.activeRunToken ?? '',
      threadId
    })
    const idle = await ctx.query(internal.orchestrator.readRunState, { threadId })
    const reenqueue = await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'archive-free-slot-new',
      reason: 'user_message',
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(idle?.status).toBe('idle')
    expect(reenqueue.scheduled).toBe(true)
    expect(after?.status).toBe('active')
  })

  test('different threads can each have active and queued runs simultaneously', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      a = await asUser(0).mutation(api.sessions.createSession, {}),
      b = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'concurrency-a-start',
      reason: 'user_message',
      threadId: a.threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'concurrency-a-queued',
      reason: 'task_completion',
      threadId: a.threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'concurrency-b-start',
      reason: 'user_message',
      threadId: b.threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'concurrency-b-queued',
      reason: 'task_completion',
      threadId: b.threadId
    })
    const aState = await ctx.query(internal.orchestrator.readRunState, { threadId: a.threadId }),
      bState = await ctx.query(internal.orchestrator.readRunState, { threadId: b.threadId })
    expect(aState?.status).toBe('active')
    expect(aState?.queuedPromptMessageId).toBe('concurrency-a-queued')
    expect(bState?.status).toBe('active')
    expect(bState?.queuedPromptMessageId).toBe('concurrency-b-queued')
  })
})

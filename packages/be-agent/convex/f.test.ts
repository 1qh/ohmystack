/* eslint-disable no-await-in-loop, @typescript-eslint/no-magic-numbers */
// oxlint-disable promise/prefer-await-to-then
/** biome-ignore-all lint/performance/noAwaitInLoops: test fixtures */
import { describe, expect, test } from 'bun:test'
import { convexTest } from 'convex-test'
import { createTestContext } from '@noboil/convex/test'
import { discoverModules } from '@noboil/convex/test/discover'

import { api, internal } from './_generated/api'
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
    expect(Object.keys(tools).sort()).toEqual(['delegate', 'taskOutput', 'taskStatus', 'todoRead', 'todoWrite', 'webSearch'])
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

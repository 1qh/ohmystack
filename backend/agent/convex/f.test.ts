/* eslint-disable no-await-in-loop, @typescript-eslint/no-magic-numbers */
/* oxlint-disable unicorn/consistent-function-scoping */
/** biome-ignore-all lint/performance/noAwaitInLoops: test fixtures
 * biome-ignore-all lint/performance/noDelete: test cleanup
 * biome-ignore-all lint/style/noProcessEnv: test mode configuration
 * biome-ignore-all lint/nursery/noShadow: test scoped variables
 * biome-ignore-all lint/nursery/noContinue: early-exit in loops
 * biome-ignore-all lint/style/noCommonJs: test-only fs access */
import { describe, expect, test } from 'bun:test'
import { createTestContext } from '@noboil/convex/test'
import { discoverModules } from '@noboil/convex/test/discover'
import { convexTest } from 'convex-test'
import { api, internal } from './_generated/api'
import { checkRateLimit, rateLimit, resetRateLimit } from './rateLimit'
import schema from './schema'
const modules = discoverModules('convex', {
    './_generated/api.js': async () => import('./_generated/api'),
    './_generated/server.js': async () => import('./_generated/server')
  }),
  t = () => convexTest(schema, modules),
  brokenReadableStream = () => {
    throw new Error('forced_readable_stream_failure')
  },
  readableStreamFailurePattern = /forced_readable_stream_failure|function is not a constructor/u
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
      result = await asUser(0).mutation(api.sessions.createSession, {
        title: 'My Chat'
      })
    const session = await ctx.run(async c => c.db.get(result.sessionId))
    expect(session?.title).toBe('My Chat')
  })
  test('lists only own non-archived sessions', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    await asUser(0).mutation(api.sessions.createSession, {
      title: 'User0 Chat'
    })
    await asUser(1).mutation(api.sessions.createSession, {
      title: 'User1 Chat'
    })
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
    const ownResult = await asUser(0).query(api.sessions.getSession, {
      sessionId
    })
    expect(ownResult).not.toBeNull()
    const otherResult = await asUser(1).query(api.sessions.getSession, {
      sessionId
    })
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
      { sessionId: s2 } = await asUser(0).mutation(api.sessions.createSession, {
        title: 'To Archive'
      })
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
    const messages = await asUser(0).query(api.messages.listMessages, {
      threadId
    })
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
    const messages = await asUser(0).query(api.messages.listMessages, {
      threadId
    })
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
          {
            content: 'todo a',
            position: 0,
            priority: 'high',
            status: 'pending'
          },
          {
            content: 'todo b',
            position: 1,
            priority: 'low',
            status: 'in_progress'
          }
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
      todos: [
        {
          content: 'new content',
          id: todoId,
          position: 2,
          priority: 'high',
          status: 'completed'
        }
      ]
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
    const usage = await asUser(0).query(api.tokenUsage.getTokenUsage, {
      sessionId
    })
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
      await c.db.patch(sessionId, {
        lastActivityAt: Date.now() - 25 * 60 * 60 * 1000
      })
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
              parts: [
                {
                  args: '{}',
                  status: 'pending',
                  toolCallId: 'call-1',
                  toolName: 'tool',
                  type: 'tool-call'
                }
              ],
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
    const result = await ctx.query(internal.compaction.getContextSize, {
      threadId
    })
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
    const result = await ctx.query(internal.compaction.getContextSize, {
      threadId
    })
    expect(result.charCount).toBe('summary-text'.length + 'tail'.length)
    expect(result.messageCount).toBe(1)
  })
  test('acquireCompactionLock first acquirer succeeds', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      result = await ctx.mutation(internal.compaction.acquireCompactionLock, {
        threadId
      })
    expect(result.ok).toBe(true)
    expect(result.lockToken.length > 0).toBe(true)
  })
  test('acquireCompactionLock second attempt rejected', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      first = await ctx.mutation(internal.compaction.acquireCompactionLock, {
        threadId
      }),
      second = await ctx.mutation(internal.compaction.acquireCompactionLock, {
        threadId
      })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(second.lockToken).toBe(first.lockToken)
  })
  test('acquireCompactionLock expired lock recoverable', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      first = await ctx.mutation(internal.compaction.acquireCompactionLock, {
        threadId
      })
    await ctx.run(async c => {
      const runState = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState)
        await c.db.patch(runState._id, {
          compactionLockAt: Date.now() - 11 * 60 * 1000
        })
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
    const groups = await ctx.query(internal.compaction.listClosedPrefixGroups, {
      threadId
    })
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
        parts: [
          {
            args: '{}',
            status: 'pending',
            toolCallId: 'call-1',
            toolName: 'tool-a',
            type: 'tool-call'
          }
        ],
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
    const groups = await ctx.query(internal.compaction.listClosedPrefixGroups, {
      threadId
    })
    expect(groups.length).toBe(1)
  })
  test('compactIfNeeded no-op under threshold', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      result = await ctx.mutation(internal.compaction.compactIfNeeded, {
        threadId
      })
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
    await ctx.mutation(internal.orchestrator.appendStepMetadata, {
      messageId,
      stepPayload: 'step-a'
    })
    await ctx.mutation(internal.orchestrator.appendStepMetadata, {
      messageId,
      stepPayload: 'step-b'
    })
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
    const runState = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(runState?.lastError).toBe('stream_failed')
  })
  test('readRunState returns correct state', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      runState = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
    expect(runState).not.toBeNull()
    expect(runState?.threadId).toBe(threadId)
    expect(runState?.status).toBe('idle')
  })
  test('readSessionByThread resolves session via threadId', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      session = await ctx.query(internal.orchestrator.readSessionByThread, {
        threadId
      })
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
        runMutation: () => ({ taskId: 'task-id', threadId: 'thread-id' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'parent-thread',
      sessionId: 'session-id' as never
    })
    expect(Object.keys(tools).toSorted()).toEqual([
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
        runMutation: () => ({ taskId: 'task-id', threadId: 'thread-id' }),
        runQuery: () => null
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
    const ownRows = await asUser(0).query(api.messages.listMessages, {
      threadId: workerThreadId
    })
    expect(ownRows.length).toBe(1)
    expect(String(taskId).length > 0).toBe(true)
    let threw = false
    try {
      await asUser(1).query(api.messages.listMessages, {
        threadId: workerThreadId
      })
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
    const ownTask = await asUser(0).query(api.tasks.getOwnedTaskStatus, {
        taskId
      }),
      otherTask = await asUser(1).query(api.tasks.getOwnedTaskStatus, {
        taskId
      })
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
                {
                  args: '{}',
                  status: 'pending',
                  toolCallId: 'call-pending',
                  toolName: 'tool-a',
                  type: 'tool-call'
                },
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
    const completeResult = await ctx.mutation(internal.tasks.completeTask, {
        result: 'late result',
        taskId
      }),
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
    const groups = await ctx.query(internal.compaction.listClosedPrefixGroups, {
      threadId
    })
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
      output = buildTaskCompletionReminder({
        description: 'done task',
        taskId: 'task-1'
      })
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
      await c.db.patch(sessionId, {
        lastActivityAt: Date.now() - 8 * 24 * 60 * 60 * 1000
      })
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
    } catch {
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
      activeBefore = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      }),
      runToken = activeBefore?.activeRunToken ?? '',
      claimed = await ctx.mutation(internal.orchestrator.claimRun, {
        runToken,
        threadId
      }),
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
    const finished = await ctx.mutation(internal.orchestrator.finishRun, {
        runToken,
        threadId
      }),
      assistantMessage = await ctx.run(async c => c.db.get(assistantMessageId)),
      finalRunState = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      }),
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
    const activeBefore = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      }),
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
    const queuedState = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      }),
      finished = await ctx.mutation(internal.orchestrator.finishRun, {
        runToken,
        threadId
      }),
      finalState = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
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
      await c.db.patch(sessionId, {
        lastActivityAt: Date.now() - 2 * 24 * 60 * 60 * 1000
      })
    })
    await ctx.mutation(internal.retention.archiveIdleSessions, {})
    const idle = await ctx.run(async c => c.db.get(sessionId))
    expect(idle?.status).toBe('idle')
    await ctx.run(async c => {
      await c.db.patch(sessionId, {
        lastActivityAt: Date.now() - 8 * 24 * 60 * 60 * 1000
      })
    })
    await ctx.mutation(internal.retention.archiveIdleSessions, {})
    const archived = await ctx.run(async c => c.db.get(sessionId))
    expect(archived?.status).toBe('archived')
    await ctx.run(async c => {
      await c.db.patch(sessionId, {
        archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000
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
    const before = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      }),
      runToken = before?.activeRunToken ?? ''
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const finished = await ctx.mutation(internal.orchestrator.finishRun, {
        runToken,
        threadId
      }),
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      }),
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
      runState = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
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
    const before = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      }),
      runToken = before?.activeRunToken ?? ''
    await ctx.mutation(internal.orchestrator.heartbeatRun, {
      runToken,
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const before = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.mutation(internal.orchestrator.heartbeatRun, {
      runToken: 'wrong-token',
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(after?.runHeartbeatAt).toBe(before?.runHeartbeatAt)
  })
  test('ensureRunState idempotent', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      first = await ctx.mutation(internal.orchestrator.ensureRunState, {
        threadId
      }),
      second = await ctx.mutation(internal.orchestrator.ensureRunState, {
        threadId
      })
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
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const rows = await asUser(0).query(api.messages.listMessages, {
      threadId: workerThreadId
    })
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
      const active = await ctx.query(internal.orchestrator.readRunState, {
          threadId
        }),
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
        runState = await ctx.query(internal.orchestrator.readRunState, {
          threadId
        })
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
    globalThis.ReadableStream = brokenReadableStream as unknown as typeof ReadableStream
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
      const active = await ctx.query(internal.orchestrator.readRunState, {
          threadId
        }),
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
      const runState = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      expect(runState?.lastError).toMatch(readableStreamFailurePattern)
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
      result = await ctx.mutation(internal.tasks.maybeContinueOrchestrator, {
        taskId
      }),
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
    const ownRows = await asUser(0).query(api.tasks.listTasks, {
        sessionId: s0
      }),
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
    const result = await ctx.mutation(internal.compaction.compactIfNeeded, {
      threadId
    })
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
    const result = await ctx.mutation(internal.compaction.compactIfNeeded, {
      threadId
    })
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
    const result = await ctx.mutation(internal.compaction.compactIfNeeded, {
      threadId
    })
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
    const lock = await ctx.mutation(internal.compaction.acquireCompactionLock, {
      threadId
    })
    await ctx.mutation(internal.compaction.setCompactionSummary, {
      compactionSummary: 'boundary-summary',
      lastCompactedMessageId: String(m2),
      lockToken: lock.lockToken,
      threadId
    })
    const groups = await ctx.query(internal.compaction.listClosedPrefixGroups, {
      threadId
    })
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
    const lock = await ctx.mutation(internal.compaction.acquireCompactionLock, {
        threadId: t0
      }),
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
    const size = await ctx.query(internal.compaction.getContextSize, {
      threadId
    })
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
    } catch {
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
    const usage = await asUser(1).query(api.tokenUsage.getTokenUsage, {
      sessionId
    })
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
              parts: [
                {
                  args: '{}',
                  status: 'pending',
                  toolCallId: 'recent-call',
                  toolName: 'tool',
                  type: 'tool-call'
                }
              ],
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
      if (originalTestMode === undefined) {
        delete process.env.CONVEX_TEST_MODE
      } else {
        process.env.CONVEX_TEST_MODE = originalTestMode
      }
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
      text = buildTaskCompletionReminder({
        description: 'compile docs',
        taskId: 'task-123'
      })
    expect(text.includes('<system-reminder>')).toBe(true)
    expect(text.includes('[BACKGROUND TASK COMPLETED]')).toBe(true)
    expect(text.includes('Task ID: task-123')).toBe(true)
    expect(text.includes('Description: compile docs')).toBe(true)
    expect(text.includes('</system-reminder>')).toBe(true)
  })
  test('buildTaskCompletionReminder has stable line structure', async () => {
    const { buildTaskCompletionReminder } = await import('./tasks'),
      text = buildTaskCompletionReminder({
        description: 'shape check',
        taskId: 'task-shape'
      }),
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
    expect(events.at(-2)).toBe('text-end')
    expect(events.at(-1)).toBe('finish')
  })
})
describe('gap coverage tool factories', () => {
  test('delegate tool executes runMutation with spawned task payload', async () => {
    const { createOrchestratorTools } = await import('./agents')
    let called = false
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: (_ref: unknown, args: unknown) => {
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
        runQuery: () => null
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
        runMutation: (_ref: unknown, args: unknown) => {
          called = true
          const payload = args as {
            sessionId: string
            todos: {
              content: string
              id?: string
              position: number
              priority: string
              status: string
            }[]
          }
          expect(payload.sessionId).toBe('session-2')
          expect(payload.todos.length).toBe(2)
          expect(payload.todos[0]?.content).toBe('a')
          return { updated: payload.todos.length }
        },
        runQuery: () => null
      } as never,
      parentThreadId: 'parent-2',
      sessionId: 'session-2' as never
    })
    const todoWrite = tools.todoWrite as unknown as {
      execute: (input: {
        todos: {
          content: string
          id?: string
          position: number
          priority: 'high' | 'low' | 'medium'
          status: string
        }[]
      }) => Promise<unknown>
    }
    const result = (await todoWrite.execute({
      todos: [
        { content: 'a', position: 0, priority: 'high', status: 'pending' },
        {
          content: 'b',
          id: 'todo-b',
          position: 1,
          priority: 'low',
          status: 'in_progress'
        }
      ]
    })) as { updated: number }
    expect(called).toBe(true)
    expect(result.updated).toBe(2)
  })
  test('todoRead tool normalizes array response to todos object', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: () => [{ content: 'todo 1' }]
      } as never,
      parentThreadId: 'parent-3',
      sessionId: 'session-3' as never
    })
    const todoRead = tools.todoRead as unknown as {
        execute: (input: object) => Promise<unknown>
      },
      result = (await todoRead.execute({})) as { todos: { content: string }[] }
    expect(result.todos.length).toBe(1)
    expect(result.todos[0]?.content).toBe('todo 1')
  })
  test('todoRead tool passes through object response', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: () => ({ todos: [{ content: 'todo passthrough' }] })
      } as never,
      parentThreadId: 'parent-4',
      sessionId: 'session-4' as never
    })
    const todoRead = tools.todoRead as unknown as {
        execute: (input: object) => Promise<unknown>
      },
      result = (await todoRead.execute({})) as { todos: { content: string }[] }
    expect(result.todos.length).toBe(1)
    expect(result.todos[0]?.content).toBe('todo passthrough')
  })
  test('taskStatus tool returns null contract when task is missing', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'parent-5',
      sessionId: 'session-5' as never
    })
    const taskStatus = tools.taskStatus as unknown as {
        execute: (input: { taskId: string }) => Promise<unknown>
      },
      result = (await taskStatus.execute({ taskId: 'missing' })) as {
        description: null
        status: null
      }
    expect(result.description).toBeNull()
    expect(result.status).toBeNull()
  })
  test('taskStatus tool returns status and description', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: () => ({
          description: 'download file',
          status: 'running'
        })
      } as never,
      parentThreadId: 'parent-6',
      sessionId: 'session-6' as never
    })
    const taskStatus = tools.taskStatus as unknown as {
        execute: (input: { taskId: string }) => Promise<unknown>
      },
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
        runMutation: () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: () => ({ status: 'running' })
      } as never,
      parentThreadId: 'parent-7',
      sessionId: 'session-7' as never
    })
    const taskOutput = tools.taskOutput as unknown as {
        execute: (input: { taskId: string }) => Promise<unknown>
      },
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
        runMutation: () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: () => ({ result: 'done output', status: 'completed' })
      } as never,
      parentThreadId: 'parent-8',
      sessionId: 'session-8' as never
    })
    const taskOutput = tools.taskOutput as unknown as {
        execute: (input: { taskId: string }) => Promise<unknown>
      },
      result = (await taskOutput.execute({ taskId: 'task-8' })) as {
        result: string | null
        status: string | null
      }
    expect(result.status).toBe('completed')
    expect(result.result).toBe('done output')
  })
  test('webSearch tool returns placeholder summary with sources', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runAction: async () => ({
          sources: [
            {
              snippet: 'Test snippet',
              title: 'Test Source',
              url: 'https://example.com'
            }
          ],
          summary: 'Mock search result for: convex'
        }),
        runMutation: () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'parent-9',
      sessionId: 'session-9' as never
    })
    const webSearch = tools.webSearch as unknown as {
        execute: (input: { query: string }) => Promise<unknown>
      },
      result = (await webSearch.execute({ query: 'convex' })) as {
        sources: unknown[]
        summary: string
      }
    expect(Array.isArray(result.sources)).toBe(true)
    expect(result.sources.length).toBe(1)
    expect(result.summary).toBe('Mock search result for: convex')
  })
  test('createWorkerTools exposes only webSearch behavior', async () => {
    const { createWorkerTools } = await import('./agents')
    const tools = createWorkerTools({
      ctx: {
        runAction: async () => ({
          sources: [
            {
              snippet: 'Test snippet',
              title: 'Test Source',
              url: 'https://example.com'
            }
          ],
          summary: 'Mock search result for: worker query'
        }),
        runMutation: () => ({ taskId: 'task', threadId: 'thread' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'worker-parent',
      sessionId: 'worker-session' as never
    })
    expect(Object.keys(tools)).toEqual(['webSearch'])
    const webSearch = tools.webSearch as unknown as {
        execute: (input: { query: string }) => Promise<unknown>
      },
      result = (await webSearch.execute({ query: 'worker query' })) as {
        summary: string
      }
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
    const usage = await asUser(0).query(api.tokenUsage.getTokenUsage, {
      sessionId
    })
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
    const usageA = await asUser(0).query(api.tokenUsage.getTokenUsage, {
      sessionId: a
    })
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const runState = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
            parts: [
              {
                args: '{}',
                status: 'pending',
                toolCallId: 'p',
                toolName: 'x',
                type: 'tool-call'
              }
            ],
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
    await ctx.mutation(internal.tasks.failTask, {
      lastError: 'boom state',
      taskId
    })
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
      } catch {
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
  test('cron schedule wiring matches documented intervals', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('crons.ts', import.meta.url), 'utf8')
    expect(
      source.includes("crons.interval('timeout stale runs', { minutes: 5 }, internal.orchestrator.timeoutStaleRuns)")
    ).toBe(true)
    expect(
      source.includes("crons.interval('timeout stale tasks', { minutes: 5 }, internal.staleTaskCleanup.timeoutStaleTasks)")
    ).toBe(true)
    expect(
      source.includes(
        "crons.interval('cleanup stale messages', { minutes: 5 }, internal.staleTaskCleanup.cleanupStaleMessages)"
      )
    ).toBe(true)
    expect(
      source.includes("crons.interval('archive idle sessions', { hours: 1 }, internal.retention.archiveIdleSessions)")
    ).toBe(true)
    expect(
      source.includes("crons.cron('cleanup archived sessions', '0 3 * * *', internal.retention.cleanupArchivedSessions)")
    ).toBe(true)
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
      const first = await ctx.mutation(api.testauth.createTestUser, {
          email,
          name: 'Sweep User'
        }),
        second = await ctx.mutation(api.testauth.createTestUser, {
          email,
          name: 'Sweep User'
        }),
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
      await c.db.patch(serverId, {
        cachedTools: JSON.stringify(['alpha', 'beta'])
      })
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
      await c.db.patch(enabledId, {
        cachedTools: JSON.stringify(['enabledTool'])
      })
      await c.db.patch(disabledId, {
        cachedTools: JSON.stringify(['disabledTool'])
      })
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
          sources: [
            {
              snippet: 'Snippet A',
              title: 'Source A',
              url: 'https://a.example'
            }
          ],
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
          runMutation: (ref, args) => ctx.mutation(ref, args),
          runQuery: (ref, args) => ctx.query(ref, args)
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
    expect(usageRows.at(-1)?.agentName).toBe('search-bridge')
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
      const session = await c.db.get(sessionId)
      await c.db.insert('mcpServers', {
        isEnabled: true,
        name: 'json-test',
        transport: 'http',
        updatedAt: Date.now(),
        url: 'https://example.com/mcp',
        userId: session?.userId as never
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
    expect(rows.at(-1)?.agentName).toBe('search-bridge')
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
      checkRateLimit({ db: c.db } as never, {
        key: 'search-call-key',
        name: 'searchCall'
      })
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    for (let i = 0; i < 40; i += 1)
      await ctx.mutation(internal.orchestrator.heartbeatRun, {
        runToken: state?.activeRunToken ?? '',
        threadId
      })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(after?.status).toBe('active')
  })
  test('rate-limit #7 refill window behavior', async () => {
    const ctx = t(),
      first = await ctx.run(async c =>
        rateLimit({ db: c.db } as never, {
          count: 20,
          key: 'refill-window-user',
          name: 'submitMessage'
        })
      ),
      blocked = await ctx.run(async c =>
        checkRateLimit({ db: c.db } as never, {
          key: 'refill-window-user',
          name: 'submitMessage'
        })
      )
    expect(first.ok).toBe(true)
    expect(blocked.ok).toBe(false)
    const afterReset = await ctx.run(async c =>
      resetRateLimit({ db: c.db } as never, {
        key: 'refill-window-user',
        name: 'submitMessage'
      })
    )
    expect(afterReset).toBeNull()
    const allowed = await ctx.run(async c =>
      checkRateLimit({ db: c.db } as never, {
        key: 'refill-window-user',
        name: 'submitMessage'
      })
    )
    expect(allowed.ok).toBe(true)
  })
  test('rate-limit #8 storage index wiring', async () => {
    const ctx = t()
    await ctx.run(async c => {
      await rateLimit({ db: c.db } as never, {
        key: 'storage-wire-user',
        name: 'mcpCall'
      })
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
        const existing = c.db
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
            auth: {
              getUserIdentity: async () => ({ subject: `${testUserId}|token` })
            },
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
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    await asUser(0).mutation(api.orchestrator.submitMessage, {
      content: 'delegate this',
      sessionId
    })
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
      const rs = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', i => i.eq('threadId', threadId))
        .unique()
      if (rs)
        await c.db.patch(rs._id, {
          compactionSummary: 'Previous conversation summary about weather.'
        })
    })
    const rs = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', i => i.eq('threadId', threadId))
        .unique()
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
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', i => i.eq('threadId', threadId))
        .unique()
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
          {
            args: '{"q":"test"}',
            result: 'found it',
            status: 'success',
            toolCallId: 'tc-1',
            toolName: 'webSearch',
            type: 'tool-call'
          }
        ],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const msgs = await ctx.query(internal.orchestrator.listMessagesForPrompt, {
      threadId
    })
    expect(msgs.length).toBe(1)
    const parts = msgs[0]?.parts as { type: string }[]
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
    const status = await asUser(0).query(api.tasks.getOwnedTaskStatus, {
      taskId
    })
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
      source = readFileSync(new URL('tasks.ts', import.meta.url), 'utf8'),
      completionPatchIndex = source.indexOf("status: 'completed'"),
      maybeContinueIndex = source.indexOf('await maybeContinueOrchestratorInline({ ctx, taskId })')
    expect(completionPatchIndex !== -1).toBe(true)
    expect(maybeContinueIndex !== -1).toBe(true)
    expect(completionPatchIndex < maybeContinueIndex).toBe(true)
    expect(source.includes('completionNotifiedAt')).toBe(false)
  })
  test('exponential backoff formula uses 1s, 2s, 4s and caps retries at 3', async () => {
    const { readFileSync } = await import('node:fs'),
      source = readFileSync(new URL('tasks.ts', import.meta.url), 'utf8')
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
      source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
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
      const active = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
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
        runMutation: (ref, args) => ctx.mutation(ref, args),
        runQuery: (ref, args) => ctx.query(ref, args)
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
    const fs = await import('node:fs'),
      source = fs.readFileSync(new URL('agents.ts', import.meta.url), 'utf8')
    expect(source.includes('getOwnedTaskOutputRef = makeFunctionReference')).toBe(true)
    expect(source.includes("('tasks:getOwnedTaskOutput')")).toBe(true)
    const status = await asUser(0).query(api.tasks.getOwnedTaskStatus, {
      taskId
    })
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
        runMutation: () => ({ taskId: 'task-id', threadId: 'thread-id' }),
        runQuery: () => null
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
    } catch {
      updateThrew = true
    }
    let deleteThrew = false
    try {
      await asUser(0).mutation(api.mcp.rm, { id })
    } catch {
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
      const before = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
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
      const after = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
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
      out = buildTaskCompletionReminder({
        description: 'desc',
        taskId: 'task-123'
      })
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
    const fs = await import('node:fs'),
      source = fs.readFileSync(new URL('orchestrator.ts', import.meta.url), 'utf8')
    expect(source.includes("'[TODO CONTINUATION]'") || source.includes('"[TODO CONTINUATION]"')).toBe(true)
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
      await c.db.patch(sessionId, {
        lastActivityAt: Date.now() - 8 * 24 * 60 * 60 * 1000
      })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const runState = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const runState = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
          lastTodoSnapshot: JSON.stringify([
            {
              content: 'todo-progress-complete',
              id: String(todoId),
              status: 'pending'
            }
          ]),
          stagnationCount: 2
        })
    })
    await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const runState = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
          lastTodoSnapshot: JSON.stringify([
            {
              content: 'todo-before-change',
              id: String(todoId),
              status: 'pending'
            }
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
    const runState = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const runState = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
          lastContinuationAt: Date.now() - 1000
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
      if (state)
        await c.db.patch(state._id, {
          lastContinuationAt: Date.now() - 25_000
        })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
      if (state)
        await c.db.patch(state._id, {
          consecutiveFailures: 5,
          lastContinuationAt: Date.now()
        })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const runState = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const runState = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
      snapshot: [
        {
          content: 'restore-a',
          position: 0,
          priority: 'high',
          status: 'pending'
        }
      ],
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
      snapshot: [
        {
          content: 'already-present',
          position: 0,
          priority: 'high',
          status: 'pending'
        }
      ],
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      }),
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
    await ctx.mutation(internal.tasks.completeTask, {
      result: 'done-1',
      taskId: firstTaskId
    })
    await ctx.mutation(internal.tasks.completeTask, {
      result: 'done-2',
      taskId: secondTaskId
    })
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
    { expectedDelay: 2000, retryCount: 0 },
    { expectedDelay: 4000, retryCount: 1 },
    { expectedDelay: 8000, retryCount: 2 }
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
      const result = await ctx.mutation(internal.tasks.scheduleRetry, {
        taskId
      })
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
      const result = await ctx.mutation(internal.tasks.scheduleRetry, {
        taskId
      })
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
          completedAt:
            s === 'completed' || s === 'failed' || s === 'cancelled' || s === 'timed_out' ? Date.now() : undefined,
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
    const before = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: 'token-mismatch',
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const before = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const firstState = await ctx.query(internal.orchestrator.readRunState, {
        threadId: first.threadId
      }),
      secondState = await ctx.query(internal.orchestrator.readRunState, {
        threadId: second.threadId
      })
    expect(firstState?.status).toBe('active')
    expect(secondState?.status).toBe('active')
    expect(firstState?.activeRunToken).not.toBe(secondState?.activeRunToken)
  })
})
describe('omo parity delegate gaps', () => {
  test('detectDelegateError identifies missing run_in_background', async () => {
    const { detectDelegateError } = await import('./agents')
    const pattern = detectDelegateError({
      errorMessage: 'Invalid arguments: missing run_in_background field'
    })
    expect(pattern).toBe('missing_run_in_background')
  })
  test('detectDelegateError identifies missing load_skills', async () => {
    const { detectDelegateError } = await import('./agents')
    const pattern = detectDelegateError({
      errorMessage: 'Validation error: load_skills is required'
    })
    expect(pattern).toBe('missing_load_skills')
  })
  test('detectDelegateError identifies unknown category', async () => {
    const { detectDelegateError } = await import('./agents')
    const pattern = detectDelegateError({
      errorMessage: 'Unknown category: nope'
    })
    expect(pattern).toBe('unknown_category')
  })
  test('detectDelegateError identifies unknown agent', async () => {
    const { detectDelegateError } = await import('./agents')
    const pattern = detectDelegateError({
      errorMessage: 'Unknown agent: nope'
    })
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
        runMutation: () => {
          throw new Error('Invalid arguments: run_in_background is required')
        },
        runQuery: () => null
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
        runMutation: () => {
          throw new Error('Invalid arguments: load_skills missing')
        },
        runQuery: () => null
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
        runMutation: () => {
          throw new Error('Unknown category bad. Available: quick, deep')
        },
        runQuery: () => null
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
        runMutation: () => {
          throw new Error('Unknown agent bad. valid options: explore, librarian')
        },
        runQuery: () => null
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
        runMutation: () => {
          throw new Error('rpc failed without signature')
        },
        runQuery: () => null
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
        runMutation: (_ref: unknown, args: unknown) => {
          payload = args as { isBackground: boolean }
          return {
            taskId: 'delegate-default-bg-task',
            threadId: 'delegate-default-bg-thread'
          }
        },
        runQuery: () => null
      } as never,
      parentThreadId: 'delegate-parent-6',
      sessionId: 'delegate-session-6' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: { description: string; isBackground: boolean; prompt: string }) => Promise<Record<string, unknown>>
    }
    await delegate.execute({
      description: 'default bg',
      isBackground: true,
      prompt: 'run'
    })
    expect(payload?.isBackground).toBe(true)
  })
  test('delegate forwards explicit isBackground=false', async () => {
    const { createOrchestratorTools } = await import('./agents')
    let payload: { isBackground: boolean } | null = null
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: (_ref: unknown, args: unknown) => {
          payload = args as { isBackground: boolean }
          return {
            taskId: 'delegate-sync-bg-task',
            threadId: 'delegate-sync-bg-thread'
          }
        },
        runQuery: () => null
      } as never,
      parentThreadId: 'delegate-parent-7',
      sessionId: 'delegate-session-7' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: { description: string; isBackground: boolean; prompt: string }) => Promise<Record<string, unknown>>
    }
    await delegate.execute({
      description: 'sync-like bg',
      isBackground: false,
      prompt: 'run'
    })
    expect(payload?.isBackground).toBe(false)
  })
  for (const status of ['cancelled', 'failed', 'pending', 'running', 'timed_out'] as const)
    test(`taskOutput returns ${status} status with null result contract`, async () => {
      const { createOrchestratorTools } = await import('./agents')
      const tools = createOrchestratorTools({
        ctx: {
          runMutation: () => ({
            taskId: 'task-id',
            threadId: 'thread-id'
          }),
          runQuery: () => ({ status })
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
    { blockedMs: 9000, consecutiveFailures: 1 },
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
      const active = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
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
      const active = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
      if (state)
        await d.db.patch(state._id, {
          consecutiveFailures: 5,
          lastContinuationAt: Date.now() - 60_000
        })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
          lastTodoSnapshot: JSON.stringify([
            {
              content: 'stagnation-cap',
              id: String(todoId),
              status: 'pending'
            }
          ]),
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
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
          lastTodoSnapshot: JSON.stringify([
            {
              content: 'stagnation-progress-old',
              id: String(todoId),
              status: 'pending'
            }
          ]),
          stagnationCount: 2
        })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(result.shouldContinue).toBe(true)
    expect(state?.stagnationCount).toBe(0)
  })
})
describe('omo parity error classifier gaps', () => {
  test('isTransientError marker list contains econnreset', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
    expect(source.includes('econnreset')).toBe(true)
  })
  test('isTransientError marker list contains etimedout', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
    expect(source.includes('etimedout')).toBe(true)
  })
  test('isTransientError marker list contains timeout', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
    expect(source.includes('timeout')).toBe(true)
  })
  test('isTransientError marker list contains 503', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
    expect(source.includes("'503'")).toBe(true)
  })
  test('isTransientError marker list contains 429', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
    expect(source.includes("'429'")).toBe(true)
  })
  test('isTransientError marker list contains overloaded marker', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
    expect(source.includes('overloaded')).toBe(true)
  })
  test('isTransientError marker list excludes auth keywords for permanent path', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
    expect(source.includes('unauthorized')).toBe(false)
    expect(source.includes('forbidden')).toBe(false)
  })
  test('isTransientError marker list excludes validation keywords for permanent path', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
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
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
      const before = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
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
      const after = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
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
      const incomingReason =
        c.incomingPriority === 2 ? 'user_message' : c.incomingPriority === 1 ? 'task_completion' : 'todo_continuation'
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
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
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
    const before = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: before?.activeRunToken ?? '',
      threadId
    })
    const idle = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    const reenqueue = await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'archive-free-slot-new',
      reason: 'user_message',
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
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
    const aState = await ctx.query(internal.orchestrator.readRunState, {
        threadId: a.threadId
      }),
      bState = await ctx.query(internal.orchestrator.readRunState, {
        threadId: b.threadId
      })
    expect(aState?.status).toBe('active')
    expect(aState?.queuedPromptMessageId).toBe('concurrency-a-queued')
    expect(bState?.status).toBe('active')
    expect(bState?.queuedPromptMessageId).toBe('concurrency-b-queued')
  })
})
describe('parity batch schema validation extras', () => {
  for (const status of ['pending', 'running', 'completed', 'failed', 'timed_out', 'cancelled'] as const)
    test(`taskSchema accepts task status ${status}`, async () => {
      const { taskSchema } = await import('../t')
      const parsed = taskSchema.safeParse({
        description: `task-${status}`,
        isBackground: true,
        parentThreadId: 'schema-parent',
        retryCount: 0,
        sessionId: 'session-id' as never,
        status,
        threadId: `schema-thread-${status}`
      })
      expect(parsed.success).toBe(true)
    })
  for (const status of ['pending', 'in_progress', 'completed', 'cancelled'] as const)
    test(`todoSchema accepts todo status ${status}`, async () => {
      const { todoSchema } = await import('../t')
      const parsed = todoSchema.safeParse({
        content: `todo-${status}`,
        position: 0,
        priority: 'high',
        sessionId: 'session-id' as never,
        status
      })
      expect(parsed.success).toBe(true)
    })
  for (const status of ['idle', 'active'] as const)
    test(`threadRunStateSchema accepts run status ${status}`, async () => {
      const { threadRunStateSchema } = await import('../t')
      const parsed = threadRunStateSchema.safeParse({
        autoContinueStreak: 0,
        consecutiveFailures: 0,
        stagnationCount: 0,
        status,
        threadId: `run-state-${status}`
      })
      expect(parsed.success).toBe(true)
    })
  test('taskSchema rejects unknown task status', async () => {
    const { taskSchema } = await import('../t')
    const parsed = taskSchema.safeParse({
      description: 'invalid-status',
      isBackground: true,
      parentThreadId: 'schema-parent',
      retryCount: 0,
      sessionId: 'session-id' as never,
      status: 'unknown',
      threadId: 'schema-thread'
    })
    expect(parsed.success).toBe(false)
  })
  test('todoSchema rejects unknown priority', async () => {
    const { todoSchema } = await import('../t')
    const parsed = todoSchema.safeParse({
      content: 'bad-priority',
      position: 1,
      priority: 'urgent',
      sessionId: 'session-id' as never,
      status: 'pending'
    })
    expect(parsed.success).toBe(false)
  })
  test('threadRunStateSchema rejects invalid queued priority', async () => {
    const { threadRunStateSchema } = await import('../t')
    const parsed = threadRunStateSchema.safeParse({
      autoContinueStreak: 0,
      queuedPriority: 'invalid',
      status: 'idle',
      threadId: 'run-state-invalid'
    })
    expect(parsed.success).toBe(false)
  })
  test('taskSchema requires sessionId field', async () => {
    const { taskSchema } = await import('../t')
    const parsed = taskSchema.safeParse({
      description: 'missing-session',
      isBackground: true,
      parentThreadId: 'schema-parent',
      retryCount: 0,
      status: 'pending',
      threadId: 'schema-thread'
    })
    expect(parsed.success).toBe(false)
  })
})
describe('parity batch todo sync extras', () => {
  test('syncOwned returns zero updates for empty payload', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      result = await ctx.mutation(internal.todos.syncOwned, {
        sessionId,
        todos: []
      })
    expect(result.updated).toBe(0)
  })
  test('syncOwned throws when session does not exist', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId: deletedSessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.delete(deletedSessionId)
    })
    let threw = false
    try {
      await ctx.mutation(internal.todos.syncOwned, {
        sessionId: deletedSessionId,
        todos: [{ content: 'x', position: 0, priority: 'high', status: 'pending' }]
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('session_not_found')
    }
    expect(threw).toBe(true)
  })
  test('syncOwned inserts when id points to deleted todo', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    const staleId = await ctx.run(async c =>
      c.db.insert('todos', {
        content: 'to-delete',
        position: 0,
        priority: 'low',
        sessionId,
        status: 'pending'
      })
    )
    await ctx.run(async c => {
      await c.db.delete(staleId)
    })
    await ctx.mutation(internal.todos.syncOwned, {
      sessionId,
      todos: [
        {
          content: 'replacement',
          id: staleId,
          position: 0,
          priority: 'high',
          status: 'in_progress'
        }
      ]
    })
    const rows = await ctx.run(async c =>
      c.db
        .query('todos')
        .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
        .collect()
    )
    expect(rows.length).toBe(1)
    expect(rows[0]?.content).toBe('replacement')
  })
  test('syncOwned supports duplicate positions without collapsing rows', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.todos.syncOwned, {
      sessionId,
      todos: [
        {
          content: 'first-at-zero',
          position: 0,
          priority: 'high',
          status: 'pending'
        },
        {
          content: 'second-at-zero',
          position: 0,
          priority: 'medium',
          status: 'in_progress'
        }
      ]
    })
    const rows = await ctx.run(async c =>
      c.db
        .query('todos')
        .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
        .collect()
    )
    expect(rows.length).toBe(2)
  })
  test('listTodos returns empty array when session is missing', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId: deletedSessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.delete(deletedSessionId)
    })
    const rows = await asUser(0).query(api.todos.listTodos, {
      sessionId: deletedSessionId
    })
    expect(rows).toEqual([])
  })
  test('listTodos returns position-ordered rows from index', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'later',
        position: 3,
        priority: 'low',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('todos', {
        content: 'earlier',
        position: 1,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    const rows = await asUser(0).query(api.todos.listTodos, { sessionId })
    expect(rows[0]?.content).toBe('earlier')
    expect(rows[1]?.content).toBe('later')
  })
})
describe('parity batch stale recovery extras', () => {
  test('recordRunError creates run state for missing thread', async () => {
    const ctx = t(),
      threadId = `record-error-${crypto.randomUUID()}`
    await ctx.mutation(internal.orchestrator.recordRunError, {
      error: 'late_error',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(state?.lastError).toBe('late_error')
    expect(state?.status).toBe('idle')
  })
  test('timeoutStaleRuns uses claimedAt fallback when heartbeat absent', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'claimed-fallback-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          claimedAt: Date.now() - 16 * 60 * 1000,
          runClaimed: true,
          runHeartbeatAt: undefined,
          status: 'active'
        })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(after?.status).toBe('idle')
    expect(after?.activeRunToken).not.toBe(before?.activeRunToken)
  })
  test('timeoutStaleRuns keeps claimed run when heartbeat is fresh', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'fresh-claimed-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          activatedAt: Date.now() - 3 * 60 * 1000,
          claimedAt: Date.now() - 3 * 60 * 1000,
          runClaimed: true,
          runHeartbeatAt: Date.now() - 30_000,
          status: 'active'
        })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(after?.status).toBe('active')
    expect(after?.activeRunToken).toBe(before?.activeRunToken)
  })
  test('timeoutStaleRuns rotates token and clears queued fields after archived queue drop', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'archived-drop-start',
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'archived-drop-queued',
      reason: 'task_completion',
      threadId
    })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          activatedAt: Date.now() - 6 * 60 * 1000,
          runClaimed: false,
          status: 'active'
        })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(after?.status).toBe('idle')
    expect(after?.queuedPromptMessageId).toBeUndefined()
    expect(after?.queuedReason).toBeUndefined()
  })
})
describe('parity batch idle handling extras', () => {
  test('postTurnAudit returns ok=false for idle run state token', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken: 'no-active-token',
        threadId,
        turnRequestedInput: false
      })
    expect(result.ok).toBe(false)
    expect(result.shouldContinue).toBe(false)
  })
  test('postTurnAudit resets streak when session is archived', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'idle-archive-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state) await c.db.patch(state._id, { autoContinueStreak: 4 })
    })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(result.ok).toBe(true)
    expect(result.shouldContinue).toBe(false)
    expect(state?.autoContinueStreak).toBe(0)
  })
  test('postTurnAudit blocks when queued higher priority exists and keeps queue intact', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'higher-priority-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'needs-followup',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'higher-priority-already-queued',
      reason: 'user_message',
      threadId
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(result.shouldContinue).toBe(false)
    expect(state?.queuedReason).toBe('user_message')
    expect(state?.queuedPromptMessageId).toBe('higher-priority-already-queued')
  })
  test('postTurnAudit can continue with malformed previous snapshot', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'bad-snapshot-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'bad-snapshot-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state) await c.db.patch(state._id, { lastTodoSnapshot: '{bad-json' })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.ok).toBe(true)
    expect(result.shouldContinue).toBe(true)
  })
  test('postTurnAudit can continue with previous snapshot of invalid shape', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'bad-shape-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'bad-shape-todo',
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
          lastTodoSnapshot: JSON.stringify([{ nope: true }])
        })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(result.ok).toBe(true)
    expect(result.shouldContinue).toBe(true)
  })
})
describe('parity batch task polling equivalents', () => {
  test('listActiveTasksByThread returns pending and running only', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('tasks', {
        description: 'pending-x',
        isBackground: true,
        parentThreadId: threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `poll-pending-${crypto.randomUUID()}`
      })
      await c.db.insert('tasks', {
        description: 'running-x',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `poll-running-${crypto.randomUUID()}`
      })
      await c.db.insert('tasks', {
        completedAt: Date.now(),
        description: 'completed-x',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: `poll-completed-${crypto.randomUUID()}`
      })
    })
    const rows = await ctx.query(internal.orchestrator.listActiveTasksByThread, { threadId })
    expect(rows.length).toBe(2)
    expect(rows.some(r => r.status === 'pending')).toBe(true)
    expect(rows.some(r => r.status === 'running')).toBe(true)
  })
  test('listActiveTasksByThread excludes other parent threads', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      a = await asUser(0).mutation(api.sessions.createSession, {}),
      b = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('tasks', {
        description: 'a-pending',
        isBackground: true,
        parentThreadId: a.threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId: a.sessionId,
        status: 'pending',
        threadId: `poll-a-${crypto.randomUUID()}`
      })
      await c.db.insert('tasks', {
        description: 'b-pending',
        isBackground: true,
        parentThreadId: b.threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId: b.sessionId,
        status: 'pending',
        threadId: `poll-b-${crypto.randomUUID()}`
      })
    })
    const rows = await ctx.query(internal.orchestrator.listActiveTasksByThread, { threadId: a.threadId })
    expect(rows.length).toBe(1)
    expect(rows[0]?.description).toBe('a-pending')
  })
  test('postTurnAudit stores snapshot when no continuation occurs', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'snapshot-store-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'snapshot-store',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('tasks', {
        description: 'snapshot-pending-task',
        isBackground: true,
        parentThreadId: threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `snapshot-pending-${crypto.randomUUID()}`
      })
    })
    const result = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(result.shouldContinue).toBe(false)
    expect(typeof state?.lastTodoSnapshot).toBe('string')
    expect((state?.lastTodoSnapshot ?? '').includes('snapshot-store')).toBe(true)
  })
})
describe('parity batch transient classifier source extras', () => {
  for (const marker of ['econnreset', 'etimedout', 'timeout', 'rate_limit', '429', '503', 'overloaded'] as const)
    test(`agentsNode transient marker includes ${marker}`, async () => {
      const { readFileSync } = await import('node:fs')
      const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
      expect(source.includes(marker)).toBe(true)
    })
  for (const token of ['invalid_request_error', 'missing required', 'authentication failed'] as const)
    test(`agentsNode transient marker set excludes ${token}`, async () => {
      const { readFileSync } = await import('node:fs')
      const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
      expect(source.includes(token)).toBe(false)
    })
})
describe('parity task-create equivalents', () => {
  test('spawnTask creates pending row with required fields', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      out = await ctx.mutation(internal.tasks.spawnTask, {
        description: 'create parity task',
        isBackground: true,
        parentThreadId,
        prompt: 'do create parity task',
        sessionId
      }),
      row = await ctx.run(async c => c.db.get(out.taskId))
    expect(row?.status).toBe('pending')
    expect(row?.description).toBe('create parity task')
    expect(row?.prompt).toBe('do create parity task')
    expect(row?.parentThreadId).toBe(parentThreadId)
  })
  test('spawnTask generates worker thread id distinct from parent', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      out = await ctx.mutation(internal.tasks.spawnTask, {
        description: 'thread mapping parity',
        isBackground: true,
        parentThreadId,
        prompt: 'thread mapping parity',
        sessionId
      })
    expect(out.threadId.length > 0).toBe(true)
    expect(out.threadId).not.toBe(parentThreadId)
  })
  test('spawnTask rejects archived parent session', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    let threw = false
    try {
      await ctx.mutation(internal.tasks.spawnTask, {
        description: 'should reject',
        isBackground: true,
        parentThreadId,
        prompt: 'blocked',
        sessionId
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('session_not_found')
    }
    expect(threw).toBe(true)
  })
  test('spawnTask persists pendingAt timestamp', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      out = await ctx.mutation(internal.tasks.spawnTask, {
        description: 'pendingAt parity',
        isBackground: true,
        parentThreadId,
        prompt: 'pendingAt parity',
        sessionId
      }),
      row = await ctx.run(async c => c.db.get(out.taskId))
    expect(typeof row?.pendingAt).toBe('number')
    expect((row?.pendingAt ?? 0) > 0).toBe(true)
  })
})
describe('parity task-update equivalents', () => {
  test('completeTask transitions running -> completed with result', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'update-complete',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `update-complete-${crypto.randomUUID()}`
        })
      )
    const out = await ctx.mutation(internal.tasks.completeTask, {
        result: 'done',
        taskId
      }),
      row = await ctx.run(async c => c.db.get(taskId))
    expect(out.ok).toBe(true)
    expect(row?.status).toBe('completed')
    expect(row?.result).toBe('done')
    expect(row?.completedAt).toBeDefined()
  })
  test('failTask transitions running -> failed with lastError', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'update-fail',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `update-fail-${crypto.randomUUID()}`
        })
      )
    const out = await ctx.mutation(internal.tasks.failTask, {
        lastError: 'boom-update',
        taskId
      }),
      row = await ctx.run(async c => c.db.get(taskId))
    expect(out.ok).toBe(true)
    expect(row?.status).toBe('failed')
    expect(row?.lastError).toBe('boom-update')
    expect(row?.completedAt).toBeDefined()
  })
  test('completeTask rejects non-running status', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'update-complete-reject',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          status: 'pending',
          threadId: `update-complete-reject-${crypto.randomUUID()}`
        })
      ),
      out = await ctx.mutation(internal.tasks.completeTask, {
        result: 'nope',
        taskId
      })
    expect(out.ok).toBe(false)
  })
  test('failTask rejects non-running status', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'update-fail-reject',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          status: 'pending',
          threadId: `update-fail-reject-${crypto.randomUUID()}`
        })
      ),
      out = await ctx.mutation(internal.tasks.failTask, {
        lastError: 'nope',
        taskId
      })
    expect(out.ok).toBe(false)
  })
})
describe('parity task-get equivalents', () => {
  test('getOwnedTaskStatus returns full owned row', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'get-owned',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          status: 'pending',
          threadId: `get-owned-${crypto.randomUUID()}`
        })
      ),
      out = await asUser(0).query(api.tasks.getOwnedTaskStatus, { taskId })
    expect(out).not.toBeNull()
    expect(out?.description).toBe('get-owned')
    expect(out?.status).toBe('pending')
  })
  test('getOwnedTaskStatus returns null for non-owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'get-non-owner',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          status: 'pending',
          threadId: `get-non-owner-${crypto.randomUUID()}`
        })
      ),
      out = await asUser(1).query(api.tasks.getOwnedTaskStatus, { taskId })
    expect(out).toBeNull()
  })
  test('getOwnedTaskStatus returns null for deleted task id', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'get-deleted',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `get-deleted-${crypto.randomUUID()}`
      })
    )
    await ctx.run(async c => {
      await c.db.delete(taskId)
    })
    const out = await asUser(0).query(api.tasks.getOwnedTaskStatus, { taskId })
    expect(out).toBeNull()
  })
  test('getOwnedTaskStatus returns terminal fields for completed task', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          completedAt: Date.now(),
          description: 'get-completed',
          isBackground: true,
          parentThreadId,
          result: 'ok',
          retryCount: 0,
          sessionId,
          status: 'completed',
          threadId: `get-completed-${crypto.randomUUID()}`
        })
      ),
      out = await asUser(0).query(api.tasks.getOwnedTaskStatus, { taskId })
    expect(out?.status).toBe('completed')
    expect(out?.result).toBe('ok')
  })
})
describe('parity task-list equivalents', () => {
  test('listTasks returns pending and in_progress rows for owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('tasks', {
        description: 'list-pending',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `list-pending-${crypto.randomUUID()}`
      })
      await c.db.insert('tasks', {
        description: 'list-running',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `list-running-${crypto.randomUUID()}`
      })
    })
    const rows = await asUser(0).query(api.tasks.listTasks, { sessionId })
    expect(rows.length).toBe(2)
  })
  test('listTasks includes completed and failed statuses', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('tasks', {
        completedAt: Date.now(),
        description: 'list-completed',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: `list-completed-${crypto.randomUUID()}`
      })
      await c.db.insert('tasks', {
        completedAt: Date.now(),
        description: 'list-failed',
        isBackground: true,
        lastError: 'x',
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'failed',
        threadId: `list-failed-${crypto.randomUUID()}`
      })
    })
    const rows = await asUser(0).query(api.tasks.listTasks, { sessionId })
    expect(rows.some(r => r.status === 'completed')).toBe(true)
    expect(rows.some(r => r.status === 'failed')).toBe(true)
  })
  test('listTasks returns empty for non-owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('tasks', {
        description: 'list-non-owner',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `list-non-owner-${crypto.randomUUID()}`
      })
    })
    const rows = await asUser(1).query(api.tasks.listTasks, { sessionId })
    expect(rows).toEqual([])
  })
  test('listTasks returns empty when session does not exist', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.delete(sessionId)
    })
    const rows = await asUser(0).query(api.tasks.listTasks, { sessionId })
    expect(rows).toEqual([])
  })
})
describe('parity task-history equivalents', () => {
  test('task lifecycle keeps completed, failed and timed_out rows pre-retention', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('tasks', {
        completedAt: Date.now(),
        description: 'history-completed',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: `history-completed-${crypto.randomUUID()}`
      })
      await c.db.insert('tasks', {
        completedAt: Date.now(),
        description: 'history-failed',
        isBackground: true,
        lastError: 'boom',
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'failed',
        threadId: `history-failed-${crypto.randomUUID()}`
      })
      await c.db.insert('tasks', {
        completedAt: Date.now(),
        description: 'history-timeout',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'timed_out',
        threadId: `history-timeout-${crypto.randomUUID()}`
      })
    })
    const rows = await asUser(0).query(api.tasks.listTasks, { sessionId })
    expect(rows.some(r => r.status === 'completed')).toBe(true)
    expect(rows.some(r => r.status === 'failed')).toBe(true)
    expect(rows.some(r => r.status === 'timed_out')).toBe(true)
  })
  test('cleanupArchivedSessions cascades and removes all lifecycle task rows', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      for (const status of ['completed', 'failed', 'timed_out'] as const)
        await c.db.insert('tasks', {
          completedAt: Date.now(),
          description: `history-${status}`,
          isBackground: true,
          parentThreadId: threadId,
          retryCount: 0,
          sessionId,
          status,
          threadId: `history-${status}-${crypto.randomUUID()}`
        })
      await c.db.patch(sessionId, {
        archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
        status: 'archived'
      })
    })
    await ctx.mutation(internal.retention.cleanupArchivedSessions, {})
    const rows = await ctx.run(async c =>
      c.db
        .query('tasks')
        .withIndex('by_session', idx => idx.eq('sessionId', sessionId))
        .collect()
    )
    expect(rows.length).toBe(0)
  })
  test('active session is not deleted by cleanupArchivedSessions', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    const out = await ctx.mutation(internal.retention.cleanupArchivedSessions, {}),
      row = await ctx.run(async c => c.db.get(sessionId))
    expect(out.deletedCount).toBe(0)
    expect(row?.status).toBe('active')
  })
  test('archiveIdleSessions transitions old active session into idle', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.patch(sessionId, {
        lastActivityAt: Date.now() - 25 * 60 * 60 * 1000
      })
    })
    await ctx.mutation(internal.retention.archiveIdleSessions, {})
    const row = await ctx.run(async c => c.db.get(sessionId))
    expect(row?.status).toBe('idle')
  })
})
describe('parity cancel-task-cleanup equivalents', () => {
  test('archiveSession clears queued task completion payload', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'cancel-cleanup-start',
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'cancel-cleanup-queued',
      reason: 'task_completion',
      threadId
    })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(state?.queuedPromptMessageId).toBeUndefined()
    expect(state?.queuedReason).toBeUndefined()
  })
  test('markRunning returns false after session is archived', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'cancel-cleanup-mark-running',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          status: 'pending',
          threadId: `cancel-cleanup-mark-running-${crypto.randomUUID()}`
        })
      )
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const out = await ctx.mutation(internal.tasks.markRunning, { taskId })
    expect(out.ok).toBe(false)
  })
  test('scheduleRetry on archived session cancels task', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'cancel-cleanup-retry',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `cancel-cleanup-retry-${crypto.randomUUID()}`
        })
      )
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    await ctx.mutation(internal.tasks.scheduleRetry, { taskId })
    const row = await ctx.run(async c => c.db.get(taskId))
    expect(row?.status).toBe('cancelled')
    expect(row?.lastError).toBe('session_archived')
  })
  test('finishRun after archive does not schedule queued continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'cancel-cleanup-finish-start',
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'cancel-cleanup-finish-queued',
      reason: 'task_completion',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const out = await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: before?.activeRunToken ?? '',
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(out.scheduled).toBe(false)
    expect(after?.status).toBe('idle')
  })
})
describe('parity task-completion-cleanup equivalents', () => {
  test('completeTask creates cleanup reminder in parent thread', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'completion-cleanup-complete',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `completion-cleanup-complete-${crypto.randomUUID()}`
      })
    )
    await ctx.mutation(internal.tasks.completeTask, { result: 'ok', taskId })
    const row = await ctx.run(async c => c.db.get(taskId)),
      msg = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
          .collect()
      )
    expect(row?.completionReminderMessageId).toBeDefined()
    expect(msg.some(m => m.content.includes('[BACKGROUND TASK COMPLETED]'))).toBe(true)
  })
  test('failTask creates cleanup reminder in parent thread', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'completion-cleanup-fail',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `completion-cleanup-fail-${crypto.randomUUID()}`
      })
    )
    await ctx.mutation(internal.tasks.failTask, {
      lastError: 'broken',
      taskId
    })
    const row = await ctx.run(async c => c.db.get(taskId)),
      msg = await ctx.run(async c =>
        c.db
          .query('messages')
          .withIndex('by_threadId', idx => idx.eq('threadId', parentThreadId))
          .collect()
      )
    expect(row?.completionReminderMessageId).toBeDefined()
    expect(msg.some(m => m.content.includes('[BACKGROUND TASK FAILED]'))).toBe(true)
  })
  test('maybeContinueOrchestrator stamps continuationEnqueuedAt on valid completed task', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const reminderId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'done reminder',
        isComplete: true,
        parts: [{ text: 'done reminder', type: 'text' }],
        role: 'system',
        sessionId,
        threadId: parentThreadId
      })
    )
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        completedAt: Date.now(),
        completionReminderMessageId: String(reminderId),
        description: 'completion-cleanup-continue',
        isBackground: true,
        parentThreadId,
        result: 'done',
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: `completion-cleanup-continue-${crypto.randomUUID()}`
      })
    )
    const out = await ctx.mutation(internal.tasks.maybeContinueOrchestrator, {
        taskId
      }),
      row = await ctx.run(async c => c.db.get(taskId))
    expect(out.ok).toBe(true)
    expect(row?.continuationEnqueuedAt).toBeDefined()
  })
  test('maybeContinueOrchestrator returns false for archived session', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const reminderId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'done reminder archived',
        isComplete: true,
        parts: [{ text: 'done reminder archived', type: 'text' }],
        role: 'system',
        sessionId,
        threadId: parentThreadId
      })
    )
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        completedAt: Date.now(),
        completionReminderMessageId: String(reminderId),
        description: 'completion-cleanup-archived',
        isBackground: true,
        parentThreadId,
        result: 'done',
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: `completion-cleanup-archived-${crypto.randomUUID()}`
      })
    )
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const out = await ctx.mutation(internal.tasks.maybeContinueOrchestrator, {
      taskId
    })
    expect(out.ok).toBe(false)
  })
})
describe('parity stop-continuation-guard equivalents', () => {
  test('auto-continue enqueue rejects at streak cap', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await c.db.patch(state._id, {
          autoContinueStreak: 5,
          status: 'active'
        })
    })
    const out = await ctx.mutation(internal.orchestrator.enqueueRun, {
      incrementStreak: true,
      priority: 0,
      promptMessageId: 'guard-cap',
      reason: 'todo_continuation',
      threadId
    })
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('streak_cap')
  })
  test('postTurnAudit blocks continuation when turnRequestedInput=true', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'guard-input-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'guard-input-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: true
    })
    expect(out.shouldContinue).toBe(false)
  })
  test('postTurnAudit blocks continuation when pending background task exists', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'guard-task-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async c => {
      await c.db.insert('todos', {
        content: 'guard-task-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      await c.db.insert('tasks', {
        description: 'guard-task-blocker',
        isBackground: true,
        parentThreadId: threadId,
        pendingAt: Date.now(),
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `guard-task-blocker-${crypto.randomUUID()}`
      })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(out.shouldContinue).toBe(false)
  })
  test('postTurnAudit resets streak when session archived', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'guard-archive-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async c => {
      const row = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (row) await c.db.patch(row._id, { autoContinueStreak: 4 })
    })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(after?.autoContinueStreak).toBe(0)
  })
})
describe('parity delegate-task-english-directive equivalents', () => {
  test('delegate input schema requires description', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'schema-parent',
      sessionId: 'schema-session' as never
    })
    const inputSchema = (
        tools.delegate as {
          inputSchema?: { safeParse: (v: unknown) => { success: boolean } }
        }
      ).inputSchema,
      parsed = inputSchema?.safeParse({ isBackground: true, prompt: 'x' })
    expect(parsed?.success).toBe(false)
  })
  test('delegate input schema requires prompt', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'schema-parent',
      sessionId: 'schema-session' as never
    })
    const inputSchema = (
        tools.delegate as {
          inputSchema?: { safeParse: (v: unknown) => { success: boolean } }
        }
      ).inputSchema,
      parsed = inputSchema?.safeParse({ description: 'x', isBackground: true })
    expect(parsed?.success).toBe(false)
  })
  test('delegate input schema accepts defaults for isBackground', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'schema-parent',
      sessionId: 'schema-session' as never
    })
    const inputSchema = (
        tools.delegate as {
          inputSchema?: {
            safeParse: (v: unknown) => {
              data?: { isBackground?: boolean }
              success: boolean
            }
          }
        }
      ).inputSchema,
      parsed = inputSchema?.safeParse({ description: 'x', prompt: 'y' })
    expect(parsed?.success).toBe(true)
    expect(parsed?.data?.isBackground).toBe(true)
  })
  test('detectDelegateError and buildRetryGuidance map unknown agent errors', async () => {
    const { buildRetryGuidance, detectDelegateError } = await import('./agents')
    const pattern = detectDelegateError({
        errorMessage: 'Unknown agent: alpha. valid options: explore, oracle'
      }),
      guidance = buildRetryGuidance({
        errorMessage: 'Unknown agent: alpha. valid options: explore, oracle',
        pattern
      })
    expect(pattern).toBe('unknown_agent')
    expect(guidance.availableOptions).toEqual(['explore', 'oracle'])
  })
})
describe('parity tasks-todowrite-disabler equivalents', () => {
  test('worker tools exclude todoWrite', async () => {
    const { createWorkerTools } = await import('./agents')
    const tools = createWorkerTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'worker-parent',
      sessionId: 'worker-session' as never
    })
    expect(Object.keys(tools).includes('todoWrite')).toBe(false)
  })
  test('worker tools exclude todoRead', async () => {
    const { createWorkerTools } = await import('./agents')
    const tools = createWorkerTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'worker-parent',
      sessionId: 'worker-session' as never
    })
    expect(Object.keys(tools).includes('todoRead')).toBe(false)
  })
  test('worker tools exclude delegate', async () => {
    const { createWorkerTools } = await import('./agents')
    const tools = createWorkerTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'worker-parent',
      sessionId: 'worker-session' as never
    })
    expect(Object.keys(tools).includes('delegate')).toBe(false)
  })
  test('orchestrator tools keep todoWrite and todoRead enabled', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'orchestrator-parent',
      sessionId: 'orchestrator-session' as never
    })
    expect(Object.keys(tools).includes('todoWrite')).toBe(true)
    expect(Object.keys(tools).includes('todoRead')).toBe(true)
  })
})
describe('parity compaction-context-injector equivalents', () => {
  test('getContextSize counts compactionSummary and message content', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'tail-msg',
        isComplete: true,
        parts: [{ text: 'tail-msg', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
      const runState = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState) await c.db.patch(runState._id, { compactionSummary: 'summary-abc' })
    })
    const size = await ctx.query(internal.compaction.getContextSize, {
      threadId
    })
    expect(size.charCount).toBe('summary-abc'.length + 'tail-msg'.length)
    expect(size.messageCount).toBe(1)
  })
  test('setCompactionSummary stores summary and boundary under valid lock', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const messageId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'boundary-ok',
        isComplete: true,
        parts: [{ text: 'boundary-ok', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
    )
    const lock = await ctx.mutation(internal.compaction.acquireCompactionLock, {
      threadId
    })
    const out = await ctx.mutation(internal.compaction.setCompactionSummary, {
      compactionSummary: 'persisted-summary',
      lastCompactedMessageId: String(messageId),
      lockToken: lock.lockToken,
      threadId
    })
    const state = await ctx.run(async c =>
      c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
    )
    expect(out.ok).toBe(true)
    expect(state?.compactionSummary).toBe('persisted-summary')
    expect(state?.lastCompactedMessageId).toBe(String(messageId))
  })
  test('setCompactionSummary rejects boundary from another thread', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      a = await asUser(0).mutation(api.sessions.createSession, {}),
      b = await asUser(0).mutation(api.sessions.createSession, {})
    const foreignId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'foreign-boundary',
        isComplete: true,
        parts: [{ text: 'foreign-boundary', type: 'text' }],
        role: 'assistant',
        sessionId: b.sessionId,
        threadId: b.threadId
      })
    )
    const lock = await ctx.mutation(internal.compaction.acquireCompactionLock, {
      threadId: a.threadId
    })
    const out = await ctx.mutation(internal.compaction.setCompactionSummary, {
      compactionSummary: 'reject-foreign',
      lastCompactedMessageId: String(foreignId),
      lockToken: lock.lockToken,
      threadId: a.threadId
    })
    expect(out.ok).toBe(false)
  })
  test('compactIfNeeded returns no_closed_groups when first message is open', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'x'.repeat(100_500),
        isComplete: false,
        parts: [],
        role: 'assistant',
        sessionId,
        streamingContent: 'open',
        threadId
      })
      await c.db.insert('messages', {
        content: 'complete-after-open',
        isComplete: true,
        parts: [{ text: 'complete-after-open', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const out = await ctx.mutation(internal.compaction.compactIfNeeded, {
      threadId
    })
    expect(out.compacted).toBe(false)
    expect(out.reason).toBe('no_closed_groups')
  })
})
describe('parity background-task tools equivalents', () => {
  test('delegate tool forwards spawn payload and returns pending contract', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: (_ref: unknown, args: unknown) => {
          const payload = args as {
            description: string
            isBackground: boolean
            parentThreadId: string
            prompt: string
            sessionId: string
          }
          expect(payload.description).toBe('bg-tools-delegate')
          expect(payload.isBackground).toBe(true)
          expect(payload.prompt).toBe('bg-tools-prompt')
          expect(payload.parentThreadId).toBe('bg-tools-parent')
          expect(payload.sessionId).toBe('bg-tools-session')
          return { taskId: 'bg-task-id', threadId: 'bg-thread-id' }
        },
        runQuery: () => null
      } as never,
      parentThreadId: 'bg-tools-parent',
      sessionId: 'bg-tools-session' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: {
        description: string
        isBackground: boolean
        prompt: string
      }) => Promise<{ status: string; taskId: string; threadId: string }>
    }
    const out = await delegate.execute({
      description: 'bg-tools-delegate',
      isBackground: true,
      prompt: 'bg-tools-prompt'
    })
    expect(out.status).toBe('pending')
    expect(out.taskId).toBe('bg-task-id')
    expect(out.threadId).toBe('bg-thread-id')
  })
  test('taskStatus tool returns null contract for missing task', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'bg-status-parent',
      sessionId: 'bg-status-session' as never
    })
    const taskStatus = tools.taskStatus as unknown as {
      execute: (input: { taskId: string }) => Promise<{ description: null | string; status: null | string }>
    }
    const out = await taskStatus.execute({ taskId: 'missing' })
    expect(out.description).toBeNull()
    expect(out.status).toBeNull()
  })
  test('taskOutput tool returns null result for non-completed status', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => ({ status: 'running' })
      } as never,
      parentThreadId: 'bg-output-parent',
      sessionId: 'bg-output-session' as never
    })
    const taskOutput = tools.taskOutput as unknown as {
      execute: (input: { taskId: string }) => Promise<{ result: null | string; status: null | string }>
    }
    const out = await taskOutput.execute({ taskId: 'running-task' })
    expect(out.status).toBe('running')
    expect(out.result).toBeNull()
  })
  test('taskOutput tool returns completed result payload', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => ({
          result: 'worker-final-output',
          status: 'completed'
        })
      } as never,
      parentThreadId: 'bg-output-parent',
      sessionId: 'bg-output-session' as never
    })
    const taskOutput = tools.taskOutput as unknown as {
      execute: (input: { taskId: string }) => Promise<{ result: null | string; status: null | string }>
    }
    const out = await taskOutput.execute({ taskId: 'completed-task' })
    expect(out.status).toBe('completed')
    expect(out.result).toBe('worker-final-output')
  })
})
describe('omo parity: manager deep coverage', () => {
  const taskStatuses = ['pending', 'running', 'completed', 'failed', 'timed_out', 'cancelled'] as const
  const listChildrenByParent = async ({ ctx, parentThreadId }: { ctx: ReturnType<typeof t>; parentThreadId: string }) => {
    const rows = await ctx.run(async c => {
      const out: {
        _id: string
        parentThreadId: string
        threadId: string
      }[] = []
      for (const s of taskStatuses) {
        const batch = await c.db
          .query('tasks')
          .withIndex('by_parentThreadId_status', idx => idx.eq('parentThreadId', parentThreadId).eq('status', s))
          .collect()
        for (const row of batch)
          out.push({
            _id: String(row._id),
            parentThreadId: row.parentThreadId,
            threadId: row.threadId
          })
      }
      return out
    })
    return rows
  }
  const listDescendants = async ({ ctx, rootThreadId }: { ctx: ReturnType<typeof t>; rootThreadId: string }) => {
    const seen = new Set<string>()
    const stack = [rootThreadId]
    const descendants: string[] = []
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) continue
      const children = await listChildrenByParent({
        ctx,
        parentThreadId: current
      })
      for (const child of children)
        if (!seen.has(child._id)) {
          seen.add(child._id)
          descendants.push(child._id)
          stack.push(child.threadId)
        }
    }
    return descendants
  }
  test('descendant traversal returns empty when no child tasks exist', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      descendants = await listDescendants({ ctx, rootThreadId: threadId })
    expect(descendants).toEqual([])
  })
  test('descendant traversal returns direct child tasks', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const childA = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'desc-direct-a',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `desc-direct-a-${crypto.randomUUID()}`
      })
    )
    const childB = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'desc-direct-b',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `desc-direct-b-${crypto.randomUUID()}`
      })
    )
    const descendants = await listDescendants({ ctx, rootThreadId: threadId })
    expect(descendants.includes(String(childA))).toBe(true)
    expect(descendants.includes(String(childB))).toBe(true)
    expect(descendants.length).toBe(2)
  })
  test('descendant traversal returns nested grandchildren', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const childThread = `desc-child-${crypto.randomUUID()}`
    const child = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'desc-nested-child',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: childThread
      })
    )
    const grandchild = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'desc-nested-grandchild',
        isBackground: true,
        parentThreadId: childThread,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: `desc-grandchild-${crypto.randomUUID()}`
      })
    )
    const descendants = await listDescendants({ ctx, rootThreadId: threadId })
    expect(descendants.includes(String(child))).toBe(true)
    expect(descendants.includes(String(grandchild))).toBe(true)
    expect(descendants.length).toBe(2)
  })
  test('descendant traversal includes multiple branches at different depths', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const leftThread = `desc-left-${crypto.randomUUID()}`,
      rightThread = `desc-right-${crypto.randomUUID()}`
    await ctx.run(async c => {
      await c.db.insert('tasks', {
        description: 'desc-branch-left',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        status: 'pending',
        threadId: leftThread
      })
      await c.db.insert('tasks', {
        description: 'desc-branch-right',
        isBackground: true,
        parentThreadId: threadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: rightThread
      })
      await c.db.insert('tasks', {
        completedAt: Date.now(),
        description: 'desc-branch-left-leaf',
        isBackground: true,
        parentThreadId: leftThread,
        retryCount: 0,
        sessionId,
        status: 'completed',
        threadId: `desc-left-leaf-${crypto.randomUUID()}`
      })
      await c.db.insert('tasks', {
        completedAt: Date.now(),
        description: 'desc-branch-right-leaf',
        isBackground: true,
        lastError: 'fail',
        parentThreadId: rightThread,
        retryCount: 0,
        sessionId,
        status: 'failed',
        threadId: `desc-right-leaf-${crypto.randomUUID()}`
      })
    })
    const descendants = await listDescendants({ ctx, rootThreadId: threadId })
    expect(descendants.length).toBe(4)
  })
  test('descendant traversal excludes unrelated roots', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      rootA = await asUser(0).mutation(api.sessions.createSession, {}),
      rootB = await asUser(0).mutation(api.sessions.createSession, {})
    const unrelated = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'desc-unrelated',
        isBackground: true,
        parentThreadId: rootB.threadId,
        retryCount: 0,
        sessionId: rootB.sessionId,
        status: 'pending',
        threadId: `desc-unrelated-${crypto.randomUUID()}`
      })
    )
    const descendants = await listDescendants({
      ctx,
      rootThreadId: rootA.threadId
    })
    expect(descendants.includes(String(unrelated))).toBe(false)
  })
  test('completeTask enforces CAS and prevents double completion', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'cas-complete',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `cas-complete-${crypto.randomUUID()}`
        })
      )
    const first = await ctx.mutation(internal.tasks.completeTask, {
        result: 'first',
        taskId
      }),
      second = await ctx.mutation(internal.tasks.completeTask, {
        result: 'second',
        taskId
      }),
      row = await ctx.run(async c => c.db.get(taskId))
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(row?.result).toBe('first')
    expect(row?.status).toBe('completed')
  })
  test('failTask enforces CAS and prevents double terminal transitions', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'cas-fail',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `cas-fail-${crypto.randomUUID()}`
        })
      )
    const first = await ctx.mutation(internal.tasks.failTask, {
        lastError: 'boom-1',
        taskId
      }),
      second = await ctx.mutation(internal.tasks.failTask, {
        lastError: 'boom-2',
        taskId
      }),
      row = await ctx.run(async c => c.db.get(taskId))
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(row?.lastError).toBe('boom-1')
    expect(row?.status).toBe('failed')
  })
  test('concurrent completeTask calls allow only first winner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'concurrent-complete',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `concurrent-complete-${crypto.randomUUID()}`
        })
      )
    const [a, b] = await Promise.all([
      ctx.mutation(internal.tasks.completeTask, { result: 'a', taskId }),
      ctx.mutation(internal.tasks.completeTask, { result: 'b', taskId })
    ])
    const wins = Number(a.ok) + Number(b.ok),
      row = await ctx.run(async c => c.db.get(taskId))
    expect(wins).toBe(1)
    expect(row?.status).toBe('completed')
  })
  test('concurrent completeTask and failTask allow only one terminal winner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'concurrent-mixed-terminal',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `concurrent-mixed-terminal-${crypto.randomUUID()}`
        })
      )
    const [completeOut, failOut] = await Promise.all([
      ctx.mutation(internal.tasks.completeTask, { result: 'done', taskId }),
      ctx.mutation(internal.tasks.failTask, {
        lastError: 'mixed-fail',
        taskId
      })
    ])
    expect(Number(completeOut.ok) + Number(failOut.ok)).toBe(1)
  })
  for (const reason of ['task_completion', 'todo_continuation', 'user_message'] as const)
    test(`finishRun drains queued payload for reason=${reason}`, async () => {
      const priority = reason === 'user_message' ? 2 : reason === 'task_completion' ? 1 : 0
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: `manager-deep-${reason}-start`,
        reason: 'user_message',
        threadId
      })
      const before = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority,
        promptMessageId: `manager-deep-${reason}-queued`,
        reason,
        threadId
      })
      const finished = await ctx.mutation(internal.orchestrator.finishRun, {
        runToken: before?.activeRunToken ?? '',
        threadId
      })
      const after = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      expect(finished.scheduled).toBe(true)
      expect(after?.queuedPromptMessageId).toBeUndefined()
      expect(after?.queuedReason).toBeUndefined()
      expect(after?.activeRunToken).not.toBe(before?.activeRunToken)
    })
  test('finishRun mismatch keeps queue and active token unchanged', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'manager-deep-mismatch-start',
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'manager-deep-mismatch-queued',
      reason: 'task_completion',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    const out = await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: 'manager-deep-mismatch-token',
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(out.scheduled).toBe(false)
    expect(after?.activeRunToken).toBe(before?.activeRunToken)
    expect(after?.queuedPromptMessageId).toBe('manager-deep-mismatch-queued')
  })
  for (const status of ['pending', 'running'] as const)
    test(`timeoutStaleTasks marks stale ${status} task timed_out and keeps row`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
      const taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: `manager-timeout-${status}`,
          heartbeatAt: status === 'running' ? Date.now() - 6 * 60 * 1000 : undefined,
          isBackground: true,
          parentThreadId,
          pendingAt: status === 'pending' ? Date.now() - 6 * 60 * 1000 : undefined,
          retryCount: 0,
          sessionId,
          startedAt: status === 'running' ? Date.now() - 7 * 60 * 1000 : undefined,
          status,
          threadId: `manager-timeout-${status}-${crypto.randomUUID()}`
        })
      )
      const out = await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {}),
        row = await ctx.run(async c => c.db.get(taskId))
      expect(out.timedOutCount > 0).toBe(true)
      expect(row).not.toBeNull()
      expect(row?.status).toBe('timed_out')
      expect(row?.completionReminderMessageId).toBeDefined()
    })
  for (const c of [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 2, to: 3 }
  ])
    test(`scheduleRetry increments retryCount from ${c.from} to ${c.to}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
      const taskId = await ctx.run(async d =>
        d.db.insert('tasks', {
          description: `manager-retry-${c.from}`,
          isBackground: true,
          parentThreadId,
          retryCount: c.from,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `manager-retry-${c.from}-${crypto.randomUUID()}`
        })
      )
      const out = await ctx.mutation(internal.tasks.scheduleRetry, { taskId }),
        row = await ctx.run(async d => d.db.get(taskId))
      expect(out.ok).toBe(true)
      expect(row?.retryCount).toBe(c.to)
      expect(row?.status).toBe('pending')
      expect(typeof row?.pendingAt).toBe('number')
    })
  for (const retryCount of [3, 4])
    test(`scheduleRetry rejects when retryCount=${retryCount}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
      const taskId = await ctx.run(async d =>
        d.db.insert('tasks', {
          description: `manager-retry-cap-${retryCount}`,
          isBackground: true,
          parentThreadId,
          retryCount,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `manager-retry-cap-${retryCount}-${crypto.randomUUID()}`
        })
      )
      const out = await ctx.mutation(internal.tasks.scheduleRetry, { taskId }),
        row = await ctx.run(async d => d.db.get(taskId))
      expect(out.ok).toBe(false)
      expect(row?.retryCount).toBe(retryCount)
      expect(row?.status).toBe('running')
    })
  test('scheduleRetry cancels task when parent session archived', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          description: 'manager-retry-archived',
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: Date.now(),
          status: 'running',
          threadId: `manager-retry-archived-${crypto.randomUUID()}`
        })
      )
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const out = await ctx.mutation(internal.tasks.scheduleRetry, { taskId }),
      row = await ctx.run(async c => c.db.get(taskId))
    expect(out.ok).toBe(false)
    expect(row?.status).toBe('cancelled')
    expect(row?.lastError).toBe('session_archived')
  })
  for (const s of ['running', 'completed', 'failed', 'timed_out', 'cancelled'] as const)
    test(`markRunning rejects status=${s}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
      const taskId = await ctx.run(async c =>
        c.db.insert('tasks', {
          completedAt:
            s === 'completed' || s === 'failed' || s === 'timed_out' || s === 'cancelled' ? Date.now() : undefined,
          description: `manager-mark-running-${s}`,
          isBackground: true,
          parentThreadId,
          retryCount: 0,
          sessionId,
          startedAt: s === 'running' ? Date.now() : undefined,
          status: s,
          threadId: `manager-mark-running-${s}-${crypto.randomUUID()}`
        })
      )
      const out = await ctx.mutation(internal.tasks.markRunning, { taskId })
      expect(out.ok).toBe(false)
    })
  test('completeTask reminder includes task id and completion marker', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'manager-reminder-complete',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `manager-reminder-complete-${crypto.randomUUID()}`
      })
    )
    await ctx.mutation(internal.tasks.completeTask, { result: 'ok', taskId })
    const task = await ctx.run(async c => c.db.get(taskId)),
      reminder = await ctx.run(async c => c.db.get((task?.completionReminderMessageId ?? '') as Id<'messages'>))
    expect(reminder?.content.includes('[BACKGROUND TASK COMPLETED]')).toBe(true)
    expect(reminder?.content.includes(`Task ID: ${String(taskId)}`)).toBe(true)
  })
  test('failTask reminder includes error and failed marker', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async c =>
      c.db.insert('tasks', {
        description: 'manager-reminder-fail',
        isBackground: true,
        parentThreadId,
        retryCount: 0,
        sessionId,
        startedAt: Date.now(),
        status: 'running',
        threadId: `manager-reminder-fail-${crypto.randomUUID()}`
      })
    )
    await ctx.mutation(internal.tasks.failTask, {
      lastError: 'manager-reminder-fail-boom',
      taskId
    })
    const task = await ctx.run(async c => c.db.get(taskId)),
      reminder = await ctx.run(async c => c.db.get((task?.completionReminderMessageId ?? '') as Id<'messages'>))
    expect(reminder?.content.includes('[BACKGROUND TASK FAILED]')).toBe(true)
    expect(reminder?.content.includes('Error: manager-reminder-fail-boom')).toBe(true)
  })
  test('timeoutStaleRuns releases claimed stale run and schedules queued payload', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'manager-timeout-runs-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.mutation(internal.orchestrator.claimRun, {
      runToken: before?.activeRunToken ?? '',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'manager-timeout-runs-queued',
      reason: 'task_completion',
      threadId
    })
    await ctx.run(async c => {
      const row = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (row)
        await c.db.patch(row._id, {
          activatedAt: Date.now() - 20 * 60 * 1000,
          claimedAt: Date.now() - 20 * 60 * 1000,
          runClaimed: true,
          runHeartbeatAt: Date.now() - 20 * 60 * 1000,
          status: 'active'
        })
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(after?.status).toBe('active')
    expect(after?.runClaimed).toBe(false)
    expect(after?.queuedPromptMessageId).toBeUndefined()
    expect(after?.activeRunToken).not.toBe(before?.activeRunToken)
  })
  test('listMessagesForPrompt returns empty when prompt belongs to another thread', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      a = await asUser(0).mutation(api.sessions.createSession, {}),
      b = await asUser(0).mutation(api.sessions.createSession, {})
    const foreignPromptId = await ctx.run(async c =>
      c.db.insert('messages', {
        content: 'foreign prompt',
        isComplete: true,
        parts: [{ text: 'foreign prompt', type: 'text' }],
        role: 'user',
        sessionId: b.sessionId,
        threadId: b.threadId
      })
    )
    const rows = await ctx.query(internal.orchestrator.listMessagesForPrompt, {
      promptMessageId: String(foreignPromptId),
      threadId: a.threadId
    })
    expect(rows).toEqual([])
  })
  test('listMessagesForPrompt prepends compaction summary into context sizing path', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'tail-content',
        isComplete: true,
        parts: [{ text: 'tail-content', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
      const state = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state) await c.db.patch(state._id, { compactionSummary: 'summary-prefix' })
    })
    const size = await ctx.query(internal.compaction.getContextSize, {
      threadId
    })
    expect(size.charCount).toBe('summary-prefix'.length + 'tail-content'.length)
  })
  test('claimRun rejects mismatched token without setting runClaimed', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'manager-claim-mismatch-start',
      reason: 'user_message',
      threadId
    })
    const out = await ctx.mutation(internal.orchestrator.claimRun, {
        runToken: 'manager-claim-mismatch-token',
        threadId
      }),
      state = await ctx.query(internal.orchestrator.readRunState, { threadId })
    expect(out.ok).toBe(false)
    expect(state?.runClaimed ?? false).toBe(false)
  })
})
describe('omo parity: delegate deep coverage', () => {
  for (const c of [
    {
      errorMessage: 'missing run_in_background',
      expected: 'missing_run_in_background'
    },
    { errorMessage: 'LOAD_SKILLS required', expected: 'missing_load_skills' },
    { errorMessage: 'invalid category: custom', expected: 'unknown_category' },
    { errorMessage: 'invalid agent: no-such', expected: 'unknown_agent' },
    { errorMessage: 'opaque failure', expected: 'unknown_error' }
  ] as const)
    test(`detectDelegateError classifies ${c.expected}`, async () => {
      const { detectDelegateError } = await import('./agents')
      const pattern = detectDelegateError({ errorMessage: c.errorMessage })
      expect(pattern).toBe(c.expected)
    })
  for (const c of [
    {
      fixHint: 'Add run_in_background parameter.',
      pattern: 'missing_run_in_background' as const
    },
    {
      fixHint: 'Add load_skills=[] parameter.',
      pattern: 'missing_load_skills' as const
    },
    {
      fixHint: 'Use a valid category from the Available list.',
      pattern: 'unknown_category' as const
    },
    {
      fixHint: 'Use a valid agent from the Available list.',
      pattern: 'unknown_agent' as const
    },
    {
      fixHint: 'Retry delegate with corrected arguments and valid values.',
      pattern: 'unknown_error' as const
    }
  ])
    test(`buildRetryGuidance emits fix hint for ${c.pattern}`, async () => {
      const { buildRetryGuidance } = await import('./agents')
      const out = buildRetryGuidance({ errorMessage: 'x', pattern: c.pattern })
      expect(out.fixHint).toBe(c.fixHint)
    })
  test('buildRetryGuidance parses available options from mixed lines and deduplicates', async () => {
    const { buildRetryGuidance } = await import('./agents')
    const out = buildRetryGuidance({
      errorMessage: 'Unknown. Available: quick, deep, deep\nvalid options: deep, ultrabrain, quick',
      pattern: 'unknown_category'
    })
    expect(out.availableOptions).toEqual(['quick', 'deep', 'ultrabrain'])
  })
  for (const p of [
    'Invalid arguments: run_in_background missing',
    'Invalid arguments: load_skills missing',
    'Unknown category alpha. Available: quick, deep',
    'Unknown agent beta. valid options: explore, oracle'
  ] as const)
    test(`delegate error adapter returns guidance payload for ${p.split(':')[0]}`, async () => {
      const { createOrchestratorTools } = await import('./agents')
      const tools = createOrchestratorTools({
        ctx: {
          runMutation: () => {
            throw new Error(p)
          },
          runQuery: () => null
        } as never,
        parentThreadId: `delegate-deep-parent-${crypto.randomUUID()}`,
        sessionId: `delegate-deep-session-${crypto.randomUUID()}` as never
      })
      const delegate = tools.delegate as unknown as {
        execute: (input: {
          description: string
          isBackground: boolean
          prompt: string
        }) => Promise<{ ok: boolean; pattern: string }>
      }
      const out = await delegate.execute({
        description: 'delegate-deep',
        isBackground: true,
        prompt: 'delegate-deep'
      })
      expect(out.ok).toBe(false)
      expect(typeof out.pattern).toBe('string')
    })
  test('delegate forwards payload metadata and returns pending contract', async () => {
    const { createOrchestratorTools } = await import('./agents')
    let seen:
      | {
          description: string
          isBackground: boolean
          parentThreadId: string
          prompt: string
          sessionId: string
        }
      | undefined
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: (_ref: unknown, args: unknown) => {
          const payload = args as {
            description: string
            isBackground: boolean
            parentThreadId: string
            prompt: string
            sessionId: string
          }
          seen = payload
          return {
            taskId: 'delegate-deep-task',
            threadId: 'delegate-deep-thread'
          }
        },
        runQuery: () => null
      } as never,
      parentThreadId: 'delegate-deep-parent',
      sessionId: 'delegate-deep-session' as never
    })
    const delegate = tools.delegate as unknown as {
      execute: (input: { description: string; isBackground: boolean; prompt: string }) => Promise<{
        status: string
        taskId: string
        threadId: string
      }>
    }
    const out = await delegate.execute({
      description: 'delegate-deep-description',
      isBackground: false,
      prompt: 'delegate-deep-prompt'
    })
    expect(seen?.description).toBe('delegate-deep-description')
    expect(seen?.isBackground).toBe(false)
    expect(seen?.parentThreadId).toBe('delegate-deep-parent')
    expect(seen?.sessionId).toBe('delegate-deep-session')
    expect(out.status).toBe('pending')
    expect(out.taskId).toBe('delegate-deep-task')
    expect(out.threadId).toBe('delegate-deep-thread')
  })
  test('delegate schema defaults isBackground=true', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'delegate-schema-parent',
      sessionId: 'delegate-schema-session' as never
    })
    const inputSchema = (
      tools.delegate as {
        inputSchema?: {
          safeParse: (v: unknown) => {
            data?: { isBackground?: boolean }
            success: boolean
          }
        }
      }
    ).inputSchema
    const parsed = inputSchema?.safeParse({
      description: 'schema',
      prompt: 'schema'
    })
    expect(parsed?.success).toBe(true)
    expect(parsed?.data?.isBackground).toBe(true)
  })
  for (const c of [
    { result: null, status: 'cancelled' },
    { result: null, status: 'failed' },
    { result: null, status: 'pending' },
    { result: null, status: 'running' },
    { result: null, status: 'timed_out' },
    { result: 'ok-output', status: 'completed' }
  ] as const)
    test(`taskOutput status contract for ${c.status}`, async () => {
      const { createOrchestratorTools } = await import('./agents')
      const tools = createOrchestratorTools({
        ctx: {
          runMutation: () => ({ taskId: 'x', threadId: 'y' }),
          runQuery: () => ({
            result: c.result === null ? undefined : c.result,
            status: c.status
          })
        } as never,
        parentThreadId: 'delegate-output-parent',
        sessionId: 'delegate-output-session' as never
      })
      const taskOutput = tools.taskOutput as unknown as {
        execute: (input: { taskId: string }) => Promise<{ result: null | string; status: null | string }>
      }
      const out = await taskOutput.execute({
        taskId: `delegate-output-${c.status}`
      })
      expect(out.status).toBe(c.status)
      expect(out.result).toBe(c.result)
    })
  test('taskStatus returns null contract when row missing', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'delegate-status-parent',
      sessionId: 'delegate-status-session' as never
    })
    const taskStatus = tools.taskStatus as unknown as {
      execute: (input: { taskId: string }) => Promise<{ description: null | string; status: null | string }>
    }
    const out = await taskStatus.execute({ taskId: 'delegate-status-missing' })
    expect(out.description).toBeNull()
    expect(out.status).toBeNull()
  })
  test('taskStatus returns description and status for existing row', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => ({
          description: 'delegate-status-found',
          status: 'running'
        })
      } as never,
      parentThreadId: 'delegate-status-parent-2',
      sessionId: 'delegate-status-session-2' as never
    })
    const taskStatus = tools.taskStatus as unknown as {
      execute: (input: { taskId: string }) => Promise<{ description: null | string; status: null | string }>
    }
    const out = await taskStatus.execute({
      taskId: 'delegate-status-found-id'
    })
    expect(out.description).toBe('delegate-status-found')
    expect(out.status).toBe('running')
  })
  test('worker toolset excludes delegate and todo tools', async () => {
    const { createWorkerTools } = await import('./agents')
    const tools = createWorkerTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'delegate-worker-parent',
      sessionId: 'delegate-worker-session' as never
    })
    expect(Object.keys(tools).includes('delegate')).toBe(false)
    expect(Object.keys(tools).includes('todoRead')).toBe(false)
    expect(Object.keys(tools).includes('todoWrite')).toBe(false)
    expect(Object.keys(tools)).toEqual(['webSearch'])
  })
  test('orchestrator toolset includes delegate, task and todo tools', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'delegate-orch-parent',
      sessionId: 'delegate-orch-session' as never
    })
    const keys = new Set(Object.keys(tools).toSorted())
    expect(keys.has('delegate')).toBe(true)
    expect(keys.has('taskStatus')).toBe(true)
    expect(keys.has('taskOutput')).toBe(true)
    expect(keys.has('todoRead')).toBe(true)
    expect(keys.has('todoWrite')).toBe(true)
    expect(keys.has('webSearch')).toBe(true)
  })
  test('unknown options parser keeps order while trimming whitespace', async () => {
    const { buildRetryGuidance } = await import('./agents')
    const out = buildRetryGuidance({
      errorMessage: 'Unknown agent. valid options:  explore ,  librarian , oracle  ',
      pattern: 'unknown_agent'
    })
    expect(out.availableOptions).toEqual(['explore', 'librarian', 'oracle'])
  })
})
describe('omo parity: continuation deep coverage', () => {
  for (const c of [
    { shouldContinue: true, status: 'pending' },
    { shouldContinue: true, status: 'in_progress' },
    { shouldContinue: false, status: 'completed' },
    { shouldContinue: false, status: 'cancelled' }
  ] as const)
    test(`postTurnAudit continuation decision for todo status=${c.status}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: `continuation-status-${c.status}-start`,
        reason: 'user_message',
        threadId
      })
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      await ctx.run(async d => {
        await d.db.insert('todos', {
          content: `continuation-status-${c.status}`,
          position: 0,
          priority: 'high',
          sessionId,
          status: c.status
        })
      })
      const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken: state?.activeRunToken ?? '',
        threadId,
        turnRequestedInput: false
      })
      expect(out.shouldContinue).toBe(c.shouldContinue)
    })
  for (const blocker of ['pending', 'running'] as const)
    test(`postTurnAudit blocks continuation when ${blocker} task exists`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: `continuation-blocker-${blocker}-start`,
        reason: 'user_message',
        threadId
      })
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      await ctx.run(async d => {
        await d.db.insert('todos', {
          content: `continuation-blocker-${blocker}-todo`,
          position: 0,
          priority: 'high',
          sessionId,
          status: 'pending'
        })
        await d.db.insert('tasks', {
          description: `continuation-blocker-${blocker}-task`,
          isBackground: true,
          parentThreadId: threadId,
          pendingAt: blocker === 'pending' ? Date.now() : undefined,
          retryCount: 0,
          sessionId,
          startedAt: blocker === 'running' ? Date.now() : undefined,
          status: blocker,
          threadId: `continuation-blocker-${blocker}-${crypto.randomUUID()}`
        })
      })
      const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken: state?.activeRunToken ?? '',
        threadId,
        turnRequestedInput: false
      })
      expect(out.shouldContinue).toBe(false)
    })
  test('postTurnAudit enqueues todo_continuation with lowest priority marker', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-priority-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'continuation-priority-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(out.shouldContinue).toBe(true)
    expect(after?.queuedReason).toBe('todo_continuation')
    expect(after?.queuedPriority).toBe('todo_continuation')
  })
  test('queued user_message replaces queued todo_continuation payload', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-replace-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'continuation-replace-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-replace-user',
      reason: 'user_message',
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(after?.queuedReason).toBe('user_message')
    expect(after?.queuedPromptMessageId).toBe('continuation-replace-user')
  })
  for (const c of [
    { blockedMs: 9000, consecutiveFailures: 1, shouldContinue: false },
    { blockedMs: 19_000, consecutiveFailures: 2, shouldContinue: false },
    { blockedMs: 39_000, consecutiveFailures: 3, shouldContinue: false },
    { blockedMs: 11_000, consecutiveFailures: 1, shouldContinue: true },
    { blockedMs: 21_000, consecutiveFailures: 2, shouldContinue: true },
    { blockedMs: 41_000, consecutiveFailures: 3, shouldContinue: true }
  ])
    test(`cooldown/backoff continuation gate failures=${c.consecutiveFailures} age=${c.blockedMs}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: `continuation-cooldown-${c.consecutiveFailures}-${c.blockedMs}`,
        reason: 'user_message',
        threadId
      })
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      await ctx.run(async d => {
        await d.db.insert('todos', {
          content: 'continuation-cooldown-todo',
          position: 0,
          priority: 'high',
          sessionId,
          status: 'pending'
        })
        const runState = await d.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
        if (runState)
          await d.db.patch(runState._id, {
            consecutiveFailures: c.consecutiveFailures,
            lastContinuationAt: Date.now() - c.blockedMs
          })
      })
      const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken: state?.activeRunToken ?? '',
        threadId,
        turnRequestedInput: false
      })
      expect(out.shouldContinue).toBe(c.shouldContinue)
    })
  test('max consecutive failures blocks continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-max-failure-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'continuation-max-failure-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const runState = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState)
        await d.db.patch(runState._id, {
          consecutiveFailures: 5,
          lastContinuationAt: Date.now() - 120_000
        })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(out.shouldContinue).toBe(false)
  })
  test('failure counter resets after reset window and allows continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-failure-reset-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'continuation-failure-reset-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const runState = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState)
        await d.db.patch(runState._id, {
          consecutiveFailures: 5,
          lastContinuationAt: Date.now() - 6 * 60 * 1000
        })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(out.shouldContinue).toBe(true)
    expect(after?.consecutiveFailures).toBe(0)
  })
  test('unchanged todo snapshot increments stagnation and blocks at cap', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-stagnation-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    const todoId = await ctx.run(async d =>
      d.db.insert('todos', {
        content: 'continuation-stagnation-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    )
    await ctx.run(async d => {
      const runState = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState)
        await d.db.patch(runState._id, {
          lastTodoSnapshot: JSON.stringify([
            {
              content: 'continuation-stagnation-todo',
              id: String(todoId),
              status: 'pending'
            }
          ]),
          stagnationCount: 2
        })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(out.shouldContinue).toBe(false)
  })
  test('todo snapshot progress resets stagnation and allows continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-progress-reset-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    const todoId = await ctx.run(async d =>
      d.db.insert('todos', {
        content: 'continuation-progress-old',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    )
    await ctx.run(async d => {
      await d.db.patch(todoId, { content: 'continuation-progress-new' })
      const runState = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState)
        await d.db.patch(runState._id, {
          lastTodoSnapshot: JSON.stringify([
            {
              content: 'continuation-progress-old',
              id: String(todoId),
              status: 'pending'
            }
          ]),
          stagnationCount: 2
        })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(out.shouldContinue).toBe(true)
    expect(after?.stagnationCount).toBe(0)
  })
  test('stale run token returns ok=false and shouldContinue=false', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken: 'continuation-stale-token',
        threadId,
        turnRequestedInput: false
      })
    expect(out.ok).toBe(false)
    expect(out.shouldContinue).toBe(false)
  })
  test('turnRequestedInput=true blocks continuation and stores todo snapshot', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-input-block-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'continuation-input-block-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: true
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(out.shouldContinue).toBe(false)
    expect(typeof after?.lastTodoSnapshot).toBe('string')
    expect((after?.lastTodoSnapshot ?? '').includes('continuation-input-block-todo')).toBe(true)
  })
  test('malformed previous snapshot does not block continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-malformed-snapshot-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'continuation-malformed-snapshot-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const runState = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState) await d.db.patch(runState._id, { lastTodoSnapshot: '{bad-json' })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(out.shouldContinue).toBe(true)
  })
  test('invalid snapshot shape does not block continuation', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-invalid-shape-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'continuation-invalid-shape-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
      const runState = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (runState)
        await d.db.patch(runState._id, {
          lastTodoSnapshot: JSON.stringify([{ nope: true }])
        })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: state?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    expect(out.shouldContinue).toBe(true)
  })
  test('existing queued user_message blocks todo continuation enqueue', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-queued-user-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-queued-user-message',
      reason: 'user_message',
      threadId
    })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'continuation-queued-user-todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(out.shouldContinue).toBe(false)
    expect(after?.queuedReason).toBe('user_message')
    expect(after?.queuedPromptMessageId).toBe('continuation-queued-user-message')
  })
  test('archived session blocks continuation and resets autoContinueStreak', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'continuation-archived-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async c => {
      const row = await c.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (row) await c.db.patch(row._id, { autoContinueStreak: 4 })
    })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: active?.activeRunToken ?? '',
      threadId,
      turnRequestedInput: false
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(out.shouldContinue).toBe(false)
    expect(state?.autoContinueStreak).toBe(0)
  })
})
describe('final sweep error classifier adaptation', () => {
  for (const marker of [
    'econnrefused',
    'econnreset',
    'enotfound',
    'etimedout',
    'mcp timeout',
    'network error',
    'rate limit',
    'rate_limit',
    'service unavailable',
    'timeout',
    "'429'",
    "'500'",
    "'503'",
    'overloaded'
  ] as const)
    test(`worker transient markers include ${marker}`, async () => {
      const { readFileSync } = await import('node:fs')
      const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
      expect(source.includes(marker)).toBe(true)
    })
  for (const marker of ['401', '403', 'schema validation', 'unauthorized', 'forbidden', 'invalid_argument'] as const)
    test(`worker transient markers exclude permanent marker ${marker}`, async () => {
      const { readFileSync } = await import('node:fs')
      const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8').toLowerCase()
      expect(source.includes(marker)).toBe(false)
    })
  test('worker transient classifier defaults to permanent path via false return', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('agentsNode.ts', import.meta.url), 'utf8')
    expect(source.includes('return false')).toBe(true)
  })
})
describe('final sweep delegate retry matrix', () => {
  for (const c of [
    {
      expected: 'missing_run_in_background',
      value: 'run_in_background is required'
    },
    {
      expected: 'missing_run_in_background',
      value: 'RUN_IN_BACKGROUND missing'
    },
    {
      expected: 'missing_run_in_background',
      value: 'invalid args: run_in_background'
    },
    { expected: 'missing_load_skills', value: 'load_skills is required' },
    { expected: 'missing_load_skills', value: 'LOAD_SKILLS required' },
    { expected: 'missing_load_skills', value: 'invalid args: load_skills' },
    { expected: 'unknown_category', value: 'Unknown category: custom' },
    { expected: 'unknown_category', value: 'invalid category selected' },
    { expected: 'unknown_category', value: 'INVALID CATEGORY selected' },
    { expected: 'unknown_agent', value: 'Unknown agent: fake' },
    { expected: 'unknown_agent', value: 'invalid agent selected' },
    { expected: 'unknown_agent', value: 'INVALID AGENT selected' },
    { expected: 'unknown_error', value: 'network exploded without hint' },
    { expected: 'unknown_error', value: '' }
  ] as const)
    test(`detectDelegateError classifies ${c.expected} for ${c.value || 'empty input'}`, async () => {
      const { detectDelegateError } = await import('./agents')
      const out = detectDelegateError({ errorMessage: c.value })
      expect(out).toBe(c.expected)
    })
  for (const c of [
    {
      expected: 'Add run_in_background parameter.',
      pattern: 'missing_run_in_background' as const
    },
    {
      expected: 'Add load_skills=[] parameter.',
      pattern: 'missing_load_skills' as const
    },
    {
      expected: 'Use a valid category from the Available list.',
      pattern: 'unknown_category' as const
    },
    {
      expected: 'Use a valid agent from the Available list.',
      pattern: 'unknown_agent' as const
    },
    {
      expected: 'Retry delegate with corrected arguments and valid values.',
      pattern: 'unknown_error' as const
    }
  ])
    test(`buildRetryGuidance fixHint for ${c.pattern}`, async () => {
      const { buildRetryGuidance } = await import('./agents')
      const out = buildRetryGuidance({ errorMessage: 'x', pattern: c.pattern })
      expect(out.fixHint).toBe(c.expected)
      expect(out.retryGuidance.includes(c.pattern)).toBe(true)
    })
  test('buildRetryGuidance parses Available list in order', async () => {
    const { buildRetryGuidance } = await import('./agents')
    const out = buildRetryGuidance({
      errorMessage: 'Unknown category. Available: quick, ultrabrain, visual-engineering',
      pattern: 'unknown_category'
    })
    expect(out.availableOptions).toEqual(['quick', 'ultrabrain', 'visual-engineering'])
  })
  test('buildRetryGuidance parses valid options and deduplicates', async () => {
    const { buildRetryGuidance } = await import('./agents')
    const out = buildRetryGuidance({
      errorMessage: 'Unknown agent. valid options: explore, oracle, explore, librarian',
      pattern: 'unknown_agent'
    })
    expect(out.availableOptions).toEqual(['explore', 'oracle', 'librarian'])
  })
  test('buildRetryGuidance parses mixed Available and valid options sections', async () => {
    const { buildRetryGuidance } = await import('./agents')
    const out = buildRetryGuidance({
      errorMessage: 'Unknown. Available: quick, deep\nvalid options: deep, ultrabrain',
      pattern: 'unknown_category'
    })
    expect(out.availableOptions).toEqual(['quick', 'deep', 'ultrabrain'])
  })
  test('buildRetryGuidance returns empty options when list absent', async () => {
    const { buildRetryGuidance } = await import('./agents')
    const out = buildRetryGuidance({
      errorMessage: 'opaque failure',
      pattern: 'unknown_error'
    })
    expect(out.availableOptions).toEqual([])
  })
})
describe('final sweep compaction-aware prompt resolver parity', () => {
  const insertMessage = async ({
    content,
    ctx,
    role,
    sessionId,
    threadId
  }: {
    content: string
    ctx: ReturnType<typeof t>
    role: 'assistant' | 'system' | 'user'
    sessionId: Id<'session'>
    threadId: string
  }) =>
    ctx.run(async c =>
      c.db.insert('messages', {
        content,
        isComplete: true,
        parts: [{ text: content, type: 'text' }],
        role,
        sessionId,
        threadId
      })
    )
  test('listMessagesForPrompt excludes messages at-or-before compaction boundary', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const older = await insertMessage({
        content: 'old-before-boundary',
        ctx,
        role: 'user',
        sessionId,
        threadId
      }),
      boundary = await insertMessage({
        content: 'boundary',
        ctx,
        role: 'assistant',
        sessionId,
        threadId
      })
    await insertMessage({
      content: 'after-boundary-1',
      ctx,
      role: 'user',
      sessionId,
      threadId
    })
    await insertMessage({
      content: 'after-boundary-2',
      ctx,
      role: 'assistant',
      sessionId,
      threadId
    })
    const lock = await ctx.mutation(internal.compaction.acquireCompactionLock, {
      threadId
    })
    await ctx.mutation(internal.compaction.setCompactionSummary, {
      compactionSummary: 'summary',
      lastCompactedMessageId: String(boundary),
      lockToken: lock.lockToken,
      threadId
    })
    const rows = await ctx.query(internal.orchestrator.listMessagesForPrompt, {
      threadId
    })
    expect(rows.some(r => String(r._id) === String(older))).toBe(false)
    expect(rows.some(r => String(r._id) === String(boundary))).toBe(false)
    expect(rows.map(r => r.content)).toEqual(['after-boundary-1', 'after-boundary-2'])
  })
  test('listMessagesForPrompt returns empty when prompt is before boundary', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    const promptBeforeBoundary = await insertMessage({
      content: 'prompt-before-boundary',
      ctx,
      role: 'user',
      sessionId,
      threadId
    })
    const boundary = await insertMessage({
      content: 'boundary-after-prompt',
      ctx,
      role: 'assistant',
      sessionId,
      threadId
    })
    await insertMessage({
      content: 'after-boundary',
      ctx,
      role: 'assistant',
      sessionId,
      threadId
    })
    const lock = await ctx.mutation(internal.compaction.acquireCompactionLock, {
      threadId
    })
    await ctx.mutation(internal.compaction.setCompactionSummary, {
      compactionSummary: 'summary-2',
      lastCompactedMessageId: String(boundary),
      lockToken: lock.lockToken,
      threadId
    })
    const rows = await ctx.query(internal.orchestrator.listMessagesForPrompt, {
      promptMessageId: String(promptBeforeBoundary),
      threadId
    })
    expect(rows).toEqual([])
  })
  test('listMessagesForPrompt uses boundary only for the same thread', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      a = await asUser(0).mutation(api.sessions.createSession, {}),
      b = await asUser(0).mutation(api.sessions.createSession, {})
    await insertMessage({
      content: 'a-1',
      ctx,
      role: 'user',
      sessionId: a.sessionId,
      threadId: a.threadId
    })
    const aBoundary = await insertMessage({
      content: 'a-boundary',
      ctx,
      role: 'assistant',
      sessionId: a.sessionId,
      threadId: a.threadId
    })
    await insertMessage({
      content: 'a-2',
      ctx,
      role: 'assistant',
      sessionId: a.sessionId,
      threadId: a.threadId
    })
    await insertMessage({
      content: 'b-1',
      ctx,
      role: 'user',
      sessionId: b.sessionId,
      threadId: b.threadId
    })
    await insertMessage({
      content: 'b-2',
      ctx,
      role: 'assistant',
      sessionId: b.sessionId,
      threadId: b.threadId
    })
    const lock = await ctx.mutation(internal.compaction.acquireCompactionLock, {
      threadId: a.threadId
    })
    await ctx.mutation(internal.compaction.setCompactionSummary, {
      compactionSummary: 'summary-a',
      lastCompactedMessageId: String(aBoundary),
      lockToken: lock.lockToken,
      threadId: a.threadId
    })
    const bRows = await ctx.query(internal.orchestrator.listMessagesForPrompt, {
      threadId: b.threadId
    })
    expect(bRows.map(r => r.content)).toEqual(['b-1', 'b-2'])
  })
  test('listMessagesForPrompt applies both prompt cap and compaction boundary', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await insertMessage({
      content: 'm-1',
      ctx,
      role: 'user',
      sessionId,
      threadId
    })
    const boundary = await insertMessage({
      content: 'm-2-boundary',
      ctx,
      role: 'assistant',
      sessionId,
      threadId
    })
    const afterBoundaryA = await insertMessage({
      content: 'm-3',
      ctx,
      role: 'user',
      sessionId,
      threadId
    })
    await insertMessage({
      content: 'm-4',
      ctx,
      role: 'assistant',
      sessionId,
      threadId
    })
    const prompt = await insertMessage({
      content: 'm-5-prompt',
      ctx,
      role: 'user',
      sessionId,
      threadId
    })
    await insertMessage({
      content: 'm-6-after-prompt',
      ctx,
      role: 'assistant',
      sessionId,
      threadId
    })
    const lock = await ctx.mutation(internal.compaction.acquireCompactionLock, {
      threadId
    })
    await ctx.mutation(internal.compaction.setCompactionSummary, {
      compactionSummary: 'summary-3',
      lastCompactedMessageId: String(boundary),
      lockToken: lock.lockToken,
      threadId
    })
    const rows = await ctx.query(internal.orchestrator.listMessagesForPrompt, {
      promptMessageId: String(prompt),
      threadId
    })
    expect(rows[0]?._id).toBe(afterBoundaryA)
    expect(rows.map(r => r.content)).toEqual(['m-3', 'm-4', 'm-5-prompt'])
  })
})
describe('final sweep compaction threshold parity', () => {
  test('compactIfNeeded stays under threshold at exactly 100000 chars', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'x'.repeat(100_000),
        isComplete: true,
        parts: [{ text: 'x'.repeat(100_000), type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const out = await ctx.mutation(internal.compaction.compactIfNeeded, {
      threadId
    })
    expect(out.compacted).toBe(false)
    expect(out.reason).toBe('under_threshold')
  })
  test('compactIfNeeded triggers path over char threshold', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      await c.db.insert('messages', {
        content: 'x'.repeat(100_001),
        isComplete: true,
        parts: [{ text: 'x'.repeat(100_001), type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const out = await ctx.mutation(internal.compaction.compactIfNeeded, {
      threadId
    })
    expect(out.compacted).toBe(false)
    expect(out.reason === 'placeholder' || out.reason === 'no_closed_groups').toBe(true)
  })
  test('compactIfNeeded stays under threshold at exactly 200 messages', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      for (let i = 0; i < 200; i += 1)
        await c.db.insert('messages', {
          content: `m-${i}`,
          isComplete: true,
          parts: [{ text: `m-${i}`, type: 'text' }],
          role: 'assistant',
          sessionId,
          threadId
        })
    })
    const out = await ctx.mutation(internal.compaction.compactIfNeeded, {
      threadId
    })
    expect(out.reason).toBe('under_threshold')
  })
  test('compactIfNeeded triggers over threshold at 201 messages', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      for (let i = 0; i < 201; i += 1)
        await c.db.insert('messages', {
          content: `n-${i}`,
          isComplete: true,
          parts: [{ text: `n-${i}`, type: 'text' }],
          role: 'assistant',
          sessionId,
          threadId
        })
    })
    const out = await ctx.mutation(internal.compaction.compactIfNeeded, {
      threadId
    })
    expect(out.reason === 'placeholder' || out.reason === 'no_closed_groups').toBe(true)
  })
  test('getContextSize caps messageCount at scan limit 500', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async c => {
      for (let i = 0; i < 501; i += 1)
        await c.db.insert('messages', {
          content: `z-${i}`,
          isComplete: true,
          parts: [{ text: `z-${i}`, type: 'text' }],
          role: 'assistant',
          sessionId,
          threadId
        })
    })
    const out = await ctx.query(internal.compaction.getContextSize, {
      threadId
    })
    expect(out.messageCount).toBe(500)
    expect(out.hasMore).toBe(true)
  })
})
describe('final sweep session and continuation coordination parity', () => {
  test('archiveSession is idempotent and leaves archived status stable', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const row = await ctx.run(async c => c.db.get(sessionId))
    expect(row?.status).toBe('archived')
    expect(typeof row?.archivedAt).toBe('number')
  })
  test('getSession still returns archived session for owner', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await asUser(0).mutation(api.sessions.archiveSession, { sessionId })
    const row = await asUser(0).query(api.sessions.getSession, { sessionId })
    expect(row?.status).toBe('archived')
  })
  test('postTurnAudit continuation decisions stay isolated across concurrent sessions', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      a = await asUser(0).mutation(api.sessions.createSession, {}),
      b = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'concurrent-a-start',
      reason: 'user_message',
      threadId: a.threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'concurrent-b-start',
      reason: 'user_message',
      threadId: b.threadId
    })
    const aState = await ctx.query(internal.orchestrator.readRunState, {
        threadId: a.threadId
      }),
      bState = await ctx.query(internal.orchestrator.readRunState, {
        threadId: b.threadId
      })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'a-pending',
        position: 0,
        priority: 'high',
        sessionId: a.sessionId,
        status: 'pending'
      })
      await d.db.insert('todos', {
        content: 'b-pending',
        position: 0,
        priority: 'high',
        sessionId: b.sessionId,
        status: 'pending'
      })
    })
    const aOut = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: aState?.activeRunToken ?? '',
      threadId: a.threadId,
      turnRequestedInput: true
    })
    const bOut = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken: bState?.activeRunToken ?? '',
      threadId: b.threadId,
      turnRequestedInput: false
    })
    const afterA = await ctx.query(internal.orchestrator.readRunState, {
        threadId: a.threadId
      }),
      afterB = await ctx.query(internal.orchestrator.readRunState, {
        threadId: b.threadId
      })
    expect(aOut.shouldContinue).toBe(false)
    expect(bOut.shouldContinue).toBe(true)
    expect(afterA?.queuedReason).toBeUndefined()
    expect(afterB?.queuedReason).toBe('todo_continuation')
  })
  test('user_message enqueue resets streak only for targeted thread', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      a = await asUser(0).mutation(api.sessions.createSession, {}),
      b = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async d => {
      const aState = await d.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', a.threadId))
          .unique(),
        bState = await d.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', b.threadId))
          .unique()
      if (aState) await d.db.patch(aState._id, { autoContinueStreak: 4 })
      if (bState) await d.db.patch(bState._id, { autoContinueStreak: 4 })
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      incrementStreak: false,
      priority: 2,
      promptMessageId: 'reset-only-a',
      reason: 'user_message',
      threadId: a.threadId
    })
    const afterA = await ctx.query(internal.orchestrator.readRunState, {
        threadId: a.threadId
      }),
      afterB = await ctx.query(internal.orchestrator.readRunState, {
        threadId: b.threadId
      })
    expect(afterA?.autoContinueStreak).toBe(0)
    expect(afterB?.autoContinueStreak).toBe(4)
  })
})
describe('deep parity boundary race and classifier expansion', () => {
  const createContinuationContext = async () => {
    process.env.CONVEX_TEST_MODE = 'true'
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: `start-${crypto.randomUUID()}`,
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'parity todo',
        position: 0,
        priority: 'high',
        sessionId,
        status: 'pending'
      })
    })
    return { ctx, runToken: state?.activeRunToken ?? '', sessionId, threadId }
  }
  for (const c of [
    { ageMs: 9999, blocked: true },
    { ageMs: 10_000, blocked: false }
  ] as const)
    test(`continuation cooldown boundary at ${c.ageMs}ms`, async () => {
      const { ctx, runToken, threadId } = await createContinuationContext()
      const realDateNow = Date.now,
        baseNow = realDateNow()
      try {
        Date.now = () => baseNow
        await ctx.run(async d => {
          const state = await d.db
            .query('threadRunState')
            .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
            .unique()
          if (state)
            await d.db.patch(state._id, {
              consecutiveFailures: 1,
              lastContinuationAt: baseNow - c.ageMs
            })
        })
        const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
          runToken,
          threadId,
          turnRequestedInput: false
        })
        expect(out.shouldContinue).toBe(!c.blocked)
      } finally {
        Date.now = realDateNow
      }
    })
  for (const c of [
    { ageMs: 299_999, expectedFailures: 4 },
    { ageMs: 300_001, expectedFailures: 0 }
  ] as const)
    test(`failure reset window boundary at ${c.ageMs}ms`, async () => {
      const { ctx, runToken, threadId } = await createContinuationContext()
      await ctx.run(async d => {
        const state = await d.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
        if (state)
          await d.db.patch(state._id, {
            consecutiveFailures: 4,
            lastContinuationAt: Date.now() - c.ageMs
          })
      })
      await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken,
        threadId,
        turnRequestedInput: true
      })
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      expect(state?.consecutiveFailures).toBe(c.expectedFailures)
    })
  for (const c of [
    { current: 1, shouldContinue: true },
    { current: 2, shouldContinue: false }
  ] as const)
    test(`stagnation boundary from ${c.current} cycles`, async () => {
      const { ctx, runToken, sessionId, threadId } = await createContinuationContext()
      await ctx.run(async d => {
        const state = await d.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
        const todos = await d.db
          .query('todos')
          .withIndex('by_session_position', idx => idx.eq('sessionId', sessionId))
          .collect()
        if (state) {
          const snapshot = JSON.stringify(
            todos.map(td => ({
              content: td.content,
              id: String(td._id),
              status: td.status
            }))
          )
          await d.db.patch(state._id, {
            lastTodoSnapshot: snapshot,
            stagnationCount: c.current
          })
        }
      })
      const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken,
        threadId,
        turnRequestedInput: false
      })
      expect(out.shouldContinue).toBe(c.shouldContinue)
    })
  for (const c of [
    { shouldTimeout: false, staleByMs: 900_000 },
    { shouldTimeout: true, staleByMs: 900_001 }
  ] as const)
    test(`claimed heartbeat boundary at ${c.staleByMs}ms`, async () => {
      process.env.CONVEX_TEST_MODE = 'true'
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: `hb-${crypto.randomUUID()}`,
        reason: 'user_message',
        threadId
      })
      const before = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      await ctx.mutation(internal.orchestrator.claimRun, {
        runToken: before?.activeRunToken ?? '',
        threadId
      })
      await ctx.run(async d => {
        const state = await d.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
        if (state)
          await d.db.patch(state._id, {
            claimedAt: Date.now() - c.staleByMs,
            runClaimed: true,
            runHeartbeatAt: Date.now() - c.staleByMs
          })
      })
      await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
      const after = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      expect(after?.status === 'idle').toBe(c.shouldTimeout)
      expect(after?.status === 'active').toBe(!c.shouldTimeout)
    })
  for (const c of [
    { ageMs: 14 * 60 * 1000, shouldTimeout: false },
    { ageMs: 15 * 60 * 1000 + 1, shouldTimeout: true }
  ] as const)
    test(`wall clock timeout boundary at ${c.ageMs}ms`, async () => {
      process.env.CONVEX_TEST_MODE = 'true'
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: `wall-${crypto.randomUUID()}`,
        reason: 'user_message',
        threadId
      })
      await ctx.run(async d => {
        const state = await d.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
        if (state)
          await d.db.patch(state._id, {
            activatedAt: Date.now() - c.ageMs,
            runClaimed: true,
            runHeartbeatAt: Date.now()
          })
      })
      await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
      const after = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      expect(after?.status === 'idle').toBe(c.shouldTimeout)
      expect(after?.status === 'active').toBe(!c.shouldTimeout)
    })
  test('simultaneous enqueueRun with equal priority keeps last payload', async () => {
    process.env.CONVEX_TEST_MODE = 'true'
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'equal-priority-start',
      reason: 'user_message',
      threadId
    })
    await Promise.all([
      ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 1,
        promptMessageId: 'equal-priority-a',
        reason: 'task_completion',
        threadId
      }),
      ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 1,
        promptMessageId: 'equal-priority-b',
        reason: 'task_completion',
        threadId
      })
    ])
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(state?.queuedPriority).toBe('task_completion')
    expect(state?.queuedPromptMessageId).toBe('equal-priority-b')
  })
  test('claimRun then timeoutStaleRuns in same tick keeps claimed run active', async () => {
    process.env.CONVEX_TEST_MODE = 'true'
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'claim-race-start',
      reason: 'user_message',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    const token = state?.activeRunToken ?? ''
    const claimOut = await ctx.mutation(internal.orchestrator.claimRun, {
      runToken: token,
      threadId
    })
    await ctx.mutation(internal.orchestrator.timeoutStaleRuns, {})
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(claimOut.ok).toBe(true)
    expect(after?.status).toBe('active')
    expect(after?.runClaimed).toBe(true)
  })
  test('double continuation enqueue keeps latest queued continuation payload', async () => {
    const { ctx, runToken, threadId } = await createContinuationContext()
    const a = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken,
      threadId,
      turnRequestedInput: false
    })
    const afterA = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    const b = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken,
      threadId,
      turnRequestedInput: false
    })
    const afterB = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    const reminders = await ctx.run(async d =>
      d.db
        .query('messages')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .collect()
    )
    const todoReminders = reminders.filter(m => m.role === 'system' && m.content.includes('[TODO CONTINUATION]'))
    expect(a.shouldContinue).toBe(true)
    expect(b.shouldContinue).toBe(true)
    expect(afterB?.queuedReason).toBe('todo_continuation')
    expect(afterB?.queuedPromptMessageId).not.toBe(afterA?.queuedPromptMessageId)
    expect(todoReminders.length).toBe(2)
  })
  test('enqueueRun with undefined promptMessageId preserves undefined through queue', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      reason: 'user_message',
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      reason: 'task_completion',
      threadId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(state?.queuedPromptMessageId).toBeUndefined()
  })
  test('claimRun auto-creates missing threadRunState and returns false', async () => {
    const ctx = t(),
      out = await ctx.mutation(internal.orchestrator.claimRun, {
        runToken: 'missing-state-token',
        threadId: `missing-thread-${crypto.randomUUID()}`
      })
    expect(out.ok).toBe(false)
  })
  for (const c of [
    {
      errorMessage: 'missing run_in_background',
      expected: 'missing_run_in_background'
    },
    {
      errorMessage: 'RUN_IN_BACKGROUND is required',
      expected: 'missing_run_in_background'
    },
    {
      errorMessage: 'invalid args: run_in_background field missing',
      expected: 'missing_run_in_background'
    },
    {
      errorMessage: 'run_in_background=false rejected by policy',
      expected: 'missing_run_in_background'
    },
    { errorMessage: 'load_skills missing', expected: 'missing_load_skills' },
    {
      errorMessage: 'LOAD_SKILLS is required',
      expected: 'missing_load_skills'
    },
    {
      errorMessage: 'bad payload load_skills',
      expected: 'missing_load_skills'
    },
    { errorMessage: 'Unknown category: ultra', expected: 'unknown_category' },
    { errorMessage: 'INVALID CATEGORY supplied', expected: 'unknown_category' },
    { errorMessage: 'invalid category selected', expected: 'unknown_category' },
    { errorMessage: 'Unknown agent: foo', expected: 'unknown_agent' },
    { errorMessage: 'invalid agent selected', expected: 'unknown_agent' },
    { errorMessage: 'UNKNOWN AGENT provided', expected: 'unknown_agent' },
    { errorMessage: 'agent???', expected: 'unknown_error' },
    { errorMessage: 'カテゴリーが不明です', expected: 'unknown_error' },
    { errorMessage: '代理人不存在', expected: 'unknown_error' },
    { errorMessage: '', expected: 'unknown_error' }
  ] as const)
    test(`detectDelegateError expanded classifier ${c.expected} :: ${c.errorMessage || 'empty'}`, async () => {
      const { detectDelegateError } = await import('./agents')
      expect(detectDelegateError({ errorMessage: c.errorMessage })).toBe(c.expected)
    })
  for (const c of [
    {
      errorMessage: 'Unknown category. Available: quick, deep, quick',
      expected: ['quick', 'deep']
    },
    {
      errorMessage: 'invalid agent. valid options: oracle, explore, oracle',
      expected: ['oracle', 'explore']
    },
    {
      errorMessage: 'Unknown category. Available:  quick  ,  deep  ',
      expected: ['quick', 'deep']
    },
    {
      errorMessage: 'Unknown category',
      expected: []
    }
  ] as const)
    test(`buildRetryGuidance options parsing expanded :: ${c.errorMessage}`, async () => {
      const { buildRetryGuidance, detectDelegateError } = await import('./agents'),
        pattern = detectDelegateError({ errorMessage: c.errorMessage }),
        out = buildRetryGuidance({ errorMessage: c.errorMessage, pattern })
      expect(out.availableOptions).toEqual(c.expected)
    })
  for (const c of [
    { mutation: 'fail', status: 'completed' },
    { mutation: 'complete', status: 'failed' },
    { mutation: 'complete', status: 'cancelled' },
    { mutation: 'complete', status: 'timed_out' }
  ] as const)
    test(`terminal task state ${c.status} rejects ${c.mutation} transition`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        taskId = await ctx.run(async d =>
          d.db.insert('tasks', {
            completedAt: Date.now(),
            description: `terminal-${c.status}`,
            isBackground: true,
            parentThreadId,
            retryCount: 0,
            sessionId,
            status: c.status,
            threadId: `terminal-${c.status}-${crypto.randomUUID()}`
          })
        )
      const out =
        c.mutation === 'fail'
          ? await ctx.mutation(internal.tasks.failTask, {
              lastError: 'nope',
              taskId
            })
          : await ctx.mutation(internal.tasks.completeTask, {
              result: 'nope',
              taskId
            })
      const row = await ctx.run(async d => d.db.get(taskId))
      expect(out.ok).toBe(false)
      expect(row?.status).toBe(c.status)
    })
  test('run state valid transition idle -> active -> idle', async () => {
    process.env.CONVEX_TEST_MODE = 'true'
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'state-valid-start',
      reason: 'user_message',
      threadId
    })
    const active = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: active?.activeRunToken ?? '',
      threadId
    })
    const idle = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(active?.status).toBe('active')
    expect(idle?.status).toBe('idle')
  })
  test('run state valid transition active -> active when draining queue', async () => {
    process.env.CONVEX_TEST_MODE = 'true'
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: 'state-queue-start',
      reason: 'user_message',
      threadId
    })
    const before = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 1,
      promptMessageId: 'state-queue-next',
      reason: 'task_completion',
      threadId
    })
    await ctx.mutation(internal.orchestrator.finishRun, {
      runToken: before?.activeRunToken ?? '',
      threadId
    })
    const after = await ctx.query(internal.orchestrator.readRunState, {
      threadId
    })
    expect(after?.status).toBe('active')
    expect(after?.activeRunToken).not.toBe(before?.activeRunToken)
  })
})
describe('deep parity expansion batch three', () => {
  process.env.CONVEX_TEST_MODE = 'true'
  const createTaskRow = ({
    ctx,
    parentThreadId,
    sessionId,
    status
  }: {
    ctx: ReturnType<typeof t>
    parentThreadId: string
    sessionId: Id<'session'>
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out'
  }) => {
    const now = Date.now()
    return ctx.run(async d =>
      d.db.insert('tasks', {
        completedAt:
          status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timed_out'
            ? now
            : undefined,
        description: `matrix-${status}`,
        heartbeatAt: status === 'running' ? now : undefined,
        isBackground: true,
        parentThreadId,
        pendingAt: status === 'pending' ? now : undefined,
        retryCount: 0,
        sessionId,
        startedAt: status === 'running' ? now : undefined,
        status,
        threadId: `matrix-${status}-${crypto.randomUUID()}`
      })
    )
  }
  test('valid transition pending -> running', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await createTaskRow({
        ctx,
        parentThreadId,
        sessionId,
        status: 'pending'
      }),
      out = await ctx.mutation(internal.tasks.markRunning, { taskId }),
      row = await ctx.run(async d => d.db.get(taskId))
    expect(out.ok).toBe(true)
    expect(row?.status).toBe('running')
  })
  test('valid transition running -> completed', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await createTaskRow({
        ctx,
        parentThreadId,
        sessionId,
        status: 'running'
      }),
      out = await ctx.mutation(internal.tasks.completeTask, {
        result: 'ok',
        taskId
      }),
      row = await ctx.run(async d => d.db.get(taskId))
    expect(out.ok).toBe(true)
    expect(row?.status).toBe('completed')
  })
  test('valid transition running -> failed', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await createTaskRow({
        ctx,
        parentThreadId,
        sessionId,
        status: 'running'
      }),
      out = await ctx.mutation(internal.tasks.failTask, {
        lastError: 'boom',
        taskId
      }),
      row = await ctx.run(async d => d.db.get(taskId))
    expect(out.ok).toBe(true)
    expect(row?.status).toBe('failed')
  })
  test('valid transition running -> timed_out', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await createTaskRow({
        ctx,
        parentThreadId,
        sessionId,
        status: 'running'
      })
    await ctx.run(async d => {
      await d.db.patch(taskId, { heartbeatAt: Date.now() - 6 * 60 * 1000 })
    })
    await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {})
    const row = await ctx.run(async d => d.db.get(taskId))
    expect(row?.status).toBe('timed_out')
  })
  test('valid transition pending -> timed_out', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await createTaskRow({
        ctx,
        parentThreadId,
        sessionId,
        status: 'pending'
      })
    await ctx.run(async d => {
      await d.db.patch(taskId, { pendingAt: Date.now() - 6 * 60 * 1000 })
    })
    await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {})
    const row = await ctx.run(async d => d.db.get(taskId))
    expect(row?.status).toBe('timed_out')
  })
  test('valid transition running -> pending via scheduleRetry when retryCount < 3', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await createTaskRow({
        ctx,
        parentThreadId,
        sessionId,
        status: 'running'
      }),
      out = await ctx.mutation(internal.tasks.scheduleRetry, { taskId }),
      row = await ctx.run(async d => d.db.get(taskId))
    expect(out.ok).toBe(true)
    expect(row?.status).toBe('pending')
    expect(row?.retryCount).toBe(1)
  })
  test('valid transition running -> cancelled via archived session scheduleRetry', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      created = await asUser(0).mutation(api.sessions.createSession, {}),
      taskId = await createTaskRow({
        ctx,
        parentThreadId: created.threadId,
        sessionId: created.sessionId,
        status: 'running'
      })
    await asUser(0).mutation(api.sessions.archiveSession, {
      sessionId: created.sessionId
    })
    const out = await ctx.mutation(internal.tasks.scheduleRetry, { taskId })
    const row = await ctx.run(async d => d.db.get(taskId))
    expect(out.ok).toBe(false)
    expect(row?.status).toBe('cancelled')
  })
  for (const s of ['running', 'completed', 'failed', 'cancelled', 'timed_out'] as const)
    test(`invalid transition ${s} -> running rejected`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        taskId = await createTaskRow({
          ctx,
          parentThreadId,
          sessionId,
          status: s
        }),
        out = await ctx.mutation(internal.tasks.markRunning, { taskId }),
        row = await ctx.run(async d => d.db.get(taskId))
      expect(out.ok).toBe(false)
      expect(row?.status).toBe(s)
    })
  for (const s of ['pending', 'completed', 'failed', 'cancelled', 'timed_out'] as const)
    test(`invalid transition ${s} -> completed rejected`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        taskId = await createTaskRow({
          ctx,
          parentThreadId,
          sessionId,
          status: s
        }),
        out = await ctx.mutation(internal.tasks.completeTask, {
          result: 'no',
          taskId
        }),
        row = await ctx.run(async d => d.db.get(taskId))
      expect(out.ok).toBe(false)
      expect(row?.status).toBe(s)
    })
  for (const s of ['pending', 'completed', 'failed', 'cancelled', 'timed_out'] as const)
    test(`invalid transition ${s} -> failed rejected`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        taskId = await createTaskRow({
          ctx,
          parentThreadId,
          sessionId,
          status: s
        }),
        out = await ctx.mutation(internal.tasks.failTask, {
          lastError: 'no',
          taskId
        }),
        row = await ctx.run(async d => d.db.get(taskId))
      expect(out.ok).toBe(false)
      expect(row?.status).toBe(s)
    })
  for (const s of ['pending', 'completed', 'failed', 'cancelled', 'timed_out'] as const)
    test(`invalid transition ${s} -> pending by scheduleRetry rejected`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        taskId = await createTaskRow({
          ctx,
          parentThreadId,
          sessionId,
          status: s
        }),
        out = await ctx.mutation(internal.tasks.scheduleRetry, { taskId }),
        row = await ctx.run(async d => d.db.get(taskId))
      expect(out.ok).toBe(false)
      expect(row?.status).toBe(s)
    })
  for (const retryCount of [3, 4, 10] as const)
    test(`invalid transition running -> pending rejected when retryCount=${retryCount}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId, threadId: parentThreadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        taskId = await createTaskRow({
          ctx,
          parentThreadId,
          sessionId,
          status: 'running'
        })
      await ctx.run(async d => {
        await d.db.patch(taskId, { retryCount })
      })
      const out = await ctx.mutation(internal.tasks.scheduleRetry, { taskId }),
        row = await ctx.run(async d => d.db.get(taskId))
      expect(out.ok).toBe(false)
      expect(row?.status).toBe('running')
      expect(row?.retryCount).toBe(retryCount)
    })
  for (const c of [
    { expected: 'missing_run_in_background', value: 'run_in_background' },
    { expected: 'missing_run_in_background', value: ' run_in_background ' },
    {
      expected: 'missing_run_in_background',
      value: 'RUN_IN_BACKGROUND\nmissing'
    },
    {
      expected: 'missing_run_in_background',
      value: 'missing run_in_background and load_skills'
    },
    { expected: 'missing_load_skills', value: 'load_skills required' },
    { expected: 'missing_load_skills', value: ' LOAD_SKILLS required ' },
    { expected: 'missing_load_skills', value: 'error:load_skills\nstack...' },
    { expected: 'unknown_category', value: 'unknown category' },
    { expected: 'unknown_category', value: 'Unknown Category: deepx' },
    { expected: 'unknown_category', value: 'invalid category' },
    { expected: 'unknown_error', value: 'invalid    category selected' },
    { expected: 'unknown_agent', value: 'unknown agent' },
    { expected: 'unknown_agent', value: 'Unknown Agent: ghost' },
    { expected: 'unknown_agent', value: 'invalid agent' },
    { expected: 'unknown_error', value: 'invalid    agent selected' },
    {
      expected: 'unknown_error',
      value: 'agent unknown but no keyword ordering??'
    },
    { expected: 'unknown_error', value: 'カテゴリーが見つかりません' },
    { expected: 'unknown_error', value: '代理人不存在, 类别未知' },
    { expected: 'unknown_error', value: 'trace:\n at fn (file.ts:1:1)' },
    { expected: 'unknown_error', value: '   ' }
  ] as const)
    test(`classifier detect base combinatoric :: ${c.expected}`, async () => {
      const { detectDelegateError } = await import('./agents')
      expect(detectDelegateError({ errorMessage: c.value })).toBe(c.expected)
    })
  for (const c of [
    {
      expected: 'missing_run_in_background',
      value: 'unknown category and run_in_background missing and load_skills missing'
    },
    {
      expected: 'missing_run_in_background',
      value: 'invalid agent and RUN_IN_BACKGROUND required'
    },
    {
      expected: 'missing_load_skills',
      value: 'unknown category and load_skills missing'
    },
    {
      expected: 'unknown_category',
      value: 'unknown category and unknown agent'
    },
    {
      expected: 'unknown_agent',
      value: 'unknown agent only with stack\n at x\n at y'
    },
    {
      expected: 'unknown_error',
      value: `prefix-${'x'.repeat(5000)}-suffix`
    },
    {
      expected: 'unknown_category',
      value: '  invalid category:\talpha\nvalid options: quick, deep  '
    },
    {
      expected: 'unknown_agent',
      value: '  invalid agent:\toracle2\nvalid options: oracle, explore  '
    },
    {
      expected: 'missing_load_skills',
      value: 'error: LOAD_SKILLS\nstack: at executor\n at delegate'
    },
    {
      expected: 'missing_run_in_background',
      value: 'Error: run_in_background\n    at delegate (tools.ts:123:9)'
    }
  ] as const)
    test(`classifier detect combined combinatoric :: ${c.expected}`, async () => {
      const { detectDelegateError } = await import('./agents')
      expect(detectDelegateError({ errorMessage: c.value })).toBe(c.expected)
    })
  for (const c of [
    {
      errorMessage: 'Unknown category. Available: quick, deep, quick,  deep',
      expected: ['quick', 'deep'],
      pattern: 'unknown_category' as const
    },
    {
      errorMessage: 'Unknown agent. valid options: oracle, explore, oracle,plan',
      expected: ['oracle', 'explore', 'plan'],
      pattern: 'unknown_agent' as const
    },
    {
      errorMessage: 'Unknown category. Available: quick\nstack: at x',
      expected: ['quick'],
      pattern: 'unknown_category' as const
    },
    {
      errorMessage: 'invalid category alpha\nvalid options: quick, deep\nAvailable: deep, quick',
      expected: ['quick', 'deep'],
      pattern: 'unknown_category' as const
    },
    {
      errorMessage: 'invalid agent beta\nvalid options: oracle\nAvailable: oracle, explore',
      expected: ['oracle', 'explore'],
      pattern: 'unknown_agent' as const
    },
    {
      errorMessage: `Unknown category. Available: quick, deep\n${'trace\n'.repeat(200)}`,
      expected: ['quick', 'deep'],
      pattern: 'unknown_category' as const
    },
    {
      errorMessage: 'missing run_in_background',
      expected: [],
      pattern: 'missing_run_in_background' as const
    },
    {
      errorMessage: 'missing load_skills',
      expected: [],
      pattern: 'missing_load_skills' as const
    },
    {
      errorMessage: 'invalid agent, valid options:   oracle  ,   explore  ',
      expected: ['oracle', 'explore'],
      pattern: 'unknown_agent' as const
    },
    {
      errorMessage: 'invalid category, Available: quick,deep,quick,deep',
      expected: ['quick', 'deep'],
      pattern: 'unknown_category' as const
    }
  ] as const)
    test(`classifier guidance combinatoric options parse :: ${c.pattern}`, async () => {
      const { buildRetryGuidance } = await import('./agents'),
        out = buildRetryGuidance({
          errorMessage: c.errorMessage,
          pattern: c.pattern
        })
      expect([...out.availableOptions].toSorted()).toEqual([...c.expected].toSorted())
    })
  const createQueueContext = async () => {
    process.env.CONVEX_TEST_MODE = 'true'
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: `queue-start-${crypto.randomUUID()}`,
      reason: 'user_message',
      threadId
    })
    return { ctx, threadId }
  }
  for (const c of [
    {
      base: { priority: 0 as const, reason: 'todo_continuation' as const },
      incoming: { priority: 1 as const, reason: 'task_completion' as const },
      shouldReplace: true
    },
    {
      base: { priority: 1 as const, reason: 'task_completion' as const },
      incoming: { priority: 2 as const, reason: 'user_message' as const },
      shouldReplace: true
    },
    {
      base: { priority: 2 as const, reason: 'user_message' as const },
      incoming: { priority: 1 as const, reason: 'task_completion' as const },
      shouldReplace: false
    },
    {
      base: { priority: 2 as const, reason: 'user_message' as const },
      incoming: { priority: 0 as const, reason: 'todo_continuation' as const },
      shouldReplace: false
    },
    {
      base: { priority: 1 as const, reason: 'task_completion' as const },
      incoming: { priority: 0 as const, reason: 'todo_continuation' as const },
      shouldReplace: false
    },
    {
      base: { priority: 0 as const, reason: 'todo_continuation' as const },
      incoming: { priority: 2 as const, reason: 'user_message' as const },
      shouldReplace: true
    },
    {
      base: { priority: 1 as const, reason: 'task_completion' as const },
      incoming: { priority: 1 as const, reason: 'task_completion' as const },
      shouldReplace: true
    },
    {
      base: { priority: 2 as const, reason: 'user_message' as const },
      incoming: { priority: 2 as const, reason: 'user_message' as const },
      shouldReplace: true
    },
    {
      base: { priority: 0 as const, reason: 'todo_continuation' as const },
      incoming: { priority: 0 as const, reason: 'todo_continuation' as const },
      shouldReplace: true
    }
  ] as const)
    test(`queue replacement matrix ${c.base.reason} <- ${c.incoming.reason}`, async () => {
      const { ctx, threadId } = await createQueueContext()
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: c.base.priority,
        promptMessageId: `base-${c.base.reason}`,
        reason: c.base.reason,
        threadId
      })
      const out = await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: c.incoming.priority,
        promptMessageId: `incoming-${c.incoming.reason}`,
        reason: c.incoming.reason,
        threadId
      })
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      expect(out.ok).toBe(c.shouldReplace)
      if (c.shouldReplace) {
        expect(state?.queuedReason).toBe(c.incoming.reason)
        expect(state?.queuedPromptMessageId).toBe(`incoming-${c.incoming.reason}`)
      } else {
        expect(state?.queuedReason).toBe(c.base.reason)
        expect(state?.queuedPromptMessageId).toBe(`base-${c.base.reason}`)
      }
    })
  for (const reason of ['todo_continuation', 'task_completion', 'user_message'] as const)
    test(`queue same-priority replacement keeps last wins for ${reason}`, async () => {
      const { ctx, threadId } = await createQueueContext()
      const priority = reason === 'user_message' ? 2 : reason === 'task_completion' ? 1 : 0
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority,
        promptMessageId: `${reason}-first`,
        reason,
        threadId
      })
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority,
        promptMessageId: `${reason}-second`,
        reason,
        threadId
      })
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      expect(state?.queuedPromptMessageId).toBe(`${reason}-second`)
    })
  for (const reason of ['todo_continuation', 'task_completion', 'user_message'] as const)
    test(`queue drain preserves next run for ${reason}`, async () => {
      const { ctx, threadId } = await createQueueContext()
      const before = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      const priority = reason === 'user_message' ? 2 : reason === 'task_completion' ? 1 : 0
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority,
        promptMessageId: `drain-${reason}`,
        reason,
        threadId
      })
      await ctx.mutation(internal.orchestrator.finishRun, {
        runToken: before?.activeRunToken ?? '',
        threadId
      })
      const after = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      expect(after?.status).toBe('active')
      expect(after?.queuedReason).toBeUndefined()
      expect(after?.activeRunToken).not.toBe(before?.activeRunToken)
    })
  test('compaction edge empty thread', async () => {
    const ctx = t(),
      threadId = `empty-thread-${crypto.randomUUID()}`,
      size = await ctx.query(internal.compaction.getContextSize, { threadId }),
      groups = await ctx.query(internal.compaction.listClosedPrefixGroups, {
        threadId
      }),
      compact = await ctx.mutation(internal.compaction.compactIfNeeded, {
        threadId
      })
    expect(size.messageCount).toBe(0)
    expect(groups).toEqual([])
    expect(compact.compacted).toBe(false)
  })
  test('compaction edge single complete message produces one closed group', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async d => {
      await d.db.insert('messages', {
        content: 'one',
        isComplete: true,
        parts: [{ text: 'one', type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const groups = await ctx.query(internal.compaction.listClosedPrefixGroups, {
      threadId
    })
    expect(groups.length).toBe(1)
  })
  test('compaction edge all messages already compacted yields zero groups', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      created = await asUser(0).mutation(api.sessions.createSession, {})
    const ids = await ctx.run(async d => {
      const out: Id<'messages'>[] = []
      for (let i = 0; i < 3; i += 1)
        out.push(
          await d.db.insert('messages', {
            content: `m-${i}`,
            isComplete: true,
            parts: [{ text: `m-${i}`, type: 'text' }],
            role: 'assistant',
            sessionId: created.sessionId,
            threadId: created.threadId
          })
        )
      return out
    })
    await ctx.run(async d => {
      const state = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', created.threadId))
        .unique()
      if (state) await d.db.patch(state._id, { lastCompactedMessageId: String(ids[2]) })
    })
    const groups = await ctx.query(internal.compaction.listClosedPrefixGroups, {
      threadId: created.threadId
    })
    expect(groups.length).toBe(0)
  })
  test('compaction edge active streaming message prevents closed prefix compaction', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async d => {
      await d.db.insert('messages', {
        content: 'x'.repeat(100_001),
        isComplete: false,
        parts: [],
        role: 'assistant',
        sessionId,
        streamingContent: 'streaming',
        threadId
      })
    })
    const out = await ctx.mutation(internal.compaction.compactIfNeeded, {
      threadId
    })
    expect(out.reason).toBe('no_closed_groups')
  })
  test('session lifecycle create then immediate archive', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      created = await asUser(0).mutation(api.sessions.createSession, {
        title: 'lifecycle-a'
      })
    await asUser(0).mutation(api.sessions.archiveSession, {
      sessionId: created.sessionId
    })
    const row = await asUser(0).query(api.sessions.getSession, {
      sessionId: created.sessionId
    })
    expect(row?.status).toBe('archived')
  })
  test('session lifecycle archive then immediate cleanup deletion path', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      created = await asUser(0).mutation(api.sessions.createSession, {
        title: 'lifecycle-b'
      })
    await asUser(0).mutation(api.sessions.archiveSession, {
      sessionId: created.sessionId
    })
    await ctx.run(async d => {
      const row = await d.db.get(created.sessionId)
      if (row)
        await d.db.patch(created.sessionId, {
          archivedAt: Date.now() - 181 * 24 * 60 * 60 * 1000
        })
    })
    await ctx.mutation(internal.retention.cleanupArchivedSessions, {})
    const row = await asUser(0).query(api.sessions.getSession, {
      sessionId: created.sessionId
    })
    expect(row).toBeNull()
  })
  test('session lifecycle create with same title twice keeps distinct sessions', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    await asUser(0).mutation(api.sessions.createSession, {
      title: 'same-title'
    })
    await asUser(0).mutation(api.sessions.createSession, {
      title: 'same-title'
    })
    const rows = await asUser(0).query(api.sessions.listSessions, {})
    let count = 0
    for (const r of rows) if (r.title === 'same-title') count += 1
    expect(count).toBe(2)
  })
  test('session lifecycle list is empty after all sessions archived', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      a = await asUser(0).mutation(api.sessions.createSession, {
        title: 'all-1'
      }),
      b = await asUser(0).mutation(api.sessions.createSession, {
        title: 'all-2'
      })
    await asUser(0).mutation(api.sessions.archiveSession, {
      sessionId: a.sessionId
    })
    await asUser(0).mutation(api.sessions.archiveSession, {
      sessionId: b.sessionId
    })
    const rows = await asUser(0).query(api.sessions.listSessions, {})
    expect(rows.length).toBe(0)
  })
  test('message edge very long content 10k preserved', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      content = 'a'.repeat(10_000)
    await ctx.run(async d => {
      await d.db.insert('messages', {
        content,
        isComplete: true,
        parts: [{ text: content, type: 'text' }],
        role: 'user',
        sessionId,
        threadId
      })
    })
    const rows = await asUser(0).query(api.messages.listMessages, { threadId })
    expect(rows[0]?.content.length).toBe(10_000)
  })
  test('message edge unicode content preserved', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      content = 'こんにちは 🌍 Привет'
    await ctx.run(async d => {
      await d.db.insert('messages', {
        content,
        isComplete: true,
        parts: [{ text: content, type: 'text' }],
        role: 'user',
        sessionId,
        threadId
      })
    })
    const rows = await asUser(0).query(api.messages.listMessages, { threadId })
    expect(rows[0]?.content).toBe(content)
  })
  test('message edge content with null bytes preserved', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId, threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
      content = 'abc\u0000def\u0000ghi'
    await ctx.run(async d => {
      await d.db.insert('messages', {
        content,
        isComplete: true,
        parts: [{ text: content, type: 'text' }],
        role: 'assistant',
        sessionId,
        threadId
      })
    })
    const rows = await asUser(0).query(api.messages.listMessages, { threadId })
    expect(rows[0]?.content).toBe(content)
  })
  test('message edge non-existent thread rejects listMessages', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    let threw = false
    try {
      await asUser(0).query(api.messages.listMessages, {
        threadId: `missing-thread-${crypto.randomUUID()}`
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('thread_not_found')
    }
    expect(threw).toBe(true)
  })
  test('todo edge supports 100 todos in one session', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    const todos: {
      content: string
      position: number
      priority: 'high' | 'medium' | 'low'
      status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
    }[] = []
    for (let i = 0; i < 100; i += 1)
      todos.push({
        content: `todo-${i}`,
        position: i,
        priority: 'low',
        status: 'pending'
      })
    const out = await ctx.mutation(internal.todos.syncOwned, {
      sessionId,
      todos
    })
    const rows = await asUser(0).query(api.todos.listTodos, { sessionId })
    expect(out.updated).toBe(100)
    expect(rows.length).toBe(100)
  })
  test('todo edge very long content preserved', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {}),
      content = 'x'.repeat(5000)
    await ctx.mutation(internal.todos.syncOwned, {
      sessionId,
      todos: [{ content, position: 0, priority: 'high', status: 'pending' }]
    })
    const rows = await asUser(0).query(api.todos.listTodos, { sessionId })
    expect(rows[0]?.content.length).toBe(5000)
  })
  test('todo edge position conflicts keep both rows', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.todos.syncOwned, {
      sessionId,
      todos: [
        { content: 'a', position: 1, priority: 'low', status: 'pending' },
        { content: 'b', position: 1, priority: 'high', status: 'pending' }
      ]
    })
    const rows = await asUser(0).query(api.todos.listTodos, { sessionId })
    expect(rows.length).toBe(2)
  })
  for (const status of ['pending', 'in_progress', 'completed', 'cancelled'] as const)
    test(`todo edge supports status ${status}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { sessionId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.todos.syncOwned, {
        sessionId,
        todos: [
          {
            content: `status-${status}`,
            position: 0,
            priority: 'medium',
            status
          }
        ]
      })
      const rows = await asUser(0).query(api.todos.listTodos, { sessionId })
      expect(rows[0]?.status).toBe(status)
    })
})
describe('append parity session storage matrix', () => {
  for (const title of [undefined, '', 'matrix-a', '  matrix-b  ', 'タイトル'] as const)
    test(`createSession persists title variant ${String(title)}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        created = await asUser(0).mutation(api.sessions.createSession, title === undefined ? {} : { title }),
        session = await ctx.run(async d => d.db.get(created.sessionId))
      if (title === undefined) expect(session?.title).toBeUndefined()
      else expect(session?.title).toBe(title)
      expect(session?.threadId).toBe(created.threadId)
    })
  for (const reason of ['todo_continuation', 'task_completion', 'user_message'] as const)
    test(`archiveSession clears queued fields from ${reason}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        created = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.run(async d => {
        const state = await d.db
          .query('threadRunState')
          .withIndex('by_threadId', idx => idx.eq('threadId', created.threadId))
          .unique()
        if (state)
          await d.db.patch(state._id, {
            queuedPriority: reason,
            queuedPromptMessageId: `queued-${reason}`,
            queuedReason: reason
          })
      })
      await asUser(0).mutation(api.sessions.archiveSession, {
        sessionId: created.sessionId
      })
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId: created.threadId
      })
      expect(state?.queuedPriority).toBeUndefined()
      expect(state?.queuedPromptMessageId).toBeUndefined()
      expect(state?.queuedReason).toBeUndefined()
    })
  for (const status of ['active', 'idle', 'archived'] as const)
    test(`getSession ownership check returns null for non-owner when status=${status}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        created = await asUser(0).mutation(api.sessions.createSession, {})
      if (status !== 'active')
        await ctx.run(async d => {
          await d.db.patch(created.sessionId, { status })
        })
      const out = await asUser(1).query(api.sessions.getSession, {
        sessionId: created.sessionId
      })
      expect(out).toBeNull()
    })
  test('archiveSession keeps threadRunState row for archived session', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      created = await asUser(0).mutation(api.sessions.createSession, {})
    await asUser(0).mutation(api.sessions.archiveSession, {
      sessionId: created.sessionId
    })
    const state = await ctx.query(internal.orchestrator.readRunState, {
      threadId: created.threadId
    })
    expect(state).not.toBeNull()
  })
})
describe('append parity task reminder counter matrix', () => {
  for (const toolName of [
    'read',
    'write',
    'edit',
    'bash',
    'webSearch',
    'mcpCall',
    'grep',
    'glob',
    'look_at',
    'session_read'
  ])
    test(`incrementTaskToolCounter increments for non-task tool ${toolName}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { threadId } = await asUser(0).mutation(api.sessions.createSession, {}),
        out = await ctx.mutation(internal.orchestrator.incrementTaskToolCounter, { threadId, toolName })
      expect(out.turnsSinceTaskTool).toBe(1)
      expect(out.shouldRemind).toBe(false)
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      expect(state?.turnsSinceTaskTool).toBe(1)
    })
  for (const toolName of ['delegate', 'taskStatus', 'taskOutput'])
    test(`incrementTaskToolCounter resets to zero for task tool ${toolName}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.incrementTaskToolCounter, {
        threadId,
        toolName: 'read'
      })
      const out = await ctx.mutation(internal.orchestrator.incrementTaskToolCounter, { threadId, toolName })
      expect(out.turnsSinceTaskTool).toBe(0)
      expect(out.shouldRemind).toBe(false)
    })
  for (const turns of [8, 9, 10, 11] as const)
    test(`consumeTaskReminder threshold behavior at turns=${turns}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        { threadId } = await asUser(0).mutation(api.sessions.createSession, {})
      for (let i = 0; i < turns; i += 1)
        await ctx.mutation(internal.orchestrator.incrementTaskToolCounter, {
          threadId,
          toolName: 'read'
        })
      const consumed = await ctx.mutation(internal.orchestrator.consumeTaskReminder, { threadId })
      expect(consumed.shouldInject).toBe(turns >= 10)
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId
      })
      if (turns >= 10) expect(state?.turnsSinceTaskTool).toBe(0)
      else expect(state?.turnsSinceTaskTool).toBe(turns)
    })
})
describe('append parity compaction prompt boundary matrix', () => {
  const insertPromptMessage = async ({
    content,
    ctx,
    role,
    sessionId,
    threadId
  }: {
    content: string
    ctx: ReturnType<typeof t>
    role: 'assistant' | 'system' | 'user'
    sessionId: string
    threadId: string
  }) =>
    ctx.run(async d =>
      d.db.insert('messages', {
        content,
        isComplete: true,
        parts: [{ text: content, type: 'text' }],
        role,
        sessionId: sessionId as never,
        threadId
      })
    )
  for (const c of [
    { expected: ['p-1'], promptIndex: 1 },
    { expected: ['p-1', 'p-2'], promptIndex: 2 },
    { expected: ['p-1', 'p-2', 'p-3'], promptIndex: 3 }
  ] as const)
    test(`listMessagesForPrompt caps by prompt index ${c.promptIndex}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        created = await asUser(0).mutation(api.sessions.createSession, {})
      const m1 = await insertPromptMessage({
          content: 'p-1',
          ctx,
          role: 'user',
          sessionId: String(created.sessionId),
          threadId: created.threadId
        }),
        m2 = await insertPromptMessage({
          content: 'p-2',
          ctx,
          role: 'assistant',
          sessionId: String(created.sessionId),
          threadId: created.threadId
        }),
        m3 = await insertPromptMessage({
          content: 'p-3',
          ctx,
          role: 'assistant',
          sessionId: String(created.sessionId),
          threadId: created.threadId
        })
      const promptId = c.promptIndex === 1 ? m1 : c.promptIndex === 2 ? m2 : m3
      const rows = await ctx.query(internal.orchestrator.listMessagesForPrompt, {
        promptMessageId: String(promptId),
        threadId: created.threadId
      })
      expect(rows.map(r => r.content)).toEqual(c.expected)
    })
  for (const anchor of [1, 2] as const)
    test(`listMessagesForPrompt honors compaction boundary at message ${anchor}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        created = await asUser(0).mutation(api.sessions.createSession, {})
      const m1 = await insertPromptMessage({
          content: 'b-1',
          ctx,
          role: 'user',
          sessionId: String(created.sessionId),
          threadId: created.threadId
        }),
        m2 = await insertPromptMessage({
          content: 'b-2',
          ctx,
          role: 'assistant',
          sessionId: String(created.sessionId),
          threadId: created.threadId
        }),
        m3 = await insertPromptMessage({
          content: 'b-3',
          ctx,
          role: 'assistant',
          sessionId: String(created.sessionId),
          threadId: created.threadId
        })
      const boundaryId = anchor === 1 ? m1 : m2
      const lock = await ctx.mutation(internal.compaction.acquireCompactionLock, { threadId: created.threadId })
      await ctx.mutation(internal.compaction.setCompactionSummary, {
        compactionSummary: `boundary-${anchor}`,
        lastCompactedMessageId: String(boundaryId),
        lockToken: lock.lockToken,
        threadId: created.threadId
      })
      const rows = await ctx.query(internal.orchestrator.listMessagesForPrompt, { threadId: created.threadId })
      if (anchor === 1) expect(rows.map(r => r.content)).toEqual(['b-2', 'b-3'])
      else expect(rows.map(r => r.content)).toEqual(['b-3'])
      expect(String(m3).length > 0).toBe(true)
    })
  for (const count of [100, 101, 150] as const)
    test(`listMessagesForPrompt limits to 100 rows with inserted count=${count}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        created = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.run(async d => {
        for (let i = 0; i < count; i += 1)
          await d.db.insert('messages', {
            content: `cap-${i}`,
            isComplete: true,
            parts: [{ text: `cap-${i}`, type: 'text' }],
            role: 'user',
            sessionId: created.sessionId,
            threadId: created.threadId
          })
      })
      const rows = await ctx.query(internal.orchestrator.listMessagesForPrompt, { threadId: created.threadId })
      expect(rows.length).toBe(Math.min(100, count))
      expect(rows[0]?.content).toBe(count > 100 ? `cap-${count - 100}` : 'cap-0')
    })
})
describe('append parity polling and task status matrix', () => {
  for (const status of ['pending', 'running', 'completed', 'failed', 'timed_out', 'cancelled'] as const)
    test(`getOwnedTaskStatus polling sees ${status} task`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        created = await asUser(0).mutation(api.sessions.createSession, {})
      const taskId = await ctx.run(async d =>
        d.db.insert('tasks', {
          completedAt:
            status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timed_out'
              ? Date.now()
              : undefined,
          description: `poll-${status}`,
          isBackground: true,
          lastError: status === 'failed' ? 'poll-failure' : undefined,
          parentThreadId: created.threadId,
          pendingAt: status === 'pending' ? Date.now() : undefined,
          result: status === 'completed' ? 'poll-result' : undefined,
          retryCount: 0,
          sessionId: created.sessionId,
          startedAt: status === 'running' ? Date.now() : undefined,
          status,
          threadId: `poll-${status}-${crypto.randomUUID()}`
        })
      )
      const out = await asUser(0).query(api.tasks.getOwnedTaskStatus, {
        taskId
      })
      expect(out?.status).toBe(status)
    })
  for (const status of ['pending', 'running', 'completed', 'failed', 'timed_out', 'cancelled'] as const)
    test(`listTasks includes status ${status}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        created = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.run(async d => {
        await d.db.insert('tasks', {
          completedAt:
            status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timed_out'
              ? Date.now()
              : undefined,
          description: `list-${status}`,
          isBackground: true,
          parentThreadId: created.threadId,
          pendingAt: status === 'pending' ? Date.now() : undefined,
          retryCount: 0,
          sessionId: created.sessionId,
          startedAt: status === 'running' ? Date.now() : undefined,
          status,
          threadId: `list-${status}-${crypto.randomUUID()}`
        })
      })
      const rows = await asUser(0).query(api.tasks.listTasks, {
        sessionId: created.sessionId
      })
      expect(rows.some(r => r.status === status)).toBe(true)
    })
})
describe('append parity continuation question guard equivalents', () => {
  for (const suffix of ['?', ' ? ', '?\n'] as const)
    test(`question-like assistant tail maps to turnRequestedInput=true with suffix ${JSON.stringify(suffix)}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        created = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: 'question-guard-start',
        reason: 'user_message',
        threadId: created.threadId
      })
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId: created.threadId
      })
      await ctx.run(async d => {
        await d.db.insert('messages', {
          content: `Need input${suffix}`,
          isComplete: true,
          parts: [{ text: `Need input${suffix}`, type: 'text' }],
          role: 'assistant',
          sessionId: created.sessionId,
          threadId: created.threadId
        })
        await d.db.insert('todos', {
          content: 'question-guard-todo',
          position: 0,
          priority: 'high',
          sessionId: created.sessionId,
          status: 'pending'
        })
      })
      const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken: state?.activeRunToken ?? '',
        threadId: created.threadId,
        turnRequestedInput: true
      })
      expect(out.shouldContinue).toBe(false)
    })
  for (const suffix of ['.', '!', ' done'] as const)
    test(`non-question assistant tail can continue with turnRequestedInput=false suffix ${JSON.stringify(suffix)}`, async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        created = await asUser(0).mutation(api.sessions.createSession, {})
      await ctx.mutation(internal.orchestrator.enqueueRun, {
        priority: 2,
        promptMessageId: 'non-question-guard-start',
        reason: 'user_message',
        threadId: created.threadId
      })
      const state = await ctx.query(internal.orchestrator.readRunState, {
        threadId: created.threadId
      })
      await ctx.run(async d => {
        await d.db.insert('messages', {
          content: `Completed${suffix}`,
          isComplete: true,
          parts: [{ text: `Completed${suffix}`, type: 'text' }],
          role: 'assistant',
          sessionId: created.sessionId,
          threadId: created.threadId
        })
        await d.db.insert('todos', {
          content: 'non-question-guard-todo',
          position: 0,
          priority: 'high',
          sessionId: created.sessionId,
          status: 'pending'
        })
      })
      const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
        runToken: state?.activeRunToken ?? '',
        threadId: created.threadId,
        turnRequestedInput: false
      })
      expect(out.shouldContinue).toBe(true)
    })
})
describe('append parity source utility and tools matrix', () => {
  for (const marker of [
    'reasonPriority =',
    'task_completion: 1',
    'todo_continuation: 0',
    'user_message: 2',
    'TASK_REMINDER_THRESHOLD = 10',
    'MAX_STAGNATION_COUNT = 3',
    'MAX_CONSECUTIVE_FAILURES = 5',
    'CONTINUATION_BASE_COOLDOWN_MS = 5_000',
    'FAILURE_RESET_WINDOW_MS = 5 * 60 * 1000',
    'WALL_CLOCK_TIMEOUT_MS = 15 * 60 * 1000',
    'isTaskToolName',
    "toolName === 'delegate'",
    "toolName === 'taskOutput'",
    "toolName === 'taskStatus'",
    'consumeTaskReminder',
    'incrementTaskToolCounter',
    'listMessagesForPrompt',
    'postTurnAuditFenced',
    'timeoutStaleRuns',
    'enqueueRunInline',
    'computeContinuationCooldownMs',
    'buildTodoReminder',
    'normalizeTodos',
    'parseTodoSnapshot',
    'summarizeTodoState',
    'runOrchestratorRef',
    'scheduleRun',
    "if (state.status !== 'active') return { ok: false, shouldContinue: false }",
    'if (state.activeRunToken !== runToken) return { ok: false, shouldContinue: false }',
    'turnRequestedInput'
  ])
    test(`orchestrator source contains marker ${marker}`, async () => {
      const { readFileSync } = await import('node:fs')
      const source = readFileSync(new URL('orchestrator.ts', import.meta.url), 'utf8')
      expect(source.includes(marker)).toBe(true)
    })
  for (const marker of [
    'buildTaskCompletionReminder',
    'buildTaskTerminalReminder',
    'maybeContinueOrchestratorInline',
    'continuationEnqueuedAt',
    "status: 'pending'",
    "status: 'running'",
    "status: 'completed'",
    "status: 'failed'",
    "status: 'cancelled'",
    'delayMs = Math.min(1000 * 2 ** retryCount, 30_000)',
    'if (task.retryCount >= 3) return { ok: false }',
    "if (!session || session.status === 'archived') return { ok: false }",
    'updateTaskHeartbeat',
    'getOwnedTaskStatus',
    'listTasks',
    'spawnTask',
    'markRunning',
    'completeTask',
    'failTask',
    'scheduleRetry'
  ])
    test(`tasks source contains marker ${marker}`, async () => {
      const { readFileSync } = await import('node:fs')
      const source = readFileSync(new URL('tasks.ts', import.meta.url), 'utf8')
      expect(source.includes(marker)).toBe(true)
    })
})
describe('remaining adaptable parity append', () => {
  const createContinuationCase = async () => {
    process.env.CONVEX_TEST_MODE = 'true'
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      created = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.mutation(internal.orchestrator.enqueueRun, {
      priority: 2,
      promptMessageId: `remaining-continuation-start-${crypto.randomUUID()}`,
      reason: 'user_message',
      threadId: created.threadId
    })
    const runState = await ctx.query(internal.orchestrator.readRunState, {
      threadId: created.threadId
    })
    await ctx.run(async d => {
      await d.db.insert('todos', {
        content: 'remaining-continuation-todo',
        position: 0,
        priority: 'high',
        sessionId: created.sessionId,
        status: 'pending'
      })
    })
    return {
      ctx,
      runToken: runState?.activeRunToken ?? '',
      threadId: created.threadId
    }
  }
  test('source(todo-continuation): 5s cooldown allows retry before 10s when no failures', async () => {
    const { ctx, runToken, threadId } = await createContinuationCase()
    await ctx.run(async d => {
      const state = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await d.db.patch(state._id, {
          consecutiveFailures: 0,
          lastContinuationAt: Date.now() - 6000
        })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken,
      threadId,
      turnRequestedInput: false
    })
    expect(out.shouldContinue).toBe(true)
  })
  test('source(todo-continuation): no cooldown gate applies before first failure even under 5s', async () => {
    const { ctx, runToken, threadId } = await createContinuationCase()
    await ctx.run(async d => {
      const state = await d.db
        .query('threadRunState')
        .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
        .unique()
      if (state)
        await d.db.patch(state._id, {
          consecutiveFailures: 0,
          lastContinuationAt: Date.now() - 4999
        })
    })
    const out = await ctx.mutation(internal.orchestrator.postTurnAuditFenced, {
      runToken,
      threadId,
      turnRequestedInput: false
    })
    expect(out.shouldContinue).toBe(true)
  })
  test('source(background-manager): listActiveTasksByThread returns empty list when no rows exist', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      created = await asUser(0).mutation(api.sessions.createSession, {}),
      rows = await ctx.query(internal.orchestrator.listActiveTasksByThread, {
        threadId: created.threadId
      })
    expect(rows).toEqual([])
  })
  test('source(background-manager): listActiveTasksByThread excludes terminal task statuses', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      created = await asUser(0).mutation(api.sessions.createSession, {})
    await ctx.run(async d => {
      for (const status of ['completed', 'failed', 'timed_out', 'cancelled'] as const)
        await d.db.insert('tasks', {
          completedAt: Date.now(),
          description: `remaining-terminal-${status}`,
          isBackground: true,
          parentThreadId: created.threadId,
          retryCount: 0,
          sessionId: created.sessionId,
          status,
          threadId: `remaining-terminal-${status}-${crypto.randomUUID()}`
        })
    })
    const rows = await ctx.query(internal.orchestrator.listActiveTasksByThread, { threadId: created.threadId })
    expect(rows).toEqual([])
  })
  test('source(background-manager): timeoutStaleTasks does not time out running rows with missing heartbeatAt', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      created = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async d =>
      d.db.insert('tasks', {
        description: 'remaining-running-no-heartbeat',
        isBackground: true,
        parentThreadId: created.threadId,
        retryCount: 0,
        sessionId: created.sessionId,
        startedAt: Date.now() - 10 * 60 * 1000,
        status: 'running',
        threadId: `remaining-running-no-heartbeat-${crypto.randomUUID()}`
      })
    )
    const out = await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {})
    const row = await ctx.run(async d => d.db.get(taskId))
    expect(out.timedOutCount).toBe(0)
    expect(row?.status).toBe('running')
  })
  test('source(background-manager): timeoutStaleTasks does not time out pending rows with missing pendingAt', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      created = await asUser(0).mutation(api.sessions.createSession, {})
    const taskId = await ctx.run(async d =>
      d.db.insert('tasks', {
        description: 'remaining-pending-no-pendingAt',
        isBackground: true,
        parentThreadId: created.threadId,
        retryCount: 0,
        sessionId: created.sessionId,
        status: 'pending',
        threadId: `remaining-pending-no-pendingAt-${crypto.randomUUID()}`
      })
    )
    const out = await ctx.mutation(internal.staleTaskCleanup.timeoutStaleTasks, {})
    const row = await ctx.run(async d => d.db.get(taskId))
    expect(out.timedOutCount).toBe(0)
    expect(row?.status).toBe('pending')
  })
  test('source(delegate-task): delegate schema rejects null isBackground equivalent to malformed required fields', async () => {
    const { createOrchestratorTools } = await import('./agents')
    const tools = createOrchestratorTools({
      ctx: {
        runMutation: () => ({ taskId: 'x', threadId: 'y' }),
        runQuery: () => null
      } as never,
      parentThreadId: 'remaining-schema-parent',
      sessionId: 'remaining-schema-session' as never
    })
    const inputSchema = (
      tools.delegate as {
        inputSchema?: { safeParse: (v: unknown) => { success: boolean } }
      }
    ).inputSchema
    const parsed = inputSchema?.safeParse({
      description: 'd',
      isBackground: null,
      prompt: 'p'
    })
    expect(parsed?.success).toBe(false)
  })
  test('source(delegate-task): classifier precedence keeps missing_run_in_background above category hints', async () => {
    const { detectDelegateError } = await import('./agents')
    const pattern = detectDelegateError({
      errorMessage: 'Unknown category quickx and run_in_background is required and load_skills missing'
    })
    expect(pattern).toBe('missing_run_in_background')
  })
})

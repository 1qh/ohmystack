/* eslint-disable no-await-in-loop, @typescript-eslint/no-magic-numbers */
// oxlint-disable promise/prefer-await-to-then
/** biome-ignore-all lint/performance/noAwaitInLoops: test fixtures */
import { describe, expect, test } from 'bun:test'
import { convexTest } from 'convex-test'
import { createTestContext } from '@noboil/convex/test'
import { discoverModules } from '@noboil/convex/test/discover'

import { api } from './_generated/api'
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
      { asUser, userIds } = await createTestContext(ctx)
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
      { sessionId: s1 } = await asUser(0).mutation(api.sessions.createSession, { title: 'Active' }),
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
      for (let i = 0; i < 110; i++) {
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

/* oxlint-disable eslint-plugin-vitest(no-conditional-in-test) */
import { describe, expect, test } from 'bun:test'
import { callReducer } from 'noboil/spacetimedb/test'
import { reducers, tables } from '../module_bindings'
import {
  createBlog,
  createChat,
  createMessage,
  findMine,
  getNumber,
  getString,
  listTable,
  none,
  some,
  withCtx
} from './test-helpers'
describe('spacetimedb reducers', () => {
  test('generated bindings expose expected reducer groups', () => {
    expect(typeof reducers.createBlog).toBe('object')
    expect(typeof reducers.updateBlog).toBe('object')
    expect(typeof reducers.rmBlog).toBe('object')
    expect(typeof reducers.createChat).toBe('object')
    expect(typeof reducers.createMessage).toBe('object')
    expect(typeof reducers.createMovie).toBe('object')
  })
  test('generated bindings expose expected tables', () => {
    expect(tables.blog).toBeDefined()
    expect(tables.chat).toBeDefined()
    expect(tables.message).toBeDefined()
    expect(tables.movie).toBeDefined()
    expect(tables.project).toBeDefined()
    expect(tables.task).toBeDefined()
    expect(tables.wiki).toBeDefined()
  })
})
describe('blog reducer flow', () => {
  test('create and read blog rows for current user', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      const title = `blog-create-${Date.now().toString()}`
      await createBlog(ctx, user, title)
      const rows = await listTable(ctx, 'blog', user)
      const mine = findMine(rows, user.identity)
      const found = mine.find(row => getString(row, 'title') === title)
      expect(found).toBeDefined()
      expect(getString(found as Record<string, unknown>, 'category')).toBe('tech')
    })
  })
  test('owner can update and remove blog row', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      const title = `blog-owner-${Date.now().toString()}`
      await createBlog(ctx, user, title)
      const rows = await listTable(ctx, 'blog', user)
      const mine = findMine(rows, user.identity)
      const found = mine.find(row => getString(row, 'title') === title)
      if (!found) throw new Error('Missing created row')
      const id = getNumber(found, 'id')
      await callReducer(
        ctx,
        'update_blog',
        {
          attachments: none,
          category: none,
          content: none,
          coverImage: none,
          expectedUpdatedAt: none,
          id,
          published: none,
          tags: none,
          title: some(`${title}-updated`)
        },
        user
      )
      const afterUpdate = await listTable(ctx, 'blog', user)
      const updated = afterUpdate.find(row => getNumber(row, 'id') === id)
      expect(updated).toBeDefined()
      expect(getString(updated as Record<string, unknown>, 'title')).toBe(`${title}-updated`)
      await callReducer(ctx, 'rm_blog', { id }, user)
      const afterRemove = await listTable(ctx, 'blog', user)
      const exists = afterRemove.some(row => getNumber(row, 'id') === id)
      expect(exists).toBe(false)
    })
  })
  test('non owner update throws reducer error', async () => {
    await withCtx(async ctx => {
      const [owner, other] = ctx.users
      if (!owner) throw new Error('Missing owner user')
      if (!other) throw new Error('Missing other user')
      const title = `blog-auth-${Date.now().toString()}`
      await createBlog(ctx, owner, title)
      const rows = await listTable(ctx, 'blog', owner)
      const mine = findMine(rows, owner.identity)
      const found = mine.find(row => getString(row, 'title') === title)
      if (!found) throw new Error('Missing created row')
      const id = getNumber(found, 'id')
      let threw = false
      try {
        await callReducer(
          ctx,
          'update_blog',
          {
            attachments: none,
            category: none,
            content: none,
            coverImage: none,
            expectedUpdatedAt: none,
            id,
            published: none,
            tags: none,
            title: some('intruder')
          },
          other
        )
      } catch (error) {
        threw = true
        expect(String(error)).toContain('REDUCER_CALL_FAILED')
      }
      expect(threw).toBe(true)
    })
  })
})
describe('chat and message reducers', () => {
  test('message rows still visible after chat remove with sender-only RLS', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      const title = `chat-${Date.now().toString()}`
      await createChat(ctx, user, title)
      const chats = await listTable(ctx, 'chat', user)
      const mineChats = findMine(chats, user.identity)
      const chat = mineChats.find(row => getString(row, 'title') === title)
      if (!chat) throw new Error('Missing chat row')
      const chatId = getNumber(chat, 'id')
      await createMessage(ctx, user, chatId, 'hello')
      await createMessage(ctx, user, chatId, 'second')
      const messagesBefore = await listTable(ctx, 'message', user)
      const forChatBefore = messagesBefore.filter(row => getNumber(row, 'chat_id') === chatId)
      expect(forChatBefore.length).toBeGreaterThanOrEqual(2)
      await callReducer(ctx, 'rm_chat', { id: chatId }, user)
      const messagesAfter = await listTable(ctx, 'message', user)
      const forChatAfter = messagesAfter.filter(row => getNumber(row, 'chat_id') === chatId)
      expect(forChatAfter.length).toBeGreaterThanOrEqual(2)
    })
  })
})
describe('vote (log) reducer flow', () => {
  test('append + listed by parent', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      const parent = `pollx-${Date.now().toString()}`
      await callReducer(ctx, 'append_vote', { idempotency_key: none, option: 'a', parent }, user)
      await callReducer(ctx, 'append_vote', { idempotency_key: none, option: 'b', parent }, user)
      const rows = await listTable(ctx, 'vote', user)
      const mine = rows.filter(r => getString(r, 'parent') === parent)
      expect(mine.length).toBeGreaterThanOrEqual(2)
    })
  })
  test('purge_vote_by_parent removes only that parent', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      const tag = Date.now().toString()
      const a = `purgeA-${tag}`
      const b = `purgeB-${tag}`
      await callReducer(ctx, 'append_vote', { idempotency_key: none, option: 'x', parent: a }, user)
      await callReducer(ctx, 'append_vote', { idempotency_key: none, option: 'x', parent: b }, user)
      await callReducer(ctx, 'purge_vote_by_parent', { parent: a }, user)
      const rows = await listTable(ctx, 'vote', user)
      const aRows = rows.filter(r => getString(r, 'parent') === a && !r.deleted_at)
      const bRows = rows.filter(r => getString(r, 'parent') === b)
      expect(aRows.length).toBe(0)
      expect(bRows.length).toBeGreaterThanOrEqual(1)
    })
  })
  test('restore_vote_by_parent brings back purged rows', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      const parent = `restore-${Date.now().toString()}`
      await callReducer(ctx, 'append_vote', { idempotency_key: none, option: 'x', parent }, user)
      await callReducer(ctx, 'purge_vote_by_parent', { parent }, user)
      await callReducer(ctx, 'restore_vote_by_parent', { parent }, user)
      const rows = await listTable(ctx, 'vote', user)
      const mine = rows.filter(r => getString(r, 'parent') === parent)
      expect(mine.length).toBeGreaterThanOrEqual(1)
    })
  })
  test('bulk_append_vote inserts multiple rows', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      const parent = `bulk-${Date.now().toString()}`
      await callReducer(
        ctx,
        'bulk_append_vote',
        {
          items: [
            { idempotency_key: none, option: 'a' },
            { idempotency_key: none, option: 'b' },
            { idempotency_key: none, option: 'c' }
          ],
          parent
        },
        user
      )
      const rows = await listTable(ctx, 'vote', user)
      const mine = rows.filter(r => getString(r, 'parent') === parent)
      expect(mine.length).toBeGreaterThanOrEqual(3)
    })
  })
})
describe('siteConfig (kv) reducer flow', () => {
  test('set + read banner row', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      const msg = `kv-${Date.now().toString()}`
      await callReducer(
        ctx,
        'set_siteConfig',
        { active: true, expectedUpdatedAt: none, key: 'banner', message: msg },
        user
      )
      const rows = await listTable(ctx, 'siteConfig', user)
      const found = rows.find(r => getString(r, 'key') === 'banner' && getString(r, 'message') === msg)
      expect(found).toBeDefined()
    })
  })
  test('rm_site_config soft-deletes', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      await callReducer(
        ctx,
        'set_siteConfig',
        { active: true, expectedUpdatedAt: none, key: 'banner', message: 'gone' },
        user
      )
      await callReducer(ctx, 'rm_siteConfig', { key: 'banner' }, user)
      const rows = await listTable(ctx, 'siteConfig', user)
      const live = rows.find(r => getString(r, 'key') === 'banner' && !r.deleted_at)
      expect(live).toBeUndefined()
    })
  })
  test('restore_site_config brings back row', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      await callReducer(
        ctx,
        'set_siteConfig',
        { active: true, expectedUpdatedAt: none, key: 'banner', message: 'back' },
        user
      )
      await callReducer(ctx, 'rm_siteConfig', { key: 'banner' }, user)
      await callReducer(ctx, 'restore_siteConfig', { key: 'banner' }, user)
      const rows = await listTable(ctx, 'siteConfig', user)
      const live = rows.find(r => getString(r, 'key') === 'banner')
      expect(live).toBeDefined()
    })
  })
})
describe('pollVoteQuota reducer flow', () => {
  test('record + consume decrements and rejects beyond limit', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      const owner = `quota-${Date.now().toString()}`
      for (let i = 0; i < 30; i += 1) await callReducer(ctx, 'consume_pollVoteQuota', { owner }, user)
      let threw = false
      try {
        await callReducer(ctx, 'consume_pollVoteQuota', { owner }, user)
      } catch (error) {
        threw = true
        expect(String(error)).toContain('REDUCER_CALL_FAILED')
      }
      expect(threw).toBe(true)
    })
  })
})
describe('pollProfile (singleton) reducer flow', () => {
  test('upsert creates profile, get reads it back', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      await callReducer(
        ctx,
        'upsert_pollProfile',
        {
          avatar: none,
          bio: some(some('bio')),
          displayName: some('Voter'),
          notifications: some(true),
          theme: some('dark')
        },
        user
      )
      const rows = await listTable(ctx, 'pollProfile', user)
      const mine = findMine(rows, user.identity)
      expect(mine.length).toBe(1)
      expect(getString(mine[0] as Record<string, unknown>, 'display_name')).toBe('Voter')
    })
  })
})

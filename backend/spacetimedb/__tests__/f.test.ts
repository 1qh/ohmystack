import { callReducer } from '@noboil/spacetimedb/test'
import { describe, expect, test } from 'bun:test'

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

      const rows = await listTable(ctx, 'blog', user),
        mine = findMine(rows, user.identity),
        found = mine.find(row => getString(row, 'title') === title)

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

      const rows = await listTable(ctx, 'blog', user),
        mine = findMine(rows, user.identity),
        found = mine.find(row => getString(row, 'title') === title)
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

      const afterUpdate = await listTable(ctx, 'blog', user),
        updated = afterUpdate.find(row => getNumber(row, 'id') === id)
      expect(updated).toBeDefined()
      expect(getString(updated as Record<string, unknown>, 'title')).toBe(`${title}-updated`)

      await callReducer(ctx, 'rm_blog', { id }, user)
      const afterRemove = await listTable(ctx, 'blog', user),
        exists = afterRemove.some(row => getNumber(row, 'id') === id)
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

      const rows = await listTable(ctx, 'blog', owner),
        mine = findMine(rows, owner.identity),
        found = mine.find(row => getString(row, 'title') === title)
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
  test('message rows hidden after chat remove due to children RLS JOIN', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users
      if (!user) throw new Error('Missing test user')
      const title = `chat-${Date.now().toString()}`
      await createChat(ctx, user, title)

      const chats = await listTable(ctx, 'chat', user),
        mineChats = findMine(chats, user.identity),
        chat = mineChats.find(row => getString(row, 'title') === title)
      if (!chat) throw new Error('Missing chat row')
      const chatId = getNumber(chat, 'id')

      await createMessage(ctx, user, chatId, 'hello')
      await createMessage(ctx, user, chatId, 'second')

      const messagesBefore = await listTable(ctx, 'message', user),
        forChatBefore = messagesBefore.filter(row => getNumber(row, 'chat_id') === chatId)
      expect(forChatBefore.length).toBeGreaterThanOrEqual(2)

      await callReducer(ctx, 'rm_chat', { id: chatId }, user)

      const messagesAfter = await listTable(ctx, 'message', user),
        forChatAfter = messagesAfter.filter(row => getNumber(row, 'chat_id') === chatId)
      expect(forChatAfter).toHaveLength(0)
    })
  })
})

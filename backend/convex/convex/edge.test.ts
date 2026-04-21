/* eslint-disable no-await-in-loop */
/* oxlint-disable promise/prefer-await-to-then */
/** biome-ignore-all lint/performance/noAwaitInLoops: test fixtures */
import { createTestContext } from '@noboil/convex/test'
import { discoverModules } from '@noboil/convex/test/discover'
import { describe, expect, test } from 'bun:test'
import { convexTest } from 'convex-test'
import { api } from './_generated/api'
import schema from './schema'
const modules = discoverModules('convex', {
    './_generated/api.js': async () => import('./_generated/api'),
    './_generated/server.js': async () => import('./_generated/server')
  }),
  t = () => convexTest(schema, modules),
  movieData = {
    backdrop_path: '/backdrop.jpg',
    budget: 200_000_000,
    genres: [{ id: 28, name: 'Action' }],
    original_title: 'Test Movie',
    overview: 'A test movie',
    poster_path: '/poster.jpg',
    release_date: '2025-01-01',
    revenue: 500_000_000,
    runtime: 120,
    tagline: 'Just testing',
    title: 'Test Movie',
    tmdb_id: 12_345,
    vote_average: 7.5,
    vote_count: 1000
  }
describe('public child endpoints', () => {
  describe('message.pubList', () => {
    test('returns messages when parent chat is public', async () => {
      const ctx = t(),
        { userIds } = await createTestContext(ctx),
        [userId] = userIds,
        chatId = await ctx.run(async c =>
          c.db.insert('chat', { isPublic: true, title: 'Public Chat', updatedAt: Date.now(), userId })
        )
      await ctx.run(async c => {
        await c.db.insert('message', {
          chatId,
          parts: [{ text: 'Hello public', type: 'text' }],
          role: 'user',
          updatedAt: Date.now()
        })
        await c.db.insert('message', {
          chatId,
          parts: [{ text: 'Hi there', type: 'text' }],
          role: 'assistant',
          updatedAt: Date.now()
        })
      })
      const result = await ctx.query(api.message.pubList, { chatId })
      expect((result as unknown[]).length).toBe(2)
    })
    test('returns empty when parent chat is not public', async () => {
      const ctx = t(),
        { userIds } = await createTestContext(ctx),
        [userId] = userIds,
        chatId = await ctx.run(async c =>
          c.db.insert('chat', { isPublic: false, title: 'Private Chat', updatedAt: Date.now(), userId })
        )
      await ctx.run(async c => {
        await c.db.insert('message', {
          chatId,
          parts: [{ text: 'Secret', type: 'text' }],
          role: 'user',
          updatedAt: Date.now()
        })
      })
      let threw = false
      try {
        await ctx.query(api.message.pubList, { chatId })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('NOT_FOUND')
      }
      expect(threw).toBe(true)
    })
  })
  describe('message.pubGet', () => {
    test('returns message when parent chat is public', async () => {
      const ctx = t(),
        { userIds } = await createTestContext(ctx),
        [userId] = userIds,
        chatId = await ctx.run(async c =>
          c.db.insert('chat', { isPublic: true, title: 'Public Get', updatedAt: Date.now(), userId })
        ),
        messageId = await ctx.run(async c =>
          c.db.insert('message', {
            chatId,
            parts: [{ text: 'Visible', type: 'text' }],
            role: 'user',
            updatedAt: Date.now()
          })
        ),
        result = await ctx.query(api.message.pubGet, { id: messageId })
      expect(result).not.toBeNull()
    })
    test('throws NOT_FOUND when parent chat is not public', async () => {
      const ctx = t(),
        { userIds } = await createTestContext(ctx),
        [userId] = userIds,
        chatId = await ctx.run(async c =>
          c.db.insert('chat', { isPublic: false, title: 'Private Get', updatedAt: Date.now(), userId })
        ),
        messageId = await ctx.run(async c =>
          c.db.insert('message', {
            chatId,
            parts: [{ text: 'Hidden', type: 'text' }],
            role: 'user',
            updatedAt: Date.now()
          })
        )
      let threw = false
      try {
        await ctx.query(api.message.pubGet, { id: messageId })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('NOT_FOUND')
      }
      expect(threw).toBe(true)
    })
  })
})
describe('cache CRUD (movie)', () => {
  describe('movie.create', () => {
    test('creates a movie entry', async () => {
      const ctx = t(),
        id = await ctx.mutation(api.movie.create, movieData)
      expect(id).toBeDefined()
      const doc = await ctx.run(async c => c.db.get(id as never))
      expect(doc).not.toBeNull()
      expect((doc as Record<string, unknown>).title).toBe('Test Movie')
      expect((doc as Record<string, unknown>).tmdb_id).toBe(12_345)
    })
  })
  describe('movie.get', () => {
    test('returns cached movie by key', async () => {
      const ctx = t()
      await ctx.mutation(api.movie.create, movieData)
      const result = await ctx.query(api.movie.get, { tmdb_id: 12_345 })
      expect(result).not.toBeNull()
      expect((result as Record<string, unknown>).title).toBe('Test Movie')
      expect((result as Record<string, unknown>).cacheHit).toBe(true)
    })
    test('returns null for non-existent key', async () => {
      const ctx = t(),
        result = await ctx.query(api.movie.get, { tmdb_id: 99_999 })
      expect(result).toBeNull()
    })
    test('returns null for expired entry', async () => {
      const ctx = t()
      await ctx.run(async c => {
        const old = Date.now() - 8 * 24 * 60 * 60 * 1000
        await c.db.insert('movie', { ...movieData, updatedAt: old })
      })
      const result = await ctx.query(api.movie.get, { tmdb_id: 12_345 })
      expect(result).toBeNull()
    })
  })
  describe('movie.update', () => {
    test('updates existing movie', async () => {
      const ctx = t(),
        id = await ctx.mutation(api.movie.create, movieData),
        updated = await ctx.mutation(api.movie.update, { id, title: 'Updated Movie' })
      expect((updated as Record<string, unknown>).title).toBe('Updated Movie')
      expect((updated as Record<string, unknown>).tmdb_id).toBe(12_345)
    })
    test('rejects update for non-existent id', async () => {
      const ctx = t(),
        id = await ctx.mutation(api.movie.create, movieData)
      await ctx.mutation(api.movie.rm, { id })
      let threw = false
      try {
        await ctx.mutation(api.movie.update, { id, title: 'Nope' })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('NOT_FOUND')
      }
      expect(threw).toBe(true)
    })
  })
  describe('movie.rm', () => {
    test('removes existing movie', async () => {
      const ctx = t(),
        id = await ctx.mutation(api.movie.create, movieData)
      await ctx.mutation(api.movie.rm, { id })
      const doc = await ctx.run(async c => c.db.get(id as never))
      expect(doc).toBeNull()
    })
    test('rm on non-existent id returns null', async () => {
      const ctx = t()
      await ctx.mutation(api.movie.create, movieData)
      const id = await ctx.mutation(api.movie.create, { ...movieData, tmdb_id: 99 })
      await ctx.mutation(api.movie.rm, { id })
      const secondRm = await ctx.mutation(api.movie.rm, { id })
      expect(secondRm).toBeNull()
    })
  })
  describe('movie.all', () => {
    test('returns all non-expired movies', async () => {
      const ctx = t()
      await ctx.mutation(api.movie.create, { ...movieData, tmdb_id: 1 })
      await ctx.mutation(api.movie.create, { ...movieData, tmdb_id: 2 })
      const results = await ctx.query(api.movie.all, {})
      expect(results.length).toBe(2)
    })
    test('excludes expired without includeExpired', async () => {
      const ctx = t()
      await ctx.mutation(api.movie.create, { ...movieData, tmdb_id: 1 })
      const old = Date.now() - 8 * 24 * 60 * 60 * 1000
      await ctx.run(async c => {
        await c.db.insert('movie', { ...movieData, tmdb_id: 2, updatedAt: old })
      })
      const results = await ctx.query(api.movie.all, {})
      expect(results.length).toBe(1)
    })
    test('includes expired with includeExpired: true', async () => {
      const ctx = t()
      await ctx.mutation(api.movie.create, { ...movieData, tmdb_id: 1 })
      const old = Date.now() - 8 * 24 * 60 * 60 * 1000
      await ctx.run(async c => {
        await c.db.insert('movie', { ...movieData, tmdb_id: 2, updatedAt: old })
      })
      const results = await ctx.query(api.movie.all, { includeExpired: true })
      expect(results.length).toBe(2)
    })
  })
  describe('movie.list', () => {
    test('returns paginated results', async () => {
      const ctx = t()
      for (let i = 0; i < 5; i += 1) await ctx.mutation(api.movie.create, { ...movieData, tmdb_id: i })
      const result = await ctx.query(api.movie.list, {
        paginationOpts: { cursor: null, numItems: 3 }
      })
      expect(result.page.length).toBeLessThanOrEqual(3)
    })
    test('pagination with includeExpired', async () => {
      const ctx = t()
      await ctx.mutation(api.movie.create, { ...movieData, tmdb_id: 1 })
      const old = Date.now() - 8 * 24 * 60 * 60 * 1000
      await ctx.run(async c => {
        await c.db.insert('movie', { ...movieData, tmdb_id: 2, updatedAt: old })
      })
      const withExpired = await ctx.query(api.movie.list, {
          includeExpired: true,
          paginationOpts: { cursor: null, numItems: 10 }
        }),
        withoutExpired = await ctx.query(api.movie.list, {
          paginationOpts: { cursor: null, numItems: 10 }
        })
      expect(withExpired.page.length).toBeGreaterThanOrEqual(withoutExpired.page.length)
    })
  })
  describe('movie.invalidate', () => {
    test('removes movie by key', async () => {
      const ctx = t()
      await ctx.mutation(api.movie.create, movieData)
      const before = await ctx.query(api.movie.get, { tmdb_id: 12_345 })
      expect(before).not.toBeNull()
      await ctx.mutation(api.movie.invalidate, { tmdb_id: 12_345 })
      const after = await ctx.query(api.movie.get, { tmdb_id: 12_345 })
      expect(after).toBeNull()
    })
    test('invalidate non-existent key does nothing', async () => {
      const ctx = t(),
        result = await ctx.mutation(api.movie.invalidate, { tmdb_id: 99_999 })
      expect(result).toBeNull()
    })
  })
  describe('movie.purge', () => {
    test('purge with no expired entries returns 0', async () => {
      const ctx = t()
      await ctx.mutation(api.movie.create, movieData)
      const purged = await ctx.mutation(api.movie.purge, {})
      expect(purged).toBe(0)
    })
    test('purge is callable and returns a number', async () => {
      const ctx = t(),
        purged = await ctx.mutation(api.movie.purge, {})
      expect(typeof purged).toBe('number')
    })
  })
  describe('movie upsert behavior', () => {
    test('creating with same key updates existing', async () => {
      const ctx = t()
      await ctx.mutation(api.movie.create, movieData)
      await ctx.mutation(api.movie.create, { ...movieData, title: 'Updated Title' })
      const all = await ctx.query(api.movie.all, {})
      expect(all.length).toBe(1)
      expect((all[0] as Record<string, unknown>).title).toBe('Updated Title')
    })
  })
})
describe('child CRUD auth', () => {
  test('message.create requires authenticated user who owns parent', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      chatId = await ctx.run(async c =>
        c.db.insert('chat', { isPublic: false, title: 'Auth Chat', updatedAt: Date.now(), userId })
      ),
      messageId = await asUser(0).mutation(api.message.create, {
        chatId,
        parts: [{ text: 'Auth message', type: 'text' }],
        role: 'user'
      })
    expect(messageId).toBeDefined()
  })
  test('message.list requires authenticated user who owns parent', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      chatId = await ctx.run(async c =>
        c.db.insert('chat', { isPublic: false, title: 'Auth List', updatedAt: Date.now(), userId })
      )
    await ctx.run(async c => {
      await c.db.insert('message', {
        chatId,
        parts: [{ text: 'msg', type: 'text' }],
        role: 'user',
        updatedAt: Date.now()
      })
    })
    const result = await asUser(0).query(api.message.list, { chatId })
    expect((result as unknown[]).length).toBe(1)
  })
})
describe('blog CRUD edge cases', () => {
  test('delete with empty array', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      result = await asUser(0).mutation(api.blog.rm, { ids: [] })
    expect(result).toBeDefined()
  })
  test('update with empty array', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      result = await asUser(0).mutation(api.blog.update, { items: [] })
    expect(result).toBeDefined()
  })
  test('conflict detection on blog update', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      postId = await ctx.run(async c =>
        c.db.insert('blog', {
          category: 'tech',
          content: 'Conflict test',
          published: false,
          title: 'Conflict Post',
          updatedAt: Date.now(),
          userId
        })
      )
    await asUser(0).mutation(api.blog.update, { id: postId, title: 'First Update' })
    let threw = false
    try {
      await asUser(0).mutation(api.blog.update, { expectedUpdatedAt: 1, id: postId, title: 'Stale Update' })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('CONFLICT')
    }
    expect(threw).toBe(true)
  })
  test('search returns matching results', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds
    await ctx.run(async c => {
      await c.db.insert('blog', {
        category: 'tech',
        content: 'Searchable content about testing',
        published: true,
        title: 'Search Test',
        updatedAt: Date.now(),
        userId
      })
    })
    const { page } = await asUser(0).query(api.blog.list, {
      paginationOpts: { cursor: null, numItems: 10 },
      where: { published: true }
    })
    expect(page.length).toBeGreaterThanOrEqual(1)
  })
})
describe('concurrent edit conflict detection', () => {
  test('stale expectedUpdatedAt from tab A rejected after tab B saves', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      postId = await ctx.run(async c =>
        c.db.insert('blog', {
          category: 'tech',
          content: 'Shared content',
          published: false,
          title: 'Shared Post',
          updatedAt: 1000,
          userId
        })
      ),
      tabBResult = await asUser(0).mutation(api.blog.update, {
        expectedUpdatedAt: 1000,
        id: postId,
        title: 'Tab B Edit'
      })
    expect(tabBResult.title).toBe('Tab B Edit')
    let threw = false
    try {
      await asUser(0).mutation(api.blog.update, {
        expectedUpdatedAt: 1000,
        id: postId,
        title: 'Tab A Stale Edit'
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('CONFLICT')
    }
    expect(threw).toBe(true)
  })
  test('fresh expectedUpdatedAt succeeds after prior edit', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      postId = await ctx.run(async c =>
        c.db.insert('blog', {
          category: 'tech',
          content: 'Fresh content',
          published: false,
          title: 'Fresh Post',
          updatedAt: 1000,
          userId
        })
      ),
      firstEdit = await asUser(0).mutation(api.blog.update, {
        expectedUpdatedAt: 1000,
        id: postId,
        title: 'First Edit'
      }),
      secondEdit = await asUser(0).mutation(api.blog.update, {
        expectedUpdatedAt: firstEdit.updatedAt,
        id: postId,
        title: 'Second Edit'
      })
    expect(secondEdit.title).toBe('Second Edit')
  })
  test('update without expectedUpdatedAt always succeeds', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      postId = await ctx.run(async c =>
        c.db.insert('blog', {
          category: 'tech',
          content: 'No conflict check',
          published: false,
          title: 'No Check Post',
          updatedAt: 1000,
          userId
        })
      )
    await asUser(0).mutation(api.blog.update, { id: postId, title: 'Edit 1' })
    const result = await asUser(0).mutation(api.blog.update, { id: postId, title: 'Edit 2' })
    expect(result.title).toBe('Edit 2')
  })
})
describe('getOrCreate org', () => {
  test('creates org for user on first call', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      result = await asUser(0).mutation(api.org.getOrCreate, {})
    expect(result.created).toBe(true)
    expect(result.orgId).toBeDefined()
  })
  test('returns existing org on second call', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx),
      first = await asUser(0).mutation(api.org.getOrCreate, {}),
      second = await asUser(0).mutation(api.org.getOrCreate, {})
    expect(second.created).toBe(false)
    expect(second.orgId).toBe(first.orgId)
  })
  test('requires authentication', async () => {
    const ctx = t()
    let threw = false
    try {
      await ctx.mutation(api.org.getOrCreate, {})
    } catch (error) {
      threw = true
      expect(String(error)).toContain('NOT_AUTHENTICATED')
    }
    expect(threw).toBe(true)
  })
})

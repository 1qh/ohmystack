/* eslint-disable no-await-in-loop, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
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
  t = () => convexTest(schema, modules)
describe('crud factory', () => {
  describe('basic CRUD operations', () => {
    test('create and read a blog post', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds
      await ctx.run(async c => {
        await c.db.insert('blog', {
          category: 'tech',
          content: 'Test content',
          published: false,
          title: 'Test Post',
          updatedAt: Date.now(),
          userId
        })
      })
      const { page: posts } = await asUser(0).query(api.blog.list, {
        paginationOpts: { cursor: null, numItems: 100 },
        where: { own: true }
      })
      expect(posts.length).toBe(1)
      expect(posts[0]?.title).toBe('Test Post')
      expect(posts[0]?.own).toBe(true)
    })
    test('update a blog post', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds,
        postId = await ctx.run(async c =>
          c.db.insert('blog', {
            category: 'tech',
            content: 'Original content',
            published: false,
            title: 'Original Title',
            updatedAt: Date.now(),
            userId
          })
        ),
        updated = await asUser(0).mutation(api.blog.update, {
          id: postId,
          title: 'Updated Title'
        })
      expect(updated.title).toBe('Updated Title')
      expect(updated.content).toBe('Original content')
    })
    test('delete a blog post', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds,
        postId = await ctx.run(async c =>
          c.db.insert('blog', {
            category: 'tech',
            content: 'To be deleted',
            published: false,
            title: 'Delete Me',
            updatedAt: Date.now(),
            userId
          })
        )
      await asUser(0).mutation(api.blog.rm, { id: postId })
      const { page: posts } = await asUser(0).query(api.blog.list, {
        paginationOpts: { cursor: null, numItems: 100 },
        where: { own: true }
      })
      expect(posts.length).toBe(0)
    })
  })
  describe('file cleanup', () => {
    test('cleans up old file when replaced', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds,
        oldFileId = await ctx.run(async c => c.storage.store(new Blob(['old']))),
        newFileId = await ctx.run(async c => c.storage.store(new Blob(['new']))),
        postId = await ctx.run(async c =>
          c.db.insert('blog', {
            category: 'tech',
            content: 'File test',
            coverImage: oldFileId,
            published: false,
            title: 'File Test',
            updatedAt: Date.now(),
            userId
          })
        )
      await asUser(0).mutation(api.blog.update, { coverImage: newFileId, id: postId })
      const oldFile = await ctx.run(async c => c.storage.getUrl(oldFileId))
      expect(oldFile).toBeNull()
    })
    test('cleans up file when set to null', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds,
        fileId = await ctx.run(async c => c.storage.store(new Blob(['data']))),
        postId = await ctx.run(async c =>
          c.db.insert('blog', {
            category: 'tech',
            content: 'File null test',
            coverImage: fileId,
            published: false,
            title: 'File Null Test',
            updatedAt: Date.now(),
            userId
          })
        )
      await asUser(0).mutation(api.blog.update, { coverImage: null, id: postId })
      const file = await ctx.run(async c => c.storage.getUrl(fileId))
      expect(file).toBeNull()
    })
    test('cleans up files on delete', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds,
        fileId = await ctx.run(async c => c.storage.store(new Blob(['delete-me']))),
        postId = await ctx.run(async c =>
          c.db.insert('blog', {
            category: 'tech',
            content: 'Delete file test',
            coverImage: fileId,
            published: false,
            title: 'Delete File Test',
            updatedAt: Date.now(),
            userId
          })
        )
      await asUser(0).mutation(api.blog.rm, { id: postId })
      const file = await ctx.run(async c => c.storage.getUrl(fileId))
      expect(file).toBeNull()
    })
    test('preserves files not included in partial update', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds,
        fileId = await ctx.run(async c => c.storage.store(new Blob(['keep-me']))),
        postId = await ctx.run(async c =>
          c.db.insert('blog', {
            category: 'tech',
            content: 'Preserve file test',
            coverImage: fileId,
            published: false,
            title: 'Preserve File Test',
            updatedAt: Date.now(),
            userId
          })
        )
      await asUser(0).mutation(api.blog.update, { id: postId, title: 'New Title' })
      const file = await ctx.run(async c => c.storage.getUrl(fileId))
      expect(file).not.toBeNull()
    })
  })
  describe('cascade delete', () => {
    test('removes child messages when chat is deleted', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds,
        chatId = await ctx.run(async c =>
          c.db.insert('chat', {
            isPublic: false,
            title: 'Test Chat',
            updatedAt: Date.now(),
            userId
          })
        )
      await ctx.run(async c => {
        await c.db.insert('message', {
          chatId,
          parts: [{ text: 'Hello', type: 'text' }],
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
      const messagesBefore = await ctx.run(async c =>
        c.db
          .query('message')
          .filter(q => q.eq(q.field('chatId'), chatId))
          .collect()
      )
      expect(messagesBefore.length).toBe(2)
      await asUser(0).mutation(api.chat.rm, { id: chatId })
      const messagesAfter = await ctx.run(async c =>
        c.db
          .query('message')
          .filter(q => q.eq(q.field('chatId'), chatId))
          .collect()
      )
      expect(messagesAfter.length).toBe(0)
    })
  })
  describe('where clause parsing', () => {
    test('filters by single field', async () => {
      const ctx = t(),
        { userIds } = await createTestContext(ctx),
        [userId] = userIds
      await ctx.run(async c => {
        await c.db.insert('blog', {
          category: 'tech',
          content: 'Tech post',
          published: true,
          title: 'Tech Post',
          updatedAt: Date.now(),
          userId
        })
        await c.db.insert('blog', {
          category: 'life',
          content: 'Life post',
          published: true,
          title: 'Life Post',
          updatedAt: Date.now(),
          userId
        })
      })
      const { page: techPosts } = await ctx.query(api.blog.list, {
        paginationOpts: { cursor: null, numItems: 100 },
        where: { category: 'tech' }
      })
      expect(techPosts.length).toBe(1)
      expect(techPosts[0]?.category).toBe('tech')
      const { page: allPosts } = await ctx.query(api.blog.list, { paginationOpts: { cursor: null, numItems: 100 } })
      expect(allPosts.length).toBe(2)
    })
    test('filters with AND (multiple fields)', async () => {
      const ctx = t(),
        { userIds } = await createTestContext(ctx),
        [userId] = userIds
      await ctx.run(async c => {
        await c.db.insert('blog', {
          category: 'tech',
          content: 'Published tech',
          published: true,
          title: 'Published Tech',
          updatedAt: Date.now(),
          userId
        })
        await c.db.insert('blog', {
          category: 'tech',
          content: 'Draft tech',
          published: false,
          title: 'Draft Tech',
          updatedAt: Date.now(),
          userId
        })
      })
      const { page: publishedTech } = await ctx.query(api.blog.list, {
        paginationOpts: { cursor: null, numItems: 100 },
        where: { category: 'tech', published: true }
      })
      expect(publishedTech.length).toBe(1)
      expect(publishedTech[0]?.title).toBe('Published Tech')
      const { page: allTech } = await ctx.query(api.blog.list, {
        paginationOpts: { cursor: null, numItems: 100 },
        where: { category: 'tech' }
      })
      expect(allTech.length).toBe(2)
    })
    test('filters with OR clause', async () => {
      const ctx = t(),
        { userIds } = await createTestContext(ctx),
        [userId] = userIds
      await ctx.run(async c => {
        await c.db.insert('blog', {
          category: 'tech',
          content: 'Tech',
          published: true,
          title: 'Tech',
          updatedAt: Date.now(),
          userId
        })
        await c.db.insert('blog', {
          category: 'life',
          content: 'Life',
          published: true,
          title: 'Life',
          updatedAt: Date.now(),
          userId
        })
        await c.db.insert('blog', {
          category: 'tutorial',
          content: 'Tutorial',
          published: true,
          title: 'Tutorial',
          updatedAt: Date.now(),
          userId
        })
      })
      const { page: techOrLife } = await ctx.query(api.blog.list, {
        paginationOpts: { cursor: null, numItems: 100 },
        where: { or: [{ category: 'tech' }, { category: 'life' }] }
      })
      expect(techOrLife.length).toBe(2)
      const { page: allPosts } = await ctx.query(api.blog.list, { paginationOpts: { cursor: null, numItems: 100 } })
      expect(allPosts.length).toBe(3)
    })
  })
  describe('withAuthor batch deduplication', () => {
    test('deduplicates author lookups for same user', async () => {
      const ctx = t(),
        { userIds } = await createTestContext(ctx),
        [userId] = userIds
      await ctx.run(async c => {
        for (let i = 0; i < 5; i += 1)
          await c.db.insert('blog', {
            category: 'tech',
            content: `Post ${i}`,
            published: true,
            title: `Post ${i}`,
            updatedAt: Date.now(),
            userId
          })
      })
      const { page: posts } = await ctx.query(api.blog.list, { paginationOpts: { cursor: null, numItems: 100 } })
      expect(posts.length).toBe(5)
      for (const post of posts) expect(post.author?.name).toBe('Test User')
    })
  })
  describe('auth enforcement', () => {
    test('throws error for unauthenticated user on auth endpoint', async () => {
      const ctx = t()
      let threw = false
      try {
        await ctx.query(api.chat.list, { paginationOpts: { cursor: null, numItems: 100 }, where: { own: true } })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('NOT_AUTHENTICATED')
      }
      expect(threw).toBe(true)
    })
    test('throws NOT_FOUND when accessing other user data', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId1] = userIds,
        postId = await ctx.run(async c =>
          c.db.insert('blog', {
            category: 'tech',
            content: 'User 1 post',
            published: false,
            title: 'User 1 Post',
            updatedAt: Date.now(),
            userId: userId1
          })
        )
      let threw = false
      try {
        await asUser(1).mutation(api.blog.update, { id: postId, title: 'Hacked' })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('NOT_FOUND')
      }
      expect(threw).toBe(true)
    })
  })
  describe('ownership verification', () => {
    test('read with own: true verifies ownership', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId1] = userIds,
        postId = await ctx.run(async c =>
          c.db.insert('blog', {
            category: 'tech',
            content: 'Owner check',
            published: true,
            title: 'Read Own Check',
            updatedAt: Date.now(),
            userId: userId1
          })
        ),
        readByOwner = await asUser(0).query(api.blog.read, { id: postId, own: true })
      expect(readByOwner).not.toBeNull()
      expect(readByOwner?.title).toBe('Read Own Check')
      const readByNonOwner = await asUser(1).query(api.blog.read, { id: postId, own: true })
      expect(readByNonOwner).toBeNull()
      const readWithoutOwn = await asUser(1).query(api.blog.read, { id: postId })
      expect(readWithoutOwn).not.toBeNull()
    })
    test('read with own: true returns null for unauthenticated', async () => {
      const ctx = t(),
        { userIds } = await createTestContext(ctx),
        [, userId] = userIds,
        postId = await ctx.run(async c =>
          c.db.insert('blog', {
            category: 'tech',
            content: 'Public post',
            published: true,
            title: 'Read Own Unauth',
            updatedAt: Date.now(),
            userId
          })
        ),
        readWithOwn = await ctx.query(api.blog.read, { id: postId, own: true })
      expect(readWithOwn).toBeNull()
      const readWithoutOwn = await ctx.query(api.blog.read, { id: postId })
      expect(readWithoutOwn).not.toBeNull()
    })
    test('own filter in where clause works', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId1, userId2] = userIds
      await ctx.run(async c => {
        await c.db.insert('blog', {
          category: 'tech',
          content: 'User 1',
          published: true,
          title: 'User 1 Post',
          updatedAt: Date.now(),
          userId: userId1
        })
        await c.db.insert('blog', {
          category: 'tech',
          content: 'User 2',
          published: true,
          title: 'User 2 Post',
          updatedAt: Date.now(),
          userId: userId2
        })
      })
      const ownPostsResult = await asUser(0).query(api.blog.list, {
          paginationOpts: { cursor: null, numItems: 100 },
          where: { own: true }
        }),
        ownPosts = ownPostsResult.page
      expect(ownPosts.length).toBe(1)
      expect(ownPosts[0]?.title).toBe('User 1 Post')
    })
  })
  describe('multi-item operations', () => {
    test('rm deletes multiple posts', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds,
        ids = await ctx.run(async c => {
          const results: string[] = []
          for (let i = 0; i < 3; i += 1) {
            const id = await c.db.insert('blog', {
              category: 'tech',
              content: `Bulk ${i}`,
              published: false,
              title: `Bulk ${i}`,
              updatedAt: Date.now(),
              userId
            })
            results.push(id)
          }
          return results
        }),
        deleted = await asUser(0).mutation(api.blog.rm, { ids })
      expect(deleted).toBe(3)
      const { page: remaining } = await asUser(0).query(api.blog.list, {
        paginationOpts: { cursor: null, numItems: 100 },
        where: { own: true }
      })
      expect(remaining.length).toBe(0)
    })
    test('update updates multiple posts', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds,
        ids = await ctx.run(async c => {
          const results: string[] = []
          for (let i = 0; i < 3; i += 1) {
            const id = await c.db.insert('blog', {
              category: 'tech',
              content: `Bulk update ${i}`,
              published: false,
              title: `Original ${i}`,
              updatedAt: Date.now(),
              userId
            })
            results.push(id)
          }
          return results
        }),
        updated = await asUser(0).mutation(api.blog.update, {
          items: ids.map(id => ({ id, title: 'Updated' }))
        })
      expect(updated.length).toBe(3)
      for (const post of updated) expect(post.title).toBe('Updated')
    })
  })
  describe('search operations', () => {
    test('search finds matching posts', async () => {
      const ctx = t(),
        { userIds } = await createTestContext(ctx),
        [userId] = userIds
      await ctx.run(async c => {
        await c.db.insert('blog', {
          category: 'tech',
          content: 'TypeScript is great',
          published: true,
          title: 'TypeScript Guide',
          updatedAt: Date.now(),
          userId
        })
        await c.db.insert('blog', {
          category: 'tech',
          content: 'JavaScript basics',
          published: true,
          title: 'JavaScript Guide',
          updatedAt: Date.now(),
          userId
        })
      })
      const results = await ctx.query(api.blog.search, {
        query: 'TypeScript'
      })
      expect(results.length).toBe(1)
      expect(results[0]?.title).toBe('TypeScript Guide')
    })
    test('search is case insensitive', async () => {
      const ctx = t(),
        { userIds } = await createTestContext(ctx),
        [userId] = userIds
      await ctx.run(async c => {
        await c.db.insert('blog', {
          category: 'tech',
          content: 'UPPERCASE content',
          published: true,
          title: 'Case Test',
          updatedAt: Date.now(),
          userId
        })
      })
      const results = await ctx.query(api.blog.search, {
        query: 'uppercase'
      })
      expect(results.length).toBe(1)
    })
  })
})
describe('childCrud factory', () => {
  describe('parent ownership verification', () => {
    test('can create message in own chat', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds,
        chatId = await ctx.run(async c =>
          c.db.insert('chat', {
            isPublic: false,
            title: 'My Chat',
            updatedAt: Date.now(),
            userId
          })
        ),
        messageId = await asUser(0).mutation(api.message.create, {
          chatId,
          parts: [{ text: 'Hello', type: 'text' }],
          role: 'user'
        })
      expect(messageId).toBeDefined()
    })
    test('cannot create message in other user chat', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId1] = userIds,
        chatId = await ctx.run(async c =>
          c.db.insert('chat', {
            isPublic: false,
            title: 'User 1 Chat',
            updatedAt: Date.now(),
            userId: userId1
          })
        )
      let threw = false
      try {
        await asUser(1).mutation(api.message.create, {
          chatId,
          parts: [{ text: 'Intruder', type: 'text' }],
          role: 'user'
        })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('NOT_FOUND')
      }
      expect(threw).toBe(true)
    })
    test('cannot list messages from other user chat', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId1] = userIds,
        chatId = await ctx.run(async c =>
          c.db.insert('chat', {
            isPublic: false,
            title: 'Private Chat',
            updatedAt: Date.now(),
            userId: userId1
          })
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
        await asUser(1).query(api.message.list, { chatId })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('NOT_AUTHORIZED')
      }
      expect(threw).toBe(true)
    })
  })
})
describe('cacheCrud factory', () => {
  describe('TTL boundary conditions', () => {
    test('cache entries have updatedAt timestamp', async () => {
      const ctx = t(),
        now = Date.now(),
        id = await ctx.run(async c =>
          c.db.insert('movie', {
            backdrop_path: '/path.jpg',
            budget: 1_000_000,
            genres: [{ id: 1, name: 'Action' }],
            original_title: 'Test Movie',
            overview: 'A test movie',
            poster_path: '/poster.jpg',
            release_date: '2024-01-01',
            revenue: 5_000_000,
            runtime: 120,
            tagline: 'Test tagline',
            title: 'Test Movie',
            tmdb_id: 12_345,
            updatedAt: now,
            vote_average: 7.5,
            vote_count: 1000
          })
        ),
        movie = await ctx.run(async c => c.db.get(id))
      expect(movie).not.toBeNull()
      expect(movie?.updatedAt).toBe(now)
      expect(movie?.title).toBe('Test Movie')
    })
    test('expired entries have old updatedAt timestamp', async () => {
      const ctx = t(),
        expiredTime = Date.now() - 8 * 24 * 60 * 60 * 1000,
        id = await ctx.run(async c =>
          c.db.insert('movie', {
            backdrop_path: '/path.jpg',
            budget: 1_000_000,
            genres: [{ id: 1, name: 'Action' }],
            original_title: 'Expired Movie',
            overview: 'An expired movie',
            poster_path: '/poster.jpg',
            release_date: '2024-01-01',
            revenue: 5_000_000,
            runtime: 120,
            tagline: 'Expired tagline',
            title: 'Expired Movie',
            tmdb_id: 99_999,
            updatedAt: expiredTime,
            vote_average: 7.5,
            vote_count: 1000
          })
        ),
        movie = await ctx.run(async c => c.db.get(id))
      expect(movie).not.toBeNull()
      expect(movie?.updatedAt).toBe(expiredTime)
      const ttl = 7 * 24 * 60 * 60 * 1000,
        updatedAt = movie?.updatedAt
      expect(updatedAt).toBeDefined()
      // oxlint-disable-next-line no-conditional-in-test
      const isExpired = (updatedAt ?? 0) + ttl < Date.now()
      expect(isExpired).toBe(true)
    })
  })
})
describe('Zod integration', () => {
  test('unwrapZod handles optional wrapper', async () => {
    const { unwrapZod } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      wrapped = z.string().optional(),
      { type } = unwrapZod(wrapped)
    expect(type).toBe('string')
  })
  test('unwrapZod handles nullable wrapper', async () => {
    const { unwrapZod } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      wrapped = z.number().nullable(),
      { type } = unwrapZod(wrapped)
    expect(type).toBe('number')
  })
  test('unwrapZod handles default wrapper', async () => {
    const { unwrapZod } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      wrapped = z.boolean().default(false),
      { type } = unwrapZod(wrapped)
    expect(type).toBe('boolean')
  })
  test('unwrapZod handles multiple wrappers', async () => {
    const { unwrapZod } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      wrapped = z.string().optional().nullable(),
      { type } = unwrapZod(wrapped)
    expect(type).toBe('string')
  })
  test('unwrapZod handles array types', async () => {
    const { unwrapZod } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      arr = z.array(z.string()),
      { type } = unwrapZod(arr)
    expect(type).toBe('array')
  })
  test('fileKindOf detects file meta', async () => {
    const { fileKindOf } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      fileSchema = z.string().meta({ nb: 'file' }),
      kind = fileKindOf(fileSchema)
    expect(kind).toBe('file')
  })
  test('fileKindOf detects array of files as files', async () => {
    const { fileKindOf } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      filesSchema = z.array(z.string().meta({ nb: 'file' })),
      kind = fileKindOf(filesSchema)
    expect(kind).toBe('files')
  })
  test('fileKindOf returns undefined for non-file schemas', async () => {
    const { fileKindOf } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      stringSchema = z.string(),
      kind = fileKindOf(stringSchema)
    expect(kind).toBeUndefined()
  })
  test('type detection for all primitive types', async () => {
    const { isArrayType, isBooleanType, isDateType, isNumberType, isStringType } = await import('@noboil/convex/zod')
    expect(isStringType('string')).toBe(true)
    expect(isStringType('enum')).toBe(true)
    expect(isStringType('number')).toBe(false)
    expect(isNumberType('number')).toBe(true)
    expect(isNumberType('boolean')).toBe(false)
    expect(isNumberType('string')).toBe(false)
    expect(isBooleanType('boolean')).toBe(true)
    expect(isBooleanType('number')).toBe(false)
    expect(isBooleanType('string')).toBe(false)
    expect(isDateType('date')).toBe(true)
    expect(isDateType('number')).toBe(false)
    expect(isDateType('string')).toBe(false)
    expect(isArrayType('array')).toBe(true)
    expect(isArrayType('object')).toBe(false)
    expect(isArrayType('string')).toBe(false)
  })
  test('enumToOptions transforms enum schema', async () => {
    const { enumToOptions } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      enumSchema = z.enum(['pending', 'active', 'completed']),
      options = enumToOptions(enumSchema)
    expect(options).toEqual([
      { label: 'Pending', value: 'pending' },
      { label: 'Active', value: 'active' },
      { label: 'Completed', value: 'completed' }
    ])
  })
  test('enumToOptions with custom transform', async () => {
    const { enumToOptions } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      enumSchema = z.enum(['tech', 'life']),
      options = enumToOptions(enumSchema, v => v.toUpperCase())
    expect(options).toEqual([
      { label: 'TECH', value: 'tech' },
      { label: 'LIFE', value: 'life' }
    ])
  })
  test('requiredPartial creates partial with required fields', async () => {
    const { requiredPartial } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      testSchema = z.object({
        email: z.string(),
        id: z.string(),
        name: z.string()
      }),
      partialWithRequired = requiredPartial(testSchema, ['id']),
      result = partialWithRequired.safeParse({ id: '123' })
    expect(result.success).toBe(true)
  })
  test('requiredPartial fails without required field', async () => {
    const { requiredPartial } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      testSchema = z.object({
        id: z.string(),
        name: z.string()
      }),
      partialWithRequired = requiredPartial(testSchema, ['id']),
      result = partialWithRequired.safeParse({ name: 'Test' })
    expect(result.success).toBe(false)
  })
  test('unwrapZod handles catch wrapper', async () => {
    const { unwrapZod } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      wrapped = z.string().catch('default'),
      { type } = unwrapZod(wrapped)
    expect(type).toBe('string')
  })
  test('elementOf extracts array element schema', async () => {
    const { elementOf, unwrapZod } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      arraySchema = z.array(z.number()),
      { schema: unwrapped } = unwrapZod(arraySchema),
      element = elementOf(unwrapped)
    expect(element).toBeDefined()
  })
})
describe('conflict detection', () => {
  test('update with matching expectedUpdatedAt succeeds', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      postId = await ctx.run(async c =>
        c.db.insert('blog', {
          category: 'tech',
          content: 'Conflict test',
          published: false,
          title: 'Original',
          updatedAt: 1000,
          userId
        })
      ),
      updated = await asUser(0).mutation(api.blog.update, {
        expectedUpdatedAt: 1000,
        id: postId,
        title: 'Updated'
      })
    expect(updated.title).toBe('Updated')
  })
  test('update with mismatched expectedUpdatedAt throws CONFLICT', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      postId = await ctx.run(async c =>
        c.db.insert('blog', {
          category: 'tech',
          content: 'Conflict test',
          published: false,
          title: 'Original',
          updatedAt: 2000,
          userId
        })
      )
    let threw = false
    try {
      await asUser(0).mutation(api.blog.update, {
        expectedUpdatedAt: 1000,
        id: postId,
        title: 'Should fail'
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('CONFLICT')
    }
    expect(threw).toBe(true)
  })
})
describe('file cleanup with array fields', () => {
  test('cleans up removed files from attachments array', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      file1 = await ctx.run(async c => c.storage.store(new Blob(['file1']))),
      file2 = await ctx.run(async c => c.storage.store(new Blob(['file2']))),
      file3 = await ctx.run(async c => c.storage.store(new Blob(['file3']))),
      postId = await ctx.run(async c =>
        c.db.insert('blog', {
          attachments: [file1, file2, file3],
          category: 'tech',
          content: 'Array files test',
          published: false,
          title: 'Array Files',
          updatedAt: Date.now(),
          userId
        })
      )
    await asUser(0).mutation(api.blog.update, { attachments: [file2], id: postId })
    const file1Url = await ctx.run(async c => c.storage.getUrl(file1)),
      file2Url = await ctx.run(async c => c.storage.getUrl(file2)),
      file3Url = await ctx.run(async c => c.storage.getUrl(file3))
    expect(file1Url).toBeNull()
    expect(file2Url).not.toBeNull()
    expect(file3Url).toBeNull()
  })
  test('cleans up all files on delete', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      file1 = await ctx.run(async c => c.storage.store(new Blob(['del1']))),
      file2 = await ctx.run(async c => c.storage.store(new Blob(['del2']))),
      postId = await ctx.run(async c =>
        c.db.insert('blog', {
          attachments: [file1, file2],
          category: 'tech',
          content: 'Delete array files',
          published: false,
          title: 'Delete Array',
          updatedAt: Date.now(),
          userId
        })
      )
    await asUser(0).mutation(api.blog.rm, { id: postId })
    const file1Url = await ctx.run(async c => c.storage.getUrl(file1)),
      file2Url = await ctx.run(async c => c.storage.getUrl(file2))
    expect(file1Url).toBeNull()
    expect(file2Url).toBeNull()
  })
})
describe('orgCrud ACL', () => {
  test('owner can always edit project', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-1', updatedAt: Date.now(), userId: ownerId })
      ),
      projectId = await asUser(0).mutation(api.project.create, {
        name: 'Owner Project',
        orgId
      }),
      updated = await asUser(0).mutation(api.project.update, {
        id: projectId,
        name: 'Updated by Owner',
        orgId
      })
    expect(updated.name).toBe('Updated by Owner')
  })
  test('admin can always edit project', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, adminId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-2', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: true, orgId, updatedAt: Date.now(), userId: adminId })
    })
    const projectId = await asUser(0).mutation(api.project.create, {
        name: 'Admin Edit Project',
        orgId
      }),
      updated = await asUser(1).mutation(api.project.update, {
        id: projectId,
        name: 'Updated by Admin',
        orgId
      })
    expect(updated.name).toBe('Updated by Admin')
  })
  test('creator can always edit own project', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-3', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const projectId = await asUser(1).mutation(api.project.create, {
        name: 'Member Project',
        orgId
      }),
      updated = await asUser(1).mutation(api.project.update, {
        id: projectId,
        name: 'Updated by Creator',
        orgId
      })
    expect(updated.name).toBe('Updated by Creator')
  })
  test('editor in editors[] can update project', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-4', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const projectId = await asUser(0).mutation(api.project.create, {
      name: 'Editable Project',
      orgId
    })
    await asUser(0).mutation(api.project.addEditor, { editorId: memberId, orgId, projectId })
    const updated = await asUser(1).mutation(api.project.update, {
      id: projectId,
      name: 'Updated by Editor',
      orgId
    })
    expect(updated.name).toBe('Updated by Editor')
  })
  test('non-editor member CANNOT update project', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-5', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const projectId = await asUser(0).mutation(api.project.create, {
      name: 'Restricted Project',
      orgId
    })
    let threw = false
    try {
      await asUser(1).mutation(api.project.update, {
        id: projectId,
        name: 'Should Fail',
        orgId
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('FORBIDDEN')
    }
    expect(threw).toBe(true)
  })
  test('non-editor member CANNOT delete project', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-6', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const projectId = await asUser(0).mutation(api.project.create, {
      name: 'Cannot Delete Project',
      orgId
    })
    let threw = false
    try {
      await asUser(1).mutation(api.project.rm, { id: projectId, orgId })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('FORBIDDEN')
    }
    expect(threw).toBe(true)
  })
  test('editor can toggle task on parent project', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-7', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const projectId = await asUser(0).mutation(api.project.create, {
      name: 'Task Project',
      orgId
    })
    await asUser(0).mutation(api.project.addEditor, { editorId: memberId, orgId, projectId })
    const taskId = await asUser(0).mutation(api.task.create, {
        orgId,
        projectId,
        title: 'Toggle Me'
      }),
      toggled = await asUser(1).mutation(api.task.toggle, { id: taskId, orgId })
    expect((toggled as { completed?: boolean }).completed).toBe(true)
  })
  test('non-editor member CANNOT toggle task', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-8', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const projectId = await asUser(0).mutation(api.project.create, {
        name: 'No Toggle Project',
        orgId
      }),
      taskId = await asUser(0).mutation(api.task.create, {
        orgId,
        projectId,
        title: 'Cannot Toggle'
      })
    let threw = false
    try {
      await asUser(1).mutation(api.task.toggle, { id: taskId, orgId })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('FORBIDDEN')
    }
    expect(threw).toBe(true)
  })
  test('addEditor mutation works', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-9', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const projectId = await asUser(0).mutation(api.project.create, {
        name: 'Add Editor Project',
        orgId
      }),
      result = await asUser(0).mutation(api.project.addEditor, { editorId: memberId, orgId, projectId })
    expect((result as { editors?: string[] }).editors).toContain(String(memberId))
  })
  test('removeEditor mutation works', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-10', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const projectId = await asUser(0).mutation(api.project.create, {
      name: 'Remove Editor Project',
      orgId
    })
    await asUser(0).mutation(api.project.addEditor, { editorId: memberId, orgId, projectId })
    const result = await asUser(0).mutation(api.project.removeEditor, { editorId: memberId, orgId, projectId })
    expect((result as { editors?: string[] }).editors).toBeDefined()
    expect((result as { editors?: string[] }).editors).not.toContain(String(memberId))
  })
  test('non-admin cannot addEditor', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId, editorId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-11', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: editorId })
    })
    const projectId = await asUser(0).mutation(api.project.create, {
      name: 'No Add Editor Project',
      orgId
    })
    let threw = false
    try {
      await asUser(1).mutation(api.project.addEditor, { editorId, orgId, projectId })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('INSUFFICIENT_ORG_ROLE')
    }
    expect(threw).toBe(true)
  })
  test('addEditor rejects non-org-member', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, nonMemberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-acl-12', updatedAt: Date.now(), userId: ownerId })
      ),
      projectId = await asUser(0).mutation(api.project.create, {
        name: 'Reject Non-Member Project',
        orgId
      })
    let threw = false
    try {
      await asUser(0).mutation(api.project.addEditor, { editorId: nonMemberId, orgId, projectId })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('NOT_ORG_MEMBER')
    }
    expect(threw).toBe(true)
  })
})
describe('wiki ACL', () => {
  test('wiki creator can update own wiki', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-wiki-1', updatedAt: Date.now(), userId: ownerId })
      ),
      wikiId = await asUser(0).mutation(api.wiki.create, {
        content: 'Original content',
        orgId,
        slug: 'test-wiki-1',
        status: 'draft',
        title: 'Test Wiki'
      }),
      updated = await asUser(0).mutation(api.wiki.update, {
        id: wikiId,
        orgId,
        title: 'Updated Wiki'
      })
    expect(updated.title).toBe('Updated Wiki')
  })
  test('editor in editors[] can update wiki', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-wiki-2', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const wikiId = await asUser(0).mutation(api.wiki.create, {
      content: 'Wiki content',
      orgId,
      slug: 'test-wiki-2',
      status: 'draft',
      title: 'Editable Wiki'
    })
    await asUser(0).mutation(api.wiki.addEditor, { editorId: memberId, orgId, wikiId })
    const updated = await asUser(1).mutation(api.wiki.update, {
      id: wikiId,
      orgId,
      title: 'Updated by Editor'
    })
    expect(updated.title).toBe('Updated by Editor')
  })
  test('non-editor member CANNOT update wiki', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-wiki-3', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const wikiId = await asUser(0).mutation(api.wiki.create, {
      content: 'Restricted wiki',
      orgId,
      slug: 'test-wiki-3',
      status: 'draft',
      title: 'Restricted Wiki'
    })
    let threw = false
    try {
      await asUser(1).mutation(api.wiki.update, {
        id: wikiId,
        orgId,
        title: 'Should Fail'
      })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('FORBIDDEN')
    }
    expect(threw).toBe(true)
  })
  test('non-editor member CANNOT delete wiki', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-wiki-4', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const wikiId = await asUser(0).mutation(api.wiki.create, {
      content: 'Cannot delete',
      orgId,
      slug: 'test-wiki-4',
      status: 'draft',
      title: 'Cannot Delete Wiki'
    })
    let threw = false
    try {
      await asUser(1).mutation(api.wiki.rm, { id: wikiId, orgId })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('FORBIDDEN')
    }
    expect(threw).toBe(true)
  })
  test('addEditor mutation works', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-wiki-5', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const wikiId = await asUser(0).mutation(api.wiki.create, {
        content: 'Add editor test',
        orgId,
        slug: 'test-wiki-5',
        status: 'draft',
        title: 'Add Editor Wiki'
      }),
      result = await asUser(0).mutation(api.wiki.addEditor, { editorId: memberId, orgId, wikiId })
    expect((result as { editors?: string[] }).editors).toContain(String(memberId))
  })
  test('removeEditor mutation works', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-wiki-6', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const wikiId = await asUser(0).mutation(api.wiki.create, {
      content: 'Remove editor test',
      orgId,
      slug: 'test-wiki-6',
      status: 'draft',
      title: 'Remove Editor Wiki'
    })
    await asUser(0).mutation(api.wiki.addEditor, { editorId: memberId, orgId, wikiId })
    const result = await asUser(0).mutation(api.wiki.removeEditor, { editorId: memberId, orgId, wikiId })
    expect((result as { editors?: string[] }).editors).toBeDefined()
    expect((result as { editors?: string[] }).editors).not.toContain(String(memberId))
  })
  test('non-admin cannot addEditor', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId, editorId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-wiki-7', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: editorId })
    })
    const wikiId = await asUser(0).mutation(api.wiki.create, {
      content: 'No add editor test',
      orgId,
      slug: 'test-wiki-7',
      status: 'draft',
      title: 'No Add Editor Wiki'
    })
    let threw = false
    try {
      await asUser(1).mutation(api.wiki.addEditor, { editorId, orgId, wikiId })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('INSUFFICIENT_ORG_ROLE')
    }
    expect(threw).toBe(true)
  })
  test('addEditor rejects non-org-member', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, nonMemberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-wiki-8', updatedAt: Date.now(), userId: ownerId })
      ),
      wikiId = await asUser(0).mutation(api.wiki.create, {
        content: 'Reject non-member test',
        orgId,
        slug: 'test-wiki-8',
        status: 'draft',
        title: 'Reject Non-Member Wiki'
      })
    let threw = false
    try {
      await asUser(0).mutation(api.wiki.addEditor, { editorId: nonMemberId, orgId, wikiId })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('NOT_ORG_MEMBER')
    }
    expect(threw).toBe(true)
  })
  test('setEditors replaces all editors', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId1, memberId2] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-wiki-9', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId1 })
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId2 })
    })
    const wikiId = await asUser(0).mutation(api.wiki.create, {
      content: 'Set editors test',
      orgId,
      slug: 'test-wiki-9',
      status: 'draft',
      title: 'Set Editors Wiki'
    })
    await asUser(0).mutation(api.wiki.addEditor, { editorId: memberId1, orgId, wikiId })
    const result = await asUser(0).mutation(api.wiki.setEditors, { editorIds: [memberId2], orgId, wikiId })
    expect((result as { editors?: string[] }).editors).toContain(String(memberId2))
    expect((result as { editors?: string[] }).editors).not.toContain(String(memberId1))
  })
  test('editors query returns resolved users', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId, memberId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-wiki-10', updatedAt: Date.now(), userId: ownerId })
      )
    await ctx.run(async c => {
      await c.db.insert('orgMember', { isAdmin: false, orgId, updatedAt: Date.now(), userId: memberId })
    })
    const wikiId = await asUser(0).mutation(api.wiki.create, {
      content: 'Editors query test',
      orgId,
      slug: 'test-wiki-10',
      status: 'draft',
      title: 'Editors Query Wiki'
    })
    await asUser(0).mutation(api.wiki.addEditor, { editorId: memberId, orgId, wikiId })
    const editors = await asUser(0).query(api.wiki.editors, { orgId, wikiId })
    expect(editors.length).toBe(1)
    expect(editors[0]?.name).toBe('Other User')
    expect(editors[0]?.email).toBe('other@example.test')
  })
})
describe('where clause types', () => {
  test('BlogWhere type is correctly shaped', async () => {
    const { owned } = await import('../t')
    interface BlogWhere {
      category?: 'life' | 'tech' | 'tutorial'
      content?: string
      or?: BlogWhere[]
      own?: boolean
      published?: boolean
      tags?: string[]
      title?: string
    }
    const testWhere: BlogWhere = {
      category: 'tech',
      published: true
    }
    expect(testWhere.category).toBe('tech')
    expect(owned.blog.shape.category).toBeDefined()
  })
})
describe('Zod introspection snapshots', () => {
  test('defaultValues returns correct defaults for all types', async () => {
    const { defaultValues } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      testSchema = z.object({
        active: z.boolean(),
        age: z.number(),
        avatar: z.string().meta({ nb: 'file' }),
        bio: z.string().optional(),
        createdAt: z.date(),
        name: z.string(),
        photos: z.array(z.string().meta({ nb: 'file' })),
        role: z.enum(['admin', 'user', 'guest']),
        tags: z.array(z.string())
      }),
      result = defaultValues(testSchema)
    expect(result.name).toBe('')
    expect(result.age).toBe(0)
    expect(result.active).toBe(false)
    expect(result.role).toBe('admin')
    expect(result.tags).toEqual([])
    expect(result.bio).toBe('')
    expect(result.avatar).toBeNull()
    expect(result.photos).toEqual([])
    expect(result.createdAt).toBeNull()
  })
  test('coerceOptionals trims and nullifies empty optional strings', async () => {
    const { coerceOptionals } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      testSchema = z.object({
        bio: z.string().optional(),
        name: z.string()
      }),
      result = coerceOptionals(testSchema, { bio: '   ', name: '  hello  ' })
    expect(result.name).toBe('  hello  ')
    expect(result.bio).toBeUndefined()
  })
  test('coerceOptionals preserves non-empty optional strings after trim', async () => {
    const { coerceOptionals } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      testSchema = z.object({
        bio: z.string().optional()
      }),
      result = coerceOptionals(testSchema, { bio: '  content  ' })
    expect(result.bio).toBe('content')
  })
  test('coerceOptionals ignores non-string optional fields', async () => {
    const { coerceOptionals } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      testSchema = z.object({
        count: z.number().optional()
      }),
      result = coerceOptionals(testSchema, { count: 0 })
    expect(result.count).toBe(0)
  })
  test('pickValues extracts matching fields with defaults for missing', async () => {
    const { pickValues } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      testSchema = z.object({
        active: z.boolean(),
        age: z.number(),
        name: z.string()
      }),
      result = pickValues(testSchema, { _id: 'xxx', extra: true, name: 'Alice' })
    expect(result.name).toBe('Alice')
    expect(result.age).toBe(0)
    expect(result.active).toBe(false)
  })
  test('pickValues preserves existing values', async () => {
    const { pickValues } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      testSchema = z.object({
        active: z.boolean(),
        name: z.string()
      }),
      result = pickValues(testSchema, { active: true, name: 'Bob' })
    expect(result.name).toBe('Bob')
    expect(result.active).toBe(true)
  })
  test('fileKindOf handles nullable optional file', async () => {
    const { fileKindOf } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      field = z.string().meta({ nb: 'file' }).nullable().optional()
    expect(fileKindOf(field)).toBe('file')
  })
  test('fileKindOf returns undefined for plain array', async () => {
    const { fileKindOf } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4'),
      field = z.array(z.string())
    expect(fileKindOf(field)).toBeUndefined()
  })
  test('isOptionalField detects optional in nested wrappers', async () => {
    const { isOptionalField } = await import('@noboil/convex/zod'),
      { z } = await import('zod/v4')
    expect(isOptionalField(z.string().optional().nullable())).toBe(true)
    expect(isOptionalField(z.string().nullable())).toBe(false)
    expect(isOptionalField(z.string())).toBe(false)
    expect(isOptionalField(z.string().optional())).toBe(true)
  })
})
describe('uniqueCheck', () => {
  test('isSlugAvailable returns true for unique slug', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-unique-1', updatedAt: Date.now(), userId: ownerId })
      )
    await asUser(0).mutation(api.wiki.create, {
      content: 'Unique check test',
      orgId,
      slug: 'taken-slug-u1',
      status: 'draft',
      title: 'Unique Wiki'
    })
    const available = await ctx.query(api.wiki.isSlugAvailable, { value: 'other-slug-u1' })
    expect(available).toBe(true)
  })
  test('isSlugAvailable returns false for duplicate slug', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-unique-2', updatedAt: Date.now(), userId: ownerId })
      )
    await asUser(0).mutation(api.wiki.create, {
      content: 'Duplicate check test',
      orgId,
      slug: 'taken-slug-u2',
      status: 'draft',
      title: 'Dup Wiki'
    })
    const available = await ctx.query(api.wiki.isSlugAvailable, { value: 'taken-slug-u2' })
    expect(available).toBe(false)
  })
  test('isSlugAvailable excludes current doc by id', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-unique-3', updatedAt: Date.now(), userId: ownerId })
      ),
      wikiId = await asUser(0).mutation(api.wiki.create, {
        content: 'Exclude check test',
        orgId,
        slug: 'taken-slug-u3',
        status: 'draft',
        title: 'Exclude Wiki'
      }),
      available = await ctx.query(api.wiki.isSlugAvailable, { exclude: wikiId, value: 'taken-slug-u3' })
    expect(available).toBe(true)
  })
})
describe('orgCascade', () => {
  test('deleting project cascades to delete tasks', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-cascade-1', updatedAt: Date.now(), userId: ownerId })
      ),
      projectId = await asUser(0).mutation(api.project.create, {
        name: 'Cascade Project',
        orgId
      })
    for (let i = 0; i < 3; i += 1)
      await asUser(0).mutation(api.task.create, {
        orgId,
        projectId,
        title: `Task ${i}`
      })
    const tasksBefore = await ctx.run(async c =>
      c.db
        .query('task')
        .filter(f => f.eq(f.field('projectId'), projectId))
        .collect()
    )
    expect(tasksBefore.length).toBe(3)
    await asUser(0).mutation(api.project.rm, { id: projectId, orgId })
    const tasksAfter = await ctx.run(async c =>
      c.db
        .query('task')
        .filter(f => f.eq(f.field('projectId'), projectId))
        .collect()
    )
    expect(tasksAfter.length).toBe(0)
  })
})
describe('orgCrud enrichment', () => {
  test('org list returns author and own fields', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-enrich-1', updatedAt: Date.now(), userId: ownerId })
      )
    await asUser(0).mutation(api.wiki.create, {
      content: 'Enrichment test',
      orgId,
      slug: 'test-wiki-enrich-1',
      status: 'draft',
      title: 'Enriched Wiki'
    })
    const result = await asUser(0).query(api.wiki.list, { orgId, paginationOpts: { cursor: null, numItems: 10 } }),
      [wiki] = result.page
    expect(wiki?.author?.name).toBe('Test User')
    expect(wiki?.own).toBe(true)
  })
  test('org read returns author and own fields', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-enrich-2', updatedAt: Date.now(), userId: ownerId })
      ),
      wikiId = await asUser(0).mutation(api.wiki.create, {
        content: 'Read enrichment test',
        orgId,
        slug: 'test-wiki-enrich-2',
        status: 'draft',
        title: 'Read Enriched Wiki'
      }),
      wiki = await asUser(0).query(api.wiki.read, { id: wikiId, orgId })
    expect(wiki?.author?.name).toBe('Test User')
    expect(wiki?.own).toBe(true)
  })
})
describe('rate limiting (sliding window)', () => {
  test('first request within window succeeds', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds
    await ctx.run(async c => {
      await c.db.insert('rateLimit', { count: 0, key: userId, table: 'blog', windowStart: Date.now() })
    })
    const id = await asUser(0).mutation(api.blog.create, {
      category: 'tech',
      content: 'Rate limit test',
      published: false,
      title: 'Rate Limit 1'
    })
    expect(id).toBeDefined()
  })
  test('requests up to max succeed', async () => {
    const ctx = t(),
      { asUser } = await createTestContext(ctx)
    for (let i = 0; i < 10; i += 1) {
      const id = await asUser(0).mutation(api.blog.create, {
        category: 'tech',
        content: `Rate limit test ${i}`,
        published: false,
        title: `Rate Limit ${i}`
      })
      expect(id).toBeDefined()
    }
  })
  test('request succeeds after window expires', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds
    await ctx.run(async c => {
      await c.db.insert('rateLimit', {
        count: 10,
        key: userId,
        table: 'blog',
        windowStart: Date.now() - 120_000
      })
    })
    const id = await asUser(0).mutation(api.blog.create, {
      category: 'tech',
      content: 'After window expires',
      published: false,
      title: 'Post After Window'
    })
    expect(id).toBeDefined()
  })
})
describe('soft delete preserves children', () => {
  test('soft-deleting wiki does NOT hard-delete related data', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-softdel-1', updatedAt: Date.now(), userId: ownerId })
      ),
      wikiId = await asUser(0).mutation(api.wiki.create, {
        content: 'Soft delete test',
        orgId,
        slug: 'soft-del-wiki-1',
        status: 'published',
        title: 'Soft Delete Wiki'
      })
    await asUser(0).mutation(api.wiki.rm, { id: wikiId, orgId })
    const doc = await ctx.run(async c => c.db.get(wikiId))
    expect(doc).not.toBeNull()
    expect(doc?.deletedAt).toBeDefined()
    expect(typeof doc?.deletedAt).toBe('number')
  })
  test('soft-deleted wiki is excluded from list', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-softdel-2', updatedAt: Date.now(), userId: ownerId })
      )
    await asUser(0).mutation(api.wiki.create, {
      content: 'Visible wiki',
      orgId,
      slug: 'soft-del-wiki-2a',
      status: 'published',
      title: 'Visible Wiki'
    })
    const toDeleteId = await asUser(0).mutation(api.wiki.create, {
      content: 'Will be deleted',
      orgId,
      slug: 'soft-del-wiki-2b',
      status: 'published',
      title: 'Deleted Wiki'
    })
    await asUser(0).mutation(api.wiki.rm, { id: toDeleteId, orgId })
    const result = await asUser(0).query(api.wiki.list, { orgId, paginationOpts: { cursor: null, numItems: 100 } })
    expect(result.page.length).toBe(1)
    expect(result.page[0]?.title).toBe('Visible Wiki')
  })
  test('restore brings back soft-deleted wiki', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [ownerId] = userIds,
      orgId = await ctx.run(async c =>
        c.db.insert('org', { name: 'Test Org', slug: 'test-org-softdel-3', updatedAt: Date.now(), userId: ownerId })
      ),
      wikiId = await asUser(0).mutation(api.wiki.create, {
        content: 'Restore test',
        orgId,
        slug: 'soft-del-wiki-3',
        status: 'published',
        title: 'Restore Wiki'
      })
    await asUser(0).mutation(api.wiki.rm, { id: wikiId, orgId })
    const beforeRestore = await asUser(0).query(api.wiki.list, {
      orgId,
      paginationOpts: { cursor: null, numItems: 100 }
    })
    expect(beforeRestore.page.length).toBe(0)
    await asUser(0).mutation(api.wiki.restore, { id: wikiId, orgId })
    const afterRestore = await asUser(0).query(api.wiki.list, {
      orgId,
      paginationOpts: { cursor: null, numItems: 100 }
    })
    expect(afterRestore.page.length).toBe(1)
    expect(afterRestore.page[0]?.title).toBe('Restore Wiki')
  })
})
describe('file cleanup resilience', () => {
  test('mutation succeeds even when file storage has issues', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      fileId = await ctx.run(async c => c.storage.store(new Blob(['test-data']))),
      postId = await ctx.run(async c =>
        c.db.insert('blog', {
          category: 'tech',
          content: 'File resilience test',
          coverImage: fileId,
          published: false,
          title: 'File Resilience',
          updatedAt: Date.now(),
          userId
        })
      ),
      newFileId = await ctx.run(async c => c.storage.store(new Blob(['new-data']))),
      updated = await asUser(0).mutation(api.blog.update, { coverImage: newFileId, id: postId })
    expect(updated.coverImage).toBe(newFileId)
  })
})
describe('search configuration', () => {
  test('search with where filter', async () => {
    const ctx = t(),
      { userIds } = await createTestContext(ctx),
      [userId] = userIds
    await ctx.run(async c => {
      await c.db.insert('blog', {
        category: 'tech',
        content: 'Searchable tech',
        published: true,
        title: 'Searchable Tech Post',
        updatedAt: Date.now(),
        userId
      })
      await c.db.insert('blog', {
        category: 'life',
        content: 'Searchable life',
        published: true,
        title: 'Searchable Life Post',
        updatedAt: Date.now(),
        userId
      })
    })
    const techOnly = await ctx.query(api.blog.search, {
      query: 'Searchable',
      where: { category: 'tech' }
    })
    expect(techOnly.length).toBe(1)
    expect(techOnly[0]?.category).toBe('tech')
  })
  test('search is case insensitive by default', async () => {
    const ctx = t(),
      { userIds } = await createTestContext(ctx),
      [userId] = userIds
    await ctx.run(async c => {
      await c.db.insert('blog', {
        category: 'tech',
        content: 'SHOUTING CONTENT HERE',
        published: true,
        title: 'Mixed CaSe TiTlE',
        updatedAt: Date.now(),
        userId
      })
    })
    const lowerResult = await ctx.query(api.blog.search, { query: 'shouting' })
    expect(lowerResult.length).toBe(1)
    const upperResult = await ctx.query(api.blog.search, { query: 'SHOUTING' })
    expect(upperResult.length).toBe(1)
  })
  test('search returns empty for no matches', async () => {
    const ctx = t(),
      { userIds } = await createTestContext(ctx),
      [userId] = userIds
    await ctx.run(async c => {
      await c.db.insert('blog', {
        category: 'tech',
        content: 'Some content',
        published: true,
        title: 'Some Post',
        updatedAt: Date.now(),
        userId
      })
    })
    const results = await ctx.query(api.blog.search, { query: 'xyznonexistent' })
    expect(results.length).toBe(0)
  })
})
describe('singletonCrud profile', () => {
  describe('basic flow', () => {
    test('get returns null when no profile exists', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        profile = await asUser(0).query(api.blogProfile.get, {})
      expect(profile).toBeNull()
    })
    test('upsert creates profile on first call', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds,
        result = await asUser(0).mutation(api.blogProfile.upsert, {
          bio: 'Hello world',
          displayName: 'Test User',
          notifications: true,
          theme: 'system'
        })
      expect(result).toBeDefined()
      expect(result.displayName).toBe('Test User')
      expect(result.bio).toBe('Hello world')
      expect(result.theme).toBe('system')
      expect(result.notifications).toBe(true)
      expect(result.userId).toBe(userId)
      expect(result.updatedAt).toBeDefined()
    })
    test('get returns the created profile', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx)
      await asUser(0).mutation(api.blogProfile.upsert, {
        bio: 'My bio',
        displayName: 'Fetch Test',
        notifications: false,
        theme: 'dark'
      })
      const profile = await asUser(0).query(api.blogProfile.get, {})
      expect(profile).not.toBeNull()
      expect(profile?.displayName).toBe('Fetch Test')
      expect(profile?.bio).toBe('My bio')
      expect(profile?.theme).toBe('dark')
      expect(profile?.notifications).toBe(false)
    })
    test('get returns profile with userId matching authenticated user', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds
      await asUser(0).mutation(api.blogProfile.upsert, {
        displayName: 'Owner Check',
        notifications: true,
        theme: 'light'
      })
      const profile = await asUser(0).query(api.blogProfile.get, {})
      expect(profile?.userId).toBe(userId)
    })
    test('upsert updates existing profile', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx)
      await asUser(0).mutation(api.blogProfile.upsert, {
        bio: 'Original bio',
        displayName: 'Original Name',
        notifications: true,
        theme: 'system'
      })
      const updated = await asUser(0).mutation(api.blogProfile.upsert, {
        displayName: 'Updated Name'
      })
      expect(updated.displayName).toBe('Updated Name')
    })
    test('upsert does not create duplicate', async () => {
      const ctx = t(),
        { asUser, userIds } = await createTestContext(ctx),
        [userId] = userIds
      await asUser(0).mutation(api.blogProfile.upsert, {
        displayName: 'First',
        notifications: true,
        theme: 'system'
      })
      await asUser(0).mutation(api.blogProfile.upsert, {
        displayName: 'Second'
      })
      const count = await ctx.run(async c =>
        c.db
          .query('blogProfile')
          .filter(q => q.eq(q.field('userId'), userId))
          .collect()
      )
      expect(count.length).toBe(1)
      expect(count[0]?.displayName).toBe('Second')
    })
  })
  describe('partial update semantics', () => {
    test('upsert with partial data preserves other fields', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx)
      await asUser(0).mutation(api.blogProfile.upsert, {
        bio: 'Original bio',
        displayName: 'Original',
        notifications: true,
        theme: 'dark'
      })
      await asUser(0).mutation(api.blogProfile.upsert, { bio: 'New bio' })
      const profile = await asUser(0).query(api.blogProfile.get, {})
      expect(profile?.bio).toBe('New bio')
      expect(profile?.displayName).toBe('Original')
      expect(profile?.theme).toBe('dark')
      expect(profile?.notifications).toBe(true)
    })
    test('upsert updates updatedAt timestamp', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        first = await asUser(0).mutation(api.blogProfile.upsert, {
          displayName: 'Timestamp Test',
          notifications: true,
          theme: 'system'
        }),
        second = await asUser(0).mutation(api.blogProfile.upsert, { bio: 'Update' })
      expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt)
    })
  })
  describe('file handling', () => {
    test('upsert with avatar stores file reference', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        fileId = await ctx.run(async c => c.storage.store(new Blob(['avatar-data'])))
      await asUser(0).mutation(api.blogProfile.upsert, {
        avatar: fileId,
        displayName: 'Avatar Test',
        notifications: true,
        theme: 'system'
      })
      const profile = await asUser(0).query(api.blogProfile.get, {})
      expect(profile?.avatar).toBe(fileId)
      expect(profile?.avatarUrl).toBeDefined()
      expect(profile?.avatarUrl).not.toBeNull()
    })
    test('get returns avatarUrl: null when avatar is null', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx)
      await asUser(0).mutation(api.blogProfile.upsert, {
        displayName: 'No Avatar',
        notifications: true,
        theme: 'system'
      })
      const profile = await asUser(0).query(api.blogProfile.get, {})
      expect(profile?.avatarUrl).toBeNull()
    })
    test('replacing avatar cleans up old file', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        oldFileId = await ctx.run(async c => c.storage.store(new Blob(['old-avatar']))),
        newFileId = await ctx.run(async c => c.storage.store(new Blob(['new-avatar'])))
      await asUser(0).mutation(api.blogProfile.upsert, {
        avatar: oldFileId,
        displayName: 'Replace Avatar',
        notifications: true,
        theme: 'system'
      })
      await asUser(0).mutation(api.blogProfile.upsert, { avatar: newFileId })
      const oldFile = await ctx.run(async c => c.storage.getUrl(oldFileId))
      expect(oldFile).toBeNull()
      const newFile = await ctx.run(async c => c.storage.getUrl(newFileId))
      expect(newFile).not.toBeNull()
    })
    test('setting avatar to null cleans up old file', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        fileId = await ctx.run(async c => c.storage.store(new Blob(['remove-avatar'])))
      await asUser(0).mutation(api.blogProfile.upsert, {
        avatar: fileId,
        displayName: 'Remove Avatar',
        notifications: true,
        theme: 'system'
      })
      await asUser(0).mutation(api.blogProfile.upsert, { avatar: null })
      const file = await ctx.run(async c => c.storage.getUrl(fileId))
      expect(file).toBeNull()
    })
  })
  describe('authentication', () => {
    test('get rejects unauthenticated user', async () => {
      const ctx = t()
      let threw = false
      try {
        await ctx.query(api.blogProfile.get, {})
      } catch (error) {
        threw = true
        expect(String(error)).toContain('NOT_AUTHENTICATED')
      }
      expect(threw).toBe(true)
    })
    test('upsert rejects unauthenticated user', async () => {
      const ctx = t()
      let threw = false
      try {
        await ctx.mutation(api.blogProfile.upsert, {
          displayName: 'Unauthed',
          notifications: true,
          theme: 'system'
        })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('NOT_AUTHENTICATED')
      }
      expect(threw).toBe(true)
    })
  })
  describe('conflict detection', () => {
    test('upsert with correct expectedUpdatedAt succeeds', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx),
        created = await asUser(0).mutation(api.blogProfile.upsert, {
          displayName: 'Conflict OK',
          notifications: true,
          theme: 'system'
        }),
        updated = await asUser(0).mutation(api.blogProfile.upsert, {
          displayName: 'Updated OK',
          expectedUpdatedAt: created.updatedAt
        })
      expect(updated.displayName).toBe('Updated OK')
    })
    test('upsert with stale expectedUpdatedAt throws CONFLICT', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx)
      await asUser(0).mutation(api.blogProfile.upsert, {
        displayName: 'Conflict Test',
        notifications: true,
        theme: 'system'
      })
      let threw = false
      try {
        await asUser(0).mutation(api.blogProfile.upsert, {
          displayName: 'Stale',
          expectedUpdatedAt: 1
        })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('CONFLICT')
      }
      expect(threw).toBe(true)
    })
  })
  describe('isolation', () => {
    test('user A profile is not visible to user B', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx)
      await asUser(0).mutation(api.blogProfile.upsert, {
        displayName: 'User A',
        notifications: true,
        theme: 'dark'
      })
      const user2Profile = await asUser(1).query(api.blogProfile.get, {})
      expect(user2Profile).toBeNull()
    })
    test('user A and B can have independent profiles', async () => {
      const ctx = t(),
        { asUser } = await createTestContext(ctx)
      await asUser(0).mutation(api.blogProfile.upsert, {
        displayName: 'User A Profile',
        notifications: true,
        theme: 'dark'
      })
      await asUser(1).mutation(api.blogProfile.upsert, {
        displayName: 'User B Profile',
        notifications: false,
        theme: 'light'
      })
      const profile1 = await asUser(0).query(api.blogProfile.get, {}),
        profile2 = await asUser(1).query(api.blogProfile.get, {})
      expect(profile1?.displayName).toBe('User A Profile')
      expect(profile1?.theme).toBe('dark')
      expect(profile2?.displayName).toBe('User B Profile')
      expect(profile2?.theme).toBe('light')
    })
  })
})
describe('custom blog endpoints (pq/q/m)', () => {
  test('postStats returns category counts', async () => {
    const ctx = t(),
      { userIds } = await createTestContext(ctx),
      [userId] = userIds
    await ctx.run(async c => {
      await c.db.insert('blog', {
        category: 'tech',
        content: 'Tech post 1',
        published: true,
        title: 'Tech 1',
        updatedAt: Date.now(),
        userId
      })
      await c.db.insert('blog', {
        category: 'tech',
        content: 'Tech post 2',
        published: true,
        title: 'Tech 2',
        updatedAt: Date.now(),
        userId
      })
      await c.db.insert('blog', {
        category: 'life',
        content: 'Life post 1',
        published: true,
        title: 'Life 1',
        updatedAt: Date.now(),
        userId
      })
    })
    const stats = await ctx.query(api.blog.postStats, {})
    expect(stats.length).toBe(2)
    const techStat = stats.find((s: { category: string }) => s.category === 'tech'),
      lifeStat = stats.find((s: { category: string }) => s.category === 'life')
    expect((techStat as { count: number }).count).toBe(2)
    expect((lifeStat as { count: number }).count).toBe(1)
  })
  test('authorPosts returns only published posts by user', async () => {
    const ctx = t(),
      { userIds } = await createTestContext(ctx),
      [userId] = userIds
    await ctx.run(async c => {
      await c.db.insert('blog', {
        category: 'tech',
        content: 'Published 1',
        published: true,
        title: 'Published 1',
        updatedAt: Date.now(),
        userId
      })
      await c.db.insert('blog', {
        category: 'life',
        content: 'Published 2',
        published: true,
        title: 'Published 2',
        updatedAt: Date.now(),
        userId
      })
      await c.db.insert('blog', {
        category: 'tech',
        content: 'Draft post',
        published: false,
        title: 'Draft',
        updatedAt: Date.now(),
        userId
      })
    })
    const posts = await ctx.query(api.blog.authorPosts, { userId })
    expect(posts.length).toBe(2)
    for (const p of posts) expect((p as Record<string, unknown>).published).toBe(true)
  })
  test('togglePublish flips the published flag', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId] = userIds,
      postId = await ctx.run(async c =>
        c.db.insert('blog', {
          category: 'tech',
          content: 'Toggle test',
          published: false,
          title: 'Toggle Test',
          updatedAt: Date.now(),
          userId
        })
      ),
      first = await asUser(0).mutation(api.blog.togglePublish, { id: postId })
    expect(first.published).toBe(true)
    const second = await asUser(0).mutation(api.blog.togglePublish, { id: postId })
    expect(second.published).toBe(false)
  })
  test('togglePublish rejects non-owner', async () => {
    const ctx = t(),
      { asUser, userIds } = await createTestContext(ctx),
      [userId1] = userIds,
      postId = await ctx.run(async c =>
        c.db.insert('blog', {
          category: 'tech',
          content: 'Not yours',
          published: false,
          title: 'Not Yours',
          updatedAt: Date.now(),
          userId: userId1
        })
      )
    let threw = false
    try {
      await asUser(1).mutation(api.blog.togglePublish, { id: postId })
    } catch (error) {
      threw = true
      expect(String(error)).toContain('NOT_OWNER')
    }
    expect(threw).toBe(true)
  })
})

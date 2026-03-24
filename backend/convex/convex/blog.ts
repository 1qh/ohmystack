import { getAuthUserId } from '@convex-dev/auth/server'
import { time } from '@noboil/convex/server'
/* oxlint-disable eslint/max-statements */
import { zid } from 'convex-helpers/server/zod4'
import { crud, m, pq } from '../lazy'
import { owned } from '../t'
const {
    create,
    pub: { list, read, search },
    rm,
    update
  } = crud('blog', owned.blog, { rateLimit: { max: 10, window: 60_000 }, search: 'content' }),
  postStats = pq({
    args: {},
    handler: async ctx => {
      const posts = await ctx.db
          .query('blog')
          .withIndex('by_published', q => q.eq('published', true))
          .collect(),
        counts: Record<string, { count: number; latestTitle: string }> = {}
      for (const p of posts) {
        const cat = p.category as string,
          existing = counts[cat]
        if (existing) {
          existing.count += 1
          existing.latestTitle = p.title
        } else counts[cat] = { count: 1, latestTitle: p.title }
      }
      const result: { category: string; count: number; latestTitle: string }[] = []
      for (const [category, data] of Object.entries(counts))
        result.push({ category, count: data.count, latestTitle: data.latestTitle })
      return result
    }
  }),
  authorPosts = pq({
    args: { userId: zid('users') },
    handler: async (ctx, { userId }) => {
      const posts = await ctx.db
        .query('blog')
        .withIndex('by_user', q => q.eq('userId', userId))
        .collect()
      return posts.filter(p => (p as Record<string, unknown>).published === true)
    }
  }),
  togglePublish = m({
    args: { id: zid('blog') },
    handler: async (ctx, { id }) => {
      await getAuthUserId(ctx as never)
      const doc = await ctx.db.get(id)
      if (!doc) throw new Error('NOT_FOUND')
      if ((doc as Record<string, unknown>).userId !== ctx.user._id) throw new Error('NOT_OWNER')
      const current = (doc as Record<string, unknown>).published as boolean
      await ctx.db.patch(id, { published: !current, ...time() } as never)
      return { published: !current }
    }
  })
export { authorPosts, create, list, postStats, read, rm, search, togglePublish, update }

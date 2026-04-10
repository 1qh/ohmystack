import { time } from '@noboil/convex/server'
import { zid } from 'convex-helpers/server/zod4'
import { api, m, pq } from '../lazy'
const {
  create,
  pub: { list, read, search },
  rm,
  update
} = api.blog
const postStats = pq({
  args: {},
  handler: async ctx => {
    const posts = await ctx.db
      .query('blog')
      .withIndex('by_published', q => q.eq('published', true))
      .collect()
    const counts: Record<string, { count: number; latestTitle: string }> = {}
    for (const p of posts) {
      const existing = counts[p.category]
      if (existing) {
        existing.count += 1
        existing.latestTitle = p.title
      } else counts[p.category] = { count: 1, latestTitle: p.title }
    }
    const result: { category: string; count: number; latestTitle: string }[] = []
    for (const [category, data] of Object.entries(counts))
      result.push({ category, count: data.count, latestTitle: data.latestTitle })
    return result
  }
})
const authorPosts = pq({
  args: { userId: zid('users') },
  handler: async (ctx, { userId }) => {
    const posts = await ctx.db
      .query('blog')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect()
    return posts.filter(p => p.published === true)
  }
})
const togglePublish = m({
  args: { id: zid('blog') },
  handler: async (ctx, { id }) => {
    const doc = await ctx.get(id)
    await ctx.patch(id, { published: !doc.published, ...time() })
    return { published: !doc.published }
  }
})
export { authorPosts, create, list, postStats, read, rm, search, togglePublish, update }

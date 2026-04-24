import { zid } from 'convex-helpers/server/zod4'
import { child, file as fileSchema, files as filesSchema, orgSchema, schema } from 'noboil/convex/schema'
import { array, boolean, number, object, string, union, enum as zenum } from 'zod/v4'
const file = fileSchema()
const files = filesSchema()
const messagePart = union([
  object({ text: string(), type: zenum(['text']) }),
  object({ image: file, type: zenum(['image']) }),
  object({ file, name: string(), type: zenum(['file']) })
])
const profileShape = {
  avatar: file.nullable().optional(),
  bio: string().max(500).optional(),
  displayName: string().trim().min(1),
  notifications: boolean(),
  theme: zenum(['light', 'dark', 'system'])
}
const s = schema({
  base: {
    movie: object({
      backdrop_path: string().nullable(),
      budget: number().nullable(),
      genres: array(object({ id: number(), name: string() })),
      original_title: string(),
      overview: string(),
      poster_path: string().nullable(),
      release_date: string(),
      revenue: number().nullable(),
      runtime: number().nullable(),
      tagline: string().nullable(),
      title: string(),
      tmdb_id: number(),
      vote_average: number(),
      vote_count: number()
    })
  },
  children: {
    message: child({
      foreignKey: 'chatId',
      parent: 'chat',
      schema: object({
        chatId: zid('chat'),
        parts: array(messagePart),
        role: zenum(['user', 'assistant', 'system'])
      })
    })
  },
  kv: {
    siteConfig: {
      keys: ['banner', 'defaultPollDays'] as const,
      schema: object({ active: boolean(), message: string() }),
      writeRole: true
    }
  },
  log: {
    vote: {
      parent: 'poll',
      schema: object({ optionIdx: number(), voter: string() })
    }
  },
  org: {
    team: orgSchema
  },
  orgScoped: {
    project: object({
      description: string().optional(),
      editors: array(zid('users')).max(100).optional(),
      name: string().min(1),
      status: zenum(['active', 'archived', 'completed']).optional()
    }),
    task: object({
      assigneeId: zid('users').nullable().optional(),
      completed: boolean().optional(),
      priority: zenum(['low', 'medium', 'high']).optional(),
      projectId: zid('project'),
      title: string().min(1)
    }),
    wiki: object({
      content: string().optional(),
      deletedAt: number().optional(),
      editors: array(zid('users')).max(100).optional(),
      slug: string()
        .min(1)
        .regex(/^[a-z0-9-]+$/u),
      status: zenum(['draft', 'published']),
      title: string().min(1)
    })
  },
  owned: {
    blog: object({
      attachments: files.max(5).optional(),
      category: zenum(['tech', 'life', 'tutorial'], { error: 'Select a category' }),
      content: string().min(3, 'At least 3 characters'),
      coverImage: file.nullable().optional(),
      published: boolean(),
      tags: array(string()).max(5, 'Max 5 tags').optional(),
      title: string().min(1, 'Required')
    }),
    chat: object({
      isPublic: boolean(),
      title: string().min(1)
    }),
    poll: object({
      closedAt: number().nullable().optional(),
      options: array(string().min(1)).min(2).max(10),
      question: string().min(1)
    })
  },
  quota: {
    pollVote: { durationMs: 60_000, limit: 30 }
  },
  singleton: {
    blogProfile: object(profileShape),
    orgProfile: object(profileShape)
  }
})
const owned = { blog: s.blog, chat: s.chat, poll: s.poll }
const orgScoped = { project: s.project, task: s.task, wiki: s.wiki }
const base = { movie: s.movie }
const singleton = { blogProfile: s.blogProfile, orgProfile: s.orgProfile }
const org = { team: s.team }
const children = { message: s.message }
const log = { vote: s.vote }
const kv = { siteConfig: s.siteConfig }
const quota = { pollVote: s.pollVote }
export { base, children, kv, log, org, orgScoped, owned, quota, s, singleton }

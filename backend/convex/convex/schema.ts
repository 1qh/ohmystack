import { authTables } from '@convex-dev/auth/server'
import { zodOutputToConvexFields as z2c } from 'convex-helpers/server/zod4'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  baseTable,
  kvTable,
  logTable,
  orgChildTable,
  orgTable,
  orgTables,
  ownedTable,
  presenceTable,
  quotaTable,
  rateLimitTable,
  singletonTable,
  uploadTables
} from 'noboil/convex/server'
import { base, children, kv, log, orgScoped, owned, singleton } from '../s'
export default defineSchema({
  ...authTables,
  ...orgTables(),
  ...presenceTable(),
  ...rateLimitTable(),
  ...uploadTables(),
  ...({
    blog: ownedTable(owned.blog)
      .index('by_published', ['published'])
      .index('by_category', ['category'])
      .searchIndex('search_field', { searchField: 'content' as never }),
    chat: ownedTable(owned.chat),
    poll: ownedTable(owned.poll)
  } satisfies Record<keyof typeof owned, ReturnType<typeof ownedTable>>),
  ...({
    message: defineTable({
      ...z2c(children.message.schema.shape),
      updatedAt: v.number()
    }).index('by_chat', [children.message.foreignKey])
  } satisfies Record<keyof typeof children, ReturnType<typeof defineTable>>),
  ...({
    movie: baseTable(base.movie).index('by_tmdb_id', ['tmdb_id'])
  } satisfies Record<keyof typeof base, ReturnType<typeof baseTable>>),
  ...({
    blogProfile: singletonTable(singleton.blogProfile),
    orgProfile: singletonTable(singleton.orgProfile),
    pollProfile: singletonTable(singleton.pollProfile)
  } satisfies Record<keyof typeof singleton, ReturnType<typeof singletonTable>>),
  pollVoteQuota: quotaTable(),
  project: orgTable(orgScoped.project),
  siteConfig: kvTable(kv.siteConfig.schema as never),
  task: orgChildTable(orgScoped.task, { foreignKey: 'projectId', table: 'project' }),
  vote: logTable(log.vote.schema as never),
  wiki: orgTable(orgScoped.wiki).index('by_slug', ['orgId' as never, 'slug' as never])
})

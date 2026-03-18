import { authTables } from '@convex-dev/auth/server'
import {
  baseTable,
  orgChildTable,
  orgTable,
  orgTables,
  ownedTable,
  rateLimitTable,
  singletonTable,
  uploadTables
} from '@noboil/convex/server'
import { zodOutputToConvexFields as z2c } from 'convex-helpers/server/zod4'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { base, children, orgScoped, owned, singleton } from '../t'

export default defineSchema({
  ...authTables,
  ...orgTables(),
  ...rateLimitTable(),
  ...uploadTables(),
  ...({
    blog: ownedTable(owned.blog)
      .index('by_published', ['published'])
      .index('by_category', ['category'])
      .searchIndex('search_field', { searchField: 'content' as never }),
    chat: ownedTable(owned.chat)
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
    orgProfile: singletonTable(singleton.orgProfile)
  } satisfies Record<keyof typeof singleton, ReturnType<typeof singletonTable>>),
  project: orgTable(orgScoped.project),
  task: orgChildTable(orgScoped.task, { foreignKey: 'projectId', table: 'project' }),
  wiki: orgTable(orgScoped.wiki).index('by_slug', ['orgId' as never, 'slug' as never])
})

# noboil

[![npm](https://img.shields.io/npm/v/noboil)](https://www.npmjs.com/package/noboil) [![npm](https://img.shields.io/npm/v/@noboil/convex)](https://www.npmjs.com/package/@noboil/convex) [![npm](https://img.shields.io/npm/v/@noboil/spacetimedb)](https://www.npmjs.com/package/@noboil/spacetimedb) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

One schema. Typed backend. Auto forms. Zero boilerplate.

Define a Zod schema once. Get authenticated CRUD, typesafe forms, file upload, real-time subscriptions, pagination, search, soft delete, org multi-tenancy with ACL, rate limiting, and conflict detection — all generated. Currently supports Convex and SpacetimeDB.

## Quick Start

```sh
bunx noboil@latest init
```

Pick a database, name your project, done. The CLI scaffolds the full monorepo.

## Before / After

Without noboil — each database has its own schema syntax, validator types, and CRUD boilerplate:

<details> <summary>Raw Convex (~70 lines)</summary>

```ts
// schema.ts — Convex validators
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  blog: defineTable({
    title: v.string(),
    content: v.string(),
    category: v.string(),
    published: v.boolean(),
    coverImage: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    userId: v.id('users'),
    updatedAt: v.number()
  })
    .index('by_userId', ['userId'])
    .index('by_published', ['published'])
})
```

```ts
// blog.ts — manual CRUD
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Not authenticated')
    return ctx.db
      .query('blog')
      .withIndex('by_userId', q => q.eq('userId', userId))
      .order('desc')
      .paginate(paginationOpts)
  }
})

export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    category: v.string(),
    published: v.boolean()
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Not authenticated')
    return ctx.db.insert('blog', { ...args, userId, updatedAt: Date.now() })
  }
})

export const update = mutation({
  args: {
    id: v.id('blog'),
    title: v.optional(v.string()),
    content: v.optional(v.string())
  },
  handler: async (ctx, { id, ...fields }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Not authenticated')
    const doc = await ctx.db.get(id)
    if (!doc || doc.userId !== userId) throw new Error('Not found')
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() })
  }
})

export const rm = mutation({
  args: { id: v.id('blog') },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Not authenticated')
    const doc = await ctx.db.get(id)
    if (!doc || doc.userId !== userId) throw new Error('Not found')
    await ctx.db.delete(id)
  }
})
```

</details>

<details> <summary>Raw SpacetimeDB (~60 lines)</summary>

```ts
// schema.ts — SpacetimeDB table + type builders
import { schema, table, t } from 'spacetimedb/server'

const blog = table(
  {
    name: 'blog',
    public: true,
    indexes: [
      { name: 'by_user', algorithm: 'btree', columns: ['userId'] },
      { name: 'by_published', algorithm: 'btree', columns: ['published'] }
    ]
  },
  {
    id: t.u32().primaryKey().autoInc(),
    title: t.string(),
    content: t.string(),
    category: t.string(),
    published: t.bool(),
    coverImage: t.option(t.string()),
    tags: t.option(t.array(t.string())),
    userId: t.identity(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp()
  }
)

const spacetimedb = schema(blog)
```

```ts
// reducers — manual CRUD
spacetimedb.reducer(
  'create_blog',
  {
    title: t.string(),
    content: t.string(),
    category: t.string(),
    published: t.bool()
  },
  (ctx, args) => {
    ctx.db.blog.insert({
      id: 0,
      ...args,
      updatedAt: ctx.timestamp,
      userId: ctx.sender
    })
  }
)

spacetimedb.reducer(
  'update_blog',
  { id: t.u32(), title: t.string().optional(), content: t.string().optional() },
  (ctx, { id, ...fields }) => {
    const row = ctx.db.blog.id.find(id)
    if (!row || !identityEquals(row.userId, ctx.sender))
      throw new SenderError('NOT_FOUND')
    ctx.db.blog.id.update({ ...row, ...fields, updatedAt: ctx.timestamp })
  }
)

spacetimedb.reducer('delete_blog', { id: t.u32() }, (ctx, { id }) => {
  const row = ctx.db.blog.id.find(id)
  if (!row || !identityEquals(row.userId, ctx.sender))
    throw new SenderError('NOT_FOUND')
  ctx.db.blog.id.delete(id)
})
```

</details>

With noboil — one Zod schema, same code for both databases:

```ts
const owned = makeOwned({
  blog: object({
    title: string().min(1, 'Required'),
    content: string().min(3),
    category: zenum(['tech', 'life', 'tutorial']),
    published: boolean(),
    coverImage: cvFile().nullable().optional(),
    tags: array(string()).max(5).optional()
  })
})
```

```ts
export const { create, list, read, rm, update } = crud(owned, 'blog')
```

5 endpoints. Auth, ownership, Zod validation, file upload, cursor pagination, rate limiting, conflict detection — all included. Same API across databases. `create`, `update`, and `rm` each accept single or bulk input (up to 100 items).

## Monorepo Structure

```
noboil/
  web/
    cvx/              4 Convex demo web apps (blog, chat, movie, org)
    stdb/             4 SpacetimeDB demo web apps
  doc/                Documentation site (fumadocs)
  lib/
    convex/           @noboil/convex library (published)
    spacetimedb/      @noboil/spacetimedb library (published)
    shared/           internal shared code (not published)
    fe/               shared frontend utilities (Next.js + auth shells)
    e2e/              shared Playwright utilities
  backend/
    convex/           Convex backend (schema + functions)
    spacetimedb/      SpacetimeDB backend (module + bindings)
  readonly/ui/        shared shadcn components (synced from cnsync, read-only)
  tool/cli/           CLI — bunx noboil@latest init
```

## Packages

| Package               | Description                  |
| --------------------- | ---------------------------- |
| `noboil`              | CLI — scaffold a new project |
| `@noboil/convex`      | Convex library               |
| `@noboil/spacetimedb` | SpacetimeDB library          |

## Requirements

A TypeScript-capable bundler (Vite, Next.js, esbuild, etc.) is required. Library package.json `exports` point directly to `.ts` source files — this is intentional so consumers get full type inference without a separate build step.

## Docs

[noboil.dev/docs](https://noboil.dev/docs)

## License

MIT. Author: [1qh](https://github.com/1qh/noboil).

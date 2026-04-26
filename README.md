# noboil

[![npm](https://img.shields.io/npm/v/noboil)](https://www.npmjs.com/package/noboil) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

<!-- AUTO-GENERATED:PACKAGE-INFO -->
**v0.0.1** · Schema-first, zero-boilerplate fullstack. Pick your database.

**Peer deps:** `@auth/core`, `@convex-dev/auth`, `convex`, `convex-helpers`, `next`, `react`, `react-dom`, `spacetimedb`, `zod`
<!-- /AUTO-GENERATED:PACKAGE-INFO -->

One schema. Typed backend. Auto forms. Zero boilerplate.

Define a Zod schema once. Get authenticated CRUD, typesafe forms, file upload, real-time subscriptions, pagination, search, soft delete, org multi-tenancy with ACL, rate limiting, and conflict detection — all generated. Currently supports Convex and SpacetimeDB.

## Quick Start

```sh
bunx noboil@latest init
```

Pick a database, name your project, done. The CLI scaffolds the full monorepo — all <!-- AUTO-GENERATED:DEMO-COUNT -->
5 vertical demos (blog, chat, movie, org, poll)
<!-- /AUTO-GENERATED:DEMO-COUNT --> and shared infra included. Delete what you don’t need.

## CLI

Run `noboil` with no args for an interactive dashboard with single-key hotkeys:

| key | command       | what it does                                                 |
| --- | ------------- | ------------------------------------------------------------ |
| `i` | `init`        | create a new project                                         |
| `d` | `doctor`      | health check; `doctor --fix` auto-remediates                 |
| `s` | `sync`        | pull upstream changes (cached at `~/.noboil/upstream.git`)   |
| `a` | `add`         | scaffold a table (auto-dispatches by DB in `.noboilrc.json`) |
| `e` | `eject`       | inline the noboil library into `lib/noboil`                  |
| `u` | `upgrade`     | `bun add noboil@latest`                                      |
| `c` | `completions` | print shell completion script                                |

All commands also work non-interactively. <!-- AUTO-GENERATED:CLI-TABLE-TYPES -->
`noboil init my-app --db=convex`, `noboil add post --type=owned --fields="title:string,content:string"`, etc. (Valid `--type=` values: cache, child, kv, log, org, owned, quota, singleton.) Run `noboil <cmd> --help` for options.
<!-- /AUTO-GENERATED:CLI-TABLE-TYPES --> `noboil --version`, `noboil-convex --version`, and `noboil-stdb --version` each print the CLI version.

Shell completions:

```sh
noboil completions bash              # print
noboil completions install zsh       # append to ~/.zshrc
```

Crash logs land in `~/.noboil/last-error.log`. Print the most recent with `noboil doctor --last-error`.

### Extending `noboil add`

Drop a `noboil.config.ts` at the project root to hook lifecycle events:

```ts
import { defineConfig } from 'noboil/config'
export default defineConfig({
  hooks: {
    afterAdd: async ({ name, type }) => {
      // e.g. run a formatter, notify Slack, etc.
    }
  }
})
```

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
const s = schema({
  owned: {
    blog: object({
      title: string().min(1, 'Required'),
      content: string().min(3),
      category: zenum(['tech', 'life', 'tutorial']),
      published: boolean(),
      coverImage: file().nullable().optional(),
      tags: array(string()).max(5).optional()
    })
  }
})
```

```ts
const api = noboil({
  ...config,
  tables: ({ table }) => ({
    blog: table(s.blog, {
      rateLimit: { max: 10, window: 60_000 },
      search: 'content'
    })
  })
})
```

Auth, ownership, Zod validation, file upload, cursor pagination, rate limiting, conflict detection — all included. Same API across databases. `create`, `update`, and `rm` each accept single or bulk input (up to 100 items).

## Factories

Each table declares its shape via Zod and picks a factory that matches its access pattern. noboil generates the matching CRUD/ops per factory.

<!-- AUTO-GENERATED:FACTORY-TABLE -->
| Factory | Shape | Generates | Use for |
|---|---|---|---|
| `base` | keyed external API cache | `get`/`load`/`refresh`/`invalidate`/`purge` | TMDB movies, Gravatar avatars |
| `child` | nested under a parent | `create`/`list`/`rm`/`update` by parentId | comments under posts, items under orders |
| `kv` | string-keyed state | `get` (public) / `set`/`rm` (role-gated) | feature flags, status banners, site config |
| `log` | append-only event stream | `append`/`listAfter`/`purgeByParent` with per-parent `seq` + idempotency | messages, audit trails, event sourcing |
| `org` | org-scoped with editors | `addEditor`/`removeEditor` + full CRUD | multi-tenant, team-shared resources |
| `owned` | user-scoped | `create`/`list`/`read`/`update`/`rm` | user-owned data (posts, chats, tasks) |
| `quota` | sliding-window rate limit | `check`/`record`/`consume` | anti-spam, vote throttling, API limits |
| `singleton` | one per user | `get`/`upsert` | user preferences, profiles |
<!-- /AUTO-GENERATED:FACTORY-TABLE -->

One `s.ts` file, one Zod schema per table, one factory per access pattern:

```ts
const s = schema({
  owned:     { chat: object({...}) },                                          // user-scoped CRUD
  log:       { message: { parent: 'chat', schema: object({...}) } },           // append-only log
  kv:        { banner: { keys: ['active'] as const, schema: object({...}), writeRole: 'admin' } },
  quota:     { sendMessage: { limit: 30, durationMs: 60_000 } },               // 30 msgs/minute
  singleton: { prefs: object({...}) }
})
```

Each factory’s React hook mirrors the server API: `useCrud` / `useSingleton` / `useCache` / `useLog` / `useKv` / `useQuota`. See `doc/content/docs/` for per-factory guides.

## Monorepo Structure

```
noboil/
  web/
<!-- AUTO-GENERATED:DEMO-TREE -->
    cvx/              5 Convex demo web apps (blog, chat, movie, org, poll)
    stdb/             5 SpacetimeDB demo web apps (blog, chat, movie, org, poll)
<!-- /AUTO-GENERATED:DEMO-TREE -->
  doc/                Documentation site (fumadocs)
  lib/
    fe/               shared frontend utilities (Next.js + auth shells)
    e2e/              shared Playwright utilities
  backend/
    convex/           Convex backend (schema + functions)
    spacetimedb/      SpacetimeDB backend (module + bindings)
  readonly/ui/        shared shadcn components (synced from cnsync, read-only)
  lib/noboil/           noboil — single published package (CLI + convex + spacetimedb + shared)
```

## Package

A single published package `noboil` ships the CLI, Convex bindings, SpacetimeDB bindings, and shared utilities. Subpath exports (`noboil/convex/*`, `noboil/spacetimedb/*`) or conditional exports (`noboil/components`, `noboil/server`, etc. resolved per `customConditions`) give you both ergonomic and explicit import styles.

## Requirements

Bun ≥ 1.3. TypeScript ≥ 5.0 with `moduleResolution: "bundler"` or `"nodenext"` (required for `customConditions`). Next.js, Vite, or any ESM bundler.

## Docs

[noboil.dev/docs](https://noboil.dev/docs)

## License

MIT. Author: [1qh](https://github.com/1qh/noboil).

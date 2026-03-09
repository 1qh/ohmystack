# ohmystack — Migration & Implementation Plan

## Vision

Schema-first, zero-boilerplate fullstack. Pick your database, forget about the backend.

`bun ohmystack@latest init` → choose a database → ship in minutes.

Convex and SpacetimeDB are our first two supported backends. The architecture is designed to support more databases over time (drizzle + oRPC for SQL databases is on the roadmap).

## Motivation

betterspace (SpacetimeDB) and lazyconvex (Convex) share everything — philosophy, code,
linting, dependencies, demo apps, monorepo structure. Maintaining two repos with ~70%
identical code is wasteful. Consolidating into one monorepo unlocks massive reuse.

But this is not just a merge. ohmystack is a new home with a long-term vision:
**schema-first, no-brainer backend, zero-boilerplate, just pick your favorite database.**
Every solution ohmystack offers is easy to use, easy to adopt, easy to configure, while
covering all concerns about scalability and security.

ohmystack is for any dev who wants the most minimum effort to ship a fullstack app in
minutes, not weeks. Pick a database, forget about the backend. Convex and SpacetimeDB are
the first two supported backends. More will follow — drizzle + oRPC for SQL databases is
on the roadmap (to be discussed after ohmystack ships, multi-db support needs careful
consideration).

The repo IS the template. `bun ohmystack@latest init` → pick a database → done. No
separate template repos to maintain. Clone the repo, strip library source and docs, keep
the monorepo structure, GitHub Actions, shadcn components, strict linting, and demo apps.
A `doctor` command checks if the consumer's project is outdated vs upstream, and a `sync`
command pulls upstream changes.

Documentation lives in a fumadocs site, not scattered markdown files. Devs can switch
between databases in a global toggle and see the difference in consumer code — same UX as
SDKs that show multiple language clients side by side, but for different databases.

Both betterspace and lazyconvex remain valid on their own — they are archived as
read-only references, not deprecated. ohmystack is where they grow from here.

## Source Repos (now archived, read-only)

- `1qh/betterspace` — SpacetimeDB framework (~31,700 LOC library, 1,170 tests)
- `1qh/lazyconvex` — Convex framework (~25,000 LOC library, 934 unit + 219 backend tests)
- `packages/ui/` is 100% identical across both repos (~12,700 LOC)

## npm Packages

| Package | Purpose |
|---|---|
| `ohmystack` | CLI only — `bun ohmystack@latest init` |
| `@ohmystack/convex` | Convex library (replaces `lazyconvex`) |
| `@ohmystack/spacetimedb` | SpacetimeDB library (replaces `betterspace`) |

Final versions of `betterspace` and `lazyconvex` on npm will log a deprecation notice pointing to the new packages.

## Target Monorepo Structure

```
ohmystack/
├── apps/
│   ├── convex/
│   │   ├── blog/              ← from lazyconvex apps/blog
│   │   ├── chat/              ← from lazyconvex apps/chat
│   │   ├── movie/             ← from lazyconvex apps/movie
│   │   └── org/               ← from lazyconvex apps/org
│   ├── spacetimedb/
│   │   ├── blog/              ← from betterspace apps/blog
│   │   ├── chat/              ← from betterspace apps/chat
│   │   ├── movie/             ← from betterspace apps/movie
│   │   └── org/               ← from betterspace apps/org
│   └── docs/                  ← fumadocs documentation site (NEW)
├── packages/
│   ├── convex/                ← @ohmystack/convex (from lazyconvex)
│   ├── spacetimedb/           ← @ohmystack/spacetimedb (from betterspace)
│   ├── shared/                ← internal, NOT published — shared hooks/components/utils
│   ├── ui/                    ← shared shadcn components (identical in both repos)
│   ├── be-convex/             ← Convex backend functions + schema (from lazyconvex packages/be)
│   ├── be-spacetimedb/        ← SpacetimeDB module + schema (from betterspace packages/be)
│   ├── fe/                    ← shared frontend utilities
│   └── e2e/                   ← shared Playwright utilities
├── mobile/
│   └── convex/                ← iOS/Android apps (from lazyconvex, Convex-only for now)
├── desktop/
│   └── convex/                ← macOS apps (from lazyconvex, Convex-only for now)
├── swift-core/                ← shared Swift protocols (from lazyconvex)
├── ohmystack.yml              ← Docker compose for ALL services (Convex + SpacetimeDB + MinIO)
├── lintmax.config.ts          ← unified linting config
├── eslint.config.ts           ← unified ESLint config
├── turbo.json                 ← unified Turbo config
├── package.json               ← workspace root
└── PLAN.md                    ← this file
```

## Code Sharing Strategy

### packages/shared/ (internal, never published)

~8,000 lines of code that is identical or near-identical across both libraries:

**100% identical (copy directly):**
- `use-bulk-mutate.ts` (127 lines)
- `use-search.ts` (65 lines)
- `editors-section.tsx` (90 lines)
- `presence.ts` (151 lines)

**90%+ similar (extract shared, inject DB-specific via args):**
- `use-bulk-selection.ts`, `use-optimistic.ts`, `use-soft-delete.ts`
- `schema-playground.tsx`, `devtools-panel.tsx`
- `middleware.ts`, `schema-helpers.ts`
- `fields.tsx`, `misc.tsx`, `step-form.tsx`
- ESLint plugin core (16 rules)
- CLI framework (create, add, check, doctor commands)

**DB-specific (stays in each library package):**
- `crud.ts` — fundamentally different (Convex mutations vs SpacetimeDB reducers)
- `use-list.ts` — different pagination (usePaginatedQuery vs manual state)
- `use-mutate.ts` — different mutation APIs
- `provider.ts` — SpacetimeDB-only (WebSocket client setup)
- `rls.ts`, `stdb-tables.ts` — SpacetimeDB-only
- `types.ts`, `env.ts`, `codegen-swift.ts` — Convex-only
- `s3.ts` — SpacetimeDB-only (S3 file storage)

### How sharing works

Each published package imports from `packages/shared/` and re-exports:
```ts
// packages/convex/src/react/index.ts
export { useBulkMutate, useBulkSelection, useSearch } from '@a/shared/react'
export { useList } from './use-list' // Convex-specific implementation
```

Users see one clean import: `import { useList } from '@ohmystack/convex/react'`

## Execution Phases

### Phase 0: Monorepo Scaffold
**Goal:** Empty monorepo with build/lint/test infrastructure working.

- [ ] 0.1 — Initialize bun workspace with `package.json`, `turbo.json`, `tsconfig.json`
- [ ] 0.2 — Copy and unify `lintmax.config.ts` (merge betterspace + lazyconvex overrides)
- [ ] 0.3 — Copy and unify `eslint.config.ts`
- [ ] 0.4 — Set up `.github/workflows/ci.yml` (multi-job with path filtering from lazyconvex, extended for both DBs)
- [ ] 0.5 — Copy `.vscode/` settings
- [ ] 0.6 — Create `ohmystack.yml` docker compose (Convex services + SpacetimeDB + shared MinIO on different ports)
- [ ] 0.7 — Verify `bun i && bun fix` passes on empty workspace

### Phase 1: Shared Packages (no DB-specific code)
**Goal:** `packages/shared/`, `packages/ui/`, `packages/fe/`, `packages/e2e/` all building.

- [ ] 1.1 — Copy `packages/ui/` from lazyconvex (identical in both repos)
- [ ] 1.2 — Copy `packages/fe/` (verify identical, pick one)
- [ ] 1.3 — Copy `packages/e2e/` (verify identical, pick one)
- [ ] 1.4 — Create `packages/shared/` — extract identical React hooks:
  - `use-bulk-mutate.ts`, `use-search.ts`, `use-bulk-selection.ts`
  - `use-optimistic.ts`, `use-soft-delete.ts`, `use-presence.ts`
  - `schema-playground.tsx`, `devtools-panel.tsx`, `devtools.ts`
  - `error-toast.ts`, `use-online-status.ts`, `use-upload.ts`, `use-cache.ts`
  - `optimistic-store.ts`, `form.ts`, `org.tsx`
- [ ] 1.5 — Extract shared server utils into `packages/shared/`:
  - `presence.ts`, `middleware.ts`, `schema-helpers.ts`
  - `helpers.ts`, `file.ts`, `child.ts`, `singleton.ts`, `cache-crud.ts`
  - `org.ts`, `org-crud.ts`, `org-members.ts`, `org-invites.ts`, `org-join.ts`
- [ ] 1.6 — Extract shared components into `packages/shared/`:
  - `editors-section.tsx`, `misc.tsx`, `step-form.tsx`, `form.tsx`, `fields.tsx`
- [ ] 1.7 — Extract shared ESLint plugin rules into `packages/shared/`
- [ ] 1.8 — Extract shared CLI commands into `packages/shared/`
- [ ] 1.9 — Extract shared Zod utils, schema types, seed utils, retry utils
- [ ] 1.10 — `bun fix && bun typecheck` passes for all shared packages

### Phase 2: Library Packages
**Goal:** `@ohmystack/convex` and `@ohmystack/spacetimedb` build and export everything.

- [ ] 2.1 — Create `packages/convex/` — copy DB-specific code from lazyconvex:
  - `crud.ts`, `use-list.ts`, `use-mutate.ts`, `types.ts`, `env.ts`
  - `codegen-swift.ts`, `setup.ts`
  - Re-export shared code from `packages/shared/`
  - package.json with name `@ohmystack/convex`, same exports as lazyconvex
- [ ] 2.2 — Create `packages/spacetimedb/` — copy DB-specific code from betterspace:
  - `crud.ts`, `use-list.ts`, `use-mutate.ts`, `provider.ts`, `list-utils.ts`
  - `rls.ts`, `stdb-tables.ts`, `reducer-utils.ts`, `s3.ts`, `setup.ts`
  - Re-export shared code from `packages/shared/`
  - package.json with name `@ohmystack/spacetimedb`, same exports as betterspace
- [ ] 2.3 — Migrate all tests:
  - Copy lazyconvex `pure.test.ts` (934 tests) → adapt imports to `@ohmystack/convex`
  - Copy betterspace `pure.test.ts` (1,170 tests) → adapt imports to `@ohmystack/spacetimedb`
- [ ] 2.4 — `bun fix && bun typecheck && bun test` passes for both library packages

### Phase 3: Backend Packages
**Goal:** Both backend packages deploy and pass backend tests.

- [ ] 3.1 — Copy `packages/be/` from lazyconvex → `packages/be-convex/`
  - Update imports from `lazyconvex` → `@ohmystack/convex`
  - Update package.json name to `@a/be-convex`
- [ ] 3.2 — Copy `packages/be/` from betterspace → `packages/be-spacetimedb/`
  - Update imports from `betterspace` → `@ohmystack/spacetimedb`
  - Update package.json name to `@a/be-spacetimedb`
- [ ] 3.3 — Docker compose: Convex (postgres + minio + backend + dashboard) on ports 3212/6791/9000
- [ ] 3.4 — Docker compose: SpacetimeDB on port 3000, MinIO on ports 9002/9003 (avoid conflicts)
- [ ] 3.5 — `genkey.sh` + `genenv.ts` for Convex, equivalent for SpacetimeDB
- [ ] 3.6 — Backend tests pass: 219 (Convex) + equivalent (SpacetimeDB)

### Phase 4: Demo Apps
**Goal:** All 8 web demo apps build and run.

- [ ] 4.1 — Copy lazyconvex `apps/{blog,chat,movie,org}` → `apps/convex/{blog,chat,movie,org}`
  - Update imports from `lazyconvex` → `@ohmystack/convex`
  - Update package.json names to `@a/convex-blog`, etc.
  - Update internal workspace references
- [ ] 4.2 — Copy betterspace `apps/{blog,chat,movie,org}` → `apps/spacetimedb/{blog,chat,movie,org}`
  - Update imports from `betterspace` → `@ohmystack/spacetimedb`
  - Update package.json names to `@a/stdb-blog`, etc.
  - Update internal workspace references
- [ ] 4.3 — All 8 apps: `bun fix && bun build` passes
- [ ] 4.4 — E2E tests pass for all 8 apps

### Phase 5: Mobile & Desktop (Convex-only)
**Goal:** Native apps build and test.

- [ ] 5.1 — Copy lazyconvex `mobile/` → `mobile/convex/`
- [ ] 5.2 — Copy lazyconvex `desktop/` → `desktop/convex/`
- [ ] 5.3 — Copy `swift-core/`
- [ ] 5.4 — Swift codegen works: `bun codegen:swift`
- [ ] 5.5 — All native builds pass, Maestro tests pass, Swift tests pass

### Phase 6: Documentation Site (fumadocs)
**Goal:** `apps/docs/` serves unified documentation with DB switcher.

- [ ] 6.1 — Scaffold fumadocs app at `apps/docs/`
  - Next.js App Router, fumadocs-ui, fumadocs-mdx
  - Tailwind + `packages/ui/` integration
- [ ] 6.2 — Content architecture:
  - `content/docs/` — shared concepts (schema-first, zero-boilerplate philosophy)
  - Sidebar Tabs: "Convex" and "SpacetimeDB" as top-level navigation
  - `<Tabs groupId="db" persist>` on all code examples for DB switching
- [ ] 6.3 — Migrate existing markdown docs (14 files each repo) to MDX:
  - `getting-started.mdx`, `api-reference.mdx`, `data-fetching.mdx`
  - `schema.mdx`, `mutations.mdx`, `forms.mdx`, `file-upload.mdx`
  - `org-management.mdx`, `devtools.mdx`, `testing.mdx`
  - `migration.mdx`, `schema-evolution.mdx`, `ejecting.mdx`
  - `security.mdx`, `recipes.mdx`
- [ ] 6.4 — Each doc page shows both Convex and SpacetimeDB code side-by-side with tabs
- [ ] 6.5 — Remove markdown docs from library packages (docs site is the single source)
- [ ] 6.6 — Deploy docs site (Vercel or similar)

### Phase 7: CLI (`ohmystack` npm package)
**Goal:** `bun ohmystack@latest init` creates a working project.

- [ ] 7.1 — Create `packages/cli/` with name `ohmystack`
- [ ] 7.2 — `init` command:
  1. Ask: "Pick your database" → Convex | SpacetimeDB
  2. Ask: "Include demo apps? (Y/n)"
  3. Ask: "Include mobile/desktop? (y/N)" (only if Convex)
  4. Clone repo (degit, no git history)
  5. Remove other DB's demo apps, backend, library package
  6. Remove `packages/shared/` source, `apps/docs/`, `PLAN.md`
  7. Patch all `package.json` files to use npm-published versions instead of `workspace:*`
  8. `bun i`
  9. Print: "Done! Run `bun dev` to start."
- [ ] 7.3 — `doctor` command — check if consumer's monorepo is outdated vs upstream
- [ ] 7.4 — `sync` command — pull and apply upstream changes to demos and components
- [ ] 7.5 — `eject` command — detach from upstream, convert to standalone project
- [ ] 7.6 — Remove `init` command from `@ohmystack/convex` and `@ohmystack/spacetimedb` CLIs

### Phase 8: README & Publishing
**Goal:** Ship it.

- [ ] 8.1 — Write root `README.md`:
  - Concise pitch: schema-first, zero-boilerplate, pick your DB
  - Quick start: `bun ohmystack@latest init`
  - Link to docs site
  - Feature comparison table (Convex vs SpacetimeDB)
  - Architecture diagram
- [ ] 8.2 — Register `@ohmystack` npm org
- [ ] 8.3 — Publish `@ohmystack/convex`, `@ohmystack/spacetimedb`, `ohmystack` to npm
- [ ] 8.4 — Publish deprecation notices on `betterspace` and `lazyconvex` npm packages
- [ ] 8.5 — CI green on all jobs
- [ ] 8.6 — All tests pass:
  - 934 Convex unit tests
  - 1,170 SpacetimeDB unit tests
  - 219 Convex backend tests
  - SpacetimeDB backend tests
  - E2E tests for all 8 web apps
  - Swift/Maestro tests for mobile/desktop

## Constraints (carried forward from both repos)

- bun only (no npm/yarn/npx/pnpm)
- Arrow functions only, all exports at end of file
- No comments (lint ignores allowed)
- No `any`, `Array#reduce()`, `forEach()`, non-null assertion (`!`)
- No hardcoded project-specific data in library packages
- Max 3 positional args, keyword args for 4+
- `bun fix` must always pass

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Import path changes break tests | Phase 2.3 runs all existing tests with new imports before anything else |
| Docker port conflicts (Convex + SpacetimeDB) | Assign non-overlapping ports in `ohmystack.yml` |
| Shared package extraction breaks types | Extract one file at a time, typecheck after each |
| Fumadocs learning curve | Phase 6 is independent — can ship Phases 0-5 first |
| npm org `@ohmystack` unavailable | Already registered `ohmystack` on npm — register org early |
| CI too slow with 8 apps + native builds | Path filtering (only run what changed) + turbo remote caching |

## Success Criteria

- [ ] `bun fix` passes at repo root
- [ ] `bun test` passes all library tests (934 + 1,170)
- [ ] `bun test:all` passes all tests including backend + E2E
- [ ] All 8 web demo apps build and run
- [ ] Mobile and desktop apps build and test
- [ ] `bun ohmystack@latest init` produces a working project for both DBs
- [ ] Documentation site live with DB switcher
- [ ] All three npm packages published
- [ ] CI green with path-filtered multi-job pipeline

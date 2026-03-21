# noboil — Migration & Implementation Plan

## Vision

Schema-first, zero-boilerplate fullstack. Pick your database, forget about the backend. `bun noboil@latest init` → ship in minutes.

## Motivation

betterspace (SpacetimeDB) and lazyconvex (Convex) share everything — philosophy, code, linting, dependencies, demo apps, monorepo structure. Maintaining two repos with ~70% identical code is wasteful. Consolidating into one monorepo unlocks massive reuse.

But this is not just a merge. noboil is a new home with a long-term vision. Every solution it offers is easy to use, easy to adopt, easy to configure, while covering all concerns about scalability and security. The goal: any dev picks a database and ships a fullstack app in minutes, not weeks, forgetting about backend configuration entirely.

Convex and SpacetimeDB are the first two supported backends. More will follow — drizzle + oRPC for SQL databases is on the roadmap (to be discussed after noboil ships, multi-db support needs careful consideration). The architecture is built to grow.

The repo IS the template. No separate template repos to maintain per library. The per-library `init` CLIs are removed — `bun noboil@latest init` handles everything. Clone the repo, strip library source and docs, keep the monorepo structure, GitHub Actions, shadcn components, strict linting, and demo apps to reference or clone. Consumers get the same DX we have — a `doctor` command checks if their project is outdated vs upstream, and a `sync` command pulls upstream changes.

Documentation lives in a fumadocs site, not scattered markdown files. The root README is a concise pitch that drives people straight to the docs site. Devs can switch between databases in a global toggle and see the difference in consumer code — same UX as SDKs that show multiple language clients side by side, but for different databases.

Both betterspace and lazyconvex remain valid on their own — they are archived as read-only references, not deprecated. noboil is where they grow from here.

## Source Repos (now archived, read-only)

- `1qh/betterspace` — SpacetimeDB framework (~31,700 LOC library, 1,170 tests)
- `1qh/lazyconvex` — Convex framework (~25,000 LOC library, 934 unit + 219 backend tests)
- `lib/ui/` is 100% identical across both repos (~12,700 LOC)

## npm Packages

| Package               | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `noboil`              | CLI only — `bun noboil@latest init`          |
| `@noboil/convex`      | Convex library (replaces `lazyconvex`)       |
| `@noboil/spacetimedb` | SpacetimeDB library (replaces `betterspace`) |

## Monorepo Structure

```
noboil/
├── web/cvx/{blog,chat,movie,org}        ← Convex demo web apps
├── web/stdb/{blog,chat,movie,org}       ← SpacetimeDB demo web apps
├── expo/cvx/{blog,chat,movie,org}       ← Convex Expo apps
├── expo/stdb/{blog,chat,movie,org}      ← SpacetimeDB Expo apps
├── doc/                                  ← fumadocs documentation site
├── lib/convex/                           ← @noboil/convex (published)
├── lib/spacetimedb/                      ← @noboil/spacetimedb (published)
├── lib/shared/                           ← internal shared hooks/components/utils
├── lib/ui/                               ← shared shadcn components (READ-ONLY)
├── lib/fe/                               ← shared frontend utilities
├── lib/e2e/                              ← shared Playwright utilities
├── backend/convex/                       ← Convex backend functions + schema
├── backend/spacetimedb/                  ← SpacetimeDB module + schema
├── tool/cli/                             ← noboil CLI (published as `noboil`)
├── mobile/convex/                        ← iOS/Android apps (Convex-only)
├── desktop/convex/                       ← macOS apps (Convex-only)
├── swiftcore/                            ← shared Swift protocols
├── noboil.yml                            ← Docker compose for all services
├── lintmax.config.ts                     ← unified linting config
├── turbo.json                            ← Turbo config
├── script/                               ← setup utilities
├── package.json                          ← workspace root
├── AGENTS.md                             ← project knowledge base
└── PLAN.md                               ← this file
```

## Code Sharing Strategy

### lib/shared/ (internal, never published)

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

Each published package imports from `lib/shared/` and re-exports:

```ts
// lib/convex/src/react/index.ts
export { useBulkMutate, useBulkSelection, useSearch } from '@a/shared/react'
export { useList } from './use-list' // Convex-specific implementation
```

Users see one clean import: `import { useList } from '@noboil/convex/react'`

## Execution Phases

### Phase 0: Monorepo Scaffold ✅

- [x] 0.1 — Initialize bun workspace with `package.json`, `turbo.json`, `tsconfig.json`
- [x] 0.2 — Unify `lintmax.config.ts` (single-surface lint via lintmax)
- [x] 0.3 — Unify ESLint rules into `lintmax.config.ts`
- [x] 0.4 — Set up `.github/workflows/ci.yml` (multi-job with path filtering)
- [x] 0.5 — Create `noboil.yml` docker compose (Convex + SpacetimeDB + MinIO)
- [x] 0.6 — `bun i && bun fix` passes

### Phase 1: Shared Packages ✅

- [x] 1.1 — `lib/ui/` (shared shadcn components)
- [x] 1.2 — `lib/fe/` (shared frontend utilities)
- [x] 1.3 — `lib/e2e/` (shared Playwright utilities)
- [x] 1.4 — `lib/shared/` — shared React hooks, components, server utils, ESLint plugin, CLI framework, Zod/seed/retry utils
- [x] 1.5 — `bun fix && bun typecheck` passes for all shared packages

### Phase 2: Library Packages ✅

- [x] 2.1 — `lib/convex/` with `@noboil/convex` exports
- [x] 2.2 — `lib/spacetimedb/` with `@noboil/spacetimedb` exports
- [x] 2.3 — Tests migrated and passing
- [x] 2.4 — `bun fix && bun typecheck && bun test` passes for both

### Phase 3: Backend Packages ✅

- [x] 3.1 — `backend/convex/` with `@noboil/convex` imports
- [x] 3.2 — `backend/spacetimedb/` with `@noboil/spacetimedb` imports
- [x] 3.3 — Docker compose with both DB services on non-conflicting ports
- [x] 3.4 — `genkey.sh` + `genenv.ts` setup scripts

### Phase 4: Demo Apps ✅

- [x] 4.1 — `web/cvx/{blog,chat,movie,org}` — Convex web apps
- [x] 4.2 — `web/stdb/{blog,chat,movie,org}` — SpacetimeDB web apps
- [x] 4.3 — `expo/cvx/{blog,chat,movie,org}` — Convex Expo apps
- [x] 4.4 — `expo/stdb/{blog,chat,movie,org}` — SpacetimeDB Expo apps
- [x] 4.5 — All apps build and lint-pass

### Phase 5: Mobile & Desktop (Convex-only) ✅

- [x] 5.1 — `mobile/convex/` (iOS/Android apps)
- [x] 5.2 — `desktop/convex/` (macOS apps)
- [x] 5.3 — `swiftcore/` (shared Swift protocols)
- [x] 5.4 — Swift codegen works: `bun codegen:swift`

### Phase 6: Documentation Site (fumadocs) ✅

- [x] 6.1 — Scaffold fumadocs app at `doc/` (Next.js App Router, fumadocs-ui)

### Phase 7: CLI (`noboil` npm package) ✅

- [x] 7.1 — `tool/cli/` with name `noboil` and bin entry
- [x] 7.2 — `init` command (database selection, project scaffolding)
- [x] 7.3 — `doctor` command (project health check)
- [x] 7.4 — `sync` command (pull upstream changes)
- [x] 7.5 — `eject` command (detach from upstream)

### Phase 8: README & Publishing ✅

- [x] 8.1 — Root `README.md`
- [x] 8.2 — `@noboil` npm org registered
- [x] 8.3 — `@noboil/convex`, `@noboil/spacetimedb`, `noboil` published to npm
- [x] 8.4 — CI green on all jobs

## Constraints (carried forward from both repos)

- bun only (no npm/yarn/npx/pnpm)
- Arrow functions only, all exports at end of file
- No comments (lint ignores allowed)
- No `any`, `Array#reduce()`, `forEach()`, non-null assertion (`!`)
- No hardcoded project-specific data in library packages
- Max 3 positional args, keyword args for 4+
- `bun fix` must always pass

## Risks & Mitigations

| Risk                                         | Mitigation                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Import path changes break tests              | Phase 2.3 runs all existing tests with new imports before anything else |
| Docker port conflicts (Convex + SpacetimeDB) | Assign non-overlapping ports in `noboil.yml`                            |
| Shared package extraction breaks types       | Extract one file at a time, typecheck after each                        |
| Fumadocs learning curve                      | Phase 6 is independent — can ship Phases 0-5 first                      |
| npm org `@noboil` unavailable                | Already registered `noboil` on npm — register org early                 |
| CI too slow with 8 apps + native builds      | Path filtering (only run what changed) + turbo remote caching           |

## Success Criteria

- [x] `bun fix` passes at repo root
- [x] `bun test` passes all library tests
- [x] All demo apps build and run
- [x] Mobile and desktop apps build
- [x] `noboil` CLI published with init/doctor/sync/eject commands
- [x] Documentation site scaffolded
- [x] All three npm packages published
- [x] CI green with path-filtered multi-job pipeline

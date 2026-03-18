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

## Target Monorepo Structure

```
noboil/
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
│   ├── convex/                ← @noboil/convex (from lazyconvex)
│   ├── spacetimedb/           ← @noboil/spacetimedb (from betterspace)
│   ├── shared/                ← internal, NOT published — shared hooks/components/utils
│   ├── ui/                    ← shared shadcn components (identical in both repos)
│   ├── be-convex/             ← Convex backend functions + schema (from lazyconvex packages/be)
│   ├── be-spacetimedb/        ← SpacetimeDB module + schema (from betterspace packages/be)
│   ├── fe/                    ← shared frontend utilities
│   ├── e2e/                   ← shared Playwright utilities
│   └── cli/                   ← noboil CLI (published as `noboil`)
├── mobile/
│   └── convex/                ← iOS/Android apps (from lazyconvex, Convex-only for now)
├── desktop/
│   └── convex/                ← macOS apps (from lazyconvex, Convex-only for now)
├── swiftcore/                ← shared Swift protocols (from lazyconvex)
├── noboil.yml              ← Docker compose for ALL services (Convex + SpacetimeDB + MinIO)
├── lintmax.config.ts          ← unified linting config
├── eslint.config.ts           ← unified ESLint config
├── turbo.json                 ← unified Turbo config
├── script/                   ← genkey.sh, genenv.ts, setup utilities
├── package.json               ← workspace root
├── AGENTS.md                  ← project knowledge base
└── PLAN.md                    ← this file
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

### Phase 0: Monorepo Scaffold

**Goal:** Empty monorepo with build/lint/test infrastructure working.

- [ ] 0.1 — Initialize bun workspace with `package.json`, `turbo.json`, `tsconfig.json`
- [ ] 0.2 — Copy and unify `lintmax.config.ts` (merge betterspace + lazyconvex overrides)
- [ ] 0.3 — Copy and unify `eslint.config.ts`
- [ ] 0.4 — Set up `.github/workflows/ci.yml` (multi-job with path filtering from lazyconvex, extended for both DBs)
- [ ] 0.5 — Copy `.vscode/` settings
- [ ] 0.6 — Create `noboil.yml` docker compose (Convex services + SpacetimeDB + shared MinIO on different ports)
- [ ] 0.7 — Verify `bun i && bun fix` passes on empty workspace

### Phase 1: Shared Packages (no DB-specific code)

**Goal:** `lib/shared/`, `lib/ui/`, `lib/fe/`, `lib/e2e/` all building.

- [ ] 1.1 — Copy `lib/ui/` from lazyconvex (identical in both repos)
- [ ] 1.2 — Copy `lib/fe/` (verify identical, pick one)
- [ ] 1.3 — Copy `lib/e2e/` (verify identical, pick one)
- [ ] 1.4 — Create `lib/shared/` — extract identical React hooks:
  - `use-bulk-mutate.ts`, `use-search.ts`, `use-bulk-selection.ts`
  - `use-optimistic.ts`, `use-soft-delete.ts`, `use-presence.ts`
  - `schema-playground.tsx`, `devtools-panel.tsx`, `devtools.ts`
  - `error-toast.ts`, `use-online-status.ts`, `use-upload.ts`, `use-cache.ts`
  - `optimistic-store.ts`, `form.ts`, `org.tsx`
- [ ] 1.5 — Extract shared server utils into `lib/shared/`:
  - `presence.ts`, `middleware.ts`, `schema-helpers.ts`
  - `helpers.ts`, `file.ts`, `child.ts`, `singleton.ts`, `cache-crud.ts`
  - `org.ts`, `org-crud.ts`, `org-members.ts`, `org-invites.ts`, `org-join.ts`
- [ ] 1.6 — Extract shared components into `lib/shared/`:
  - `editors-section.tsx`, `misc.tsx`, `step-form.tsx`, `form.tsx`, `fields.tsx`
- [ ] 1.7 — Extract shared ESLint plugin rules into `lib/shared/`
- [ ] 1.8 — Extract shared CLI commands into `lib/shared/`
- [ ] 1.9 — Extract shared Zod utils, schema types, seed utils, retry utils
- [ ] 1.10 — `bun fix && bun typecheck` passes for all shared packages

### Phase 2: Library Packages

**Goal:** `@noboil/convex` and `@noboil/spacetimedb` build and export everything.

- [ ] 2.1 — Create `lib/convex/` — copy DB-specific code from lazyconvex:
  - `crud.ts`, `use-list.ts`, `use-mutate.ts`, `types.ts`, `env.ts`
  - `codegen-swift.ts`, `setup.ts`
  - Re-export shared code from `lib/shared/`
  - package.json with name `@noboil/convex`, same exports as lazyconvex
- [ ] 2.2 — Create `lib/spacetimedb/` — copy DB-specific code from betterspace:
  - `crud.ts`, `use-list.ts`, `use-mutate.ts`, `provider.ts`, `list-utils.ts`
  - `rls.ts`, `stdb-tables.ts`, `reducer-utils.ts`, `s3.ts`, `setup.ts`
  - Re-export shared code from `lib/shared/`
  - package.json with name `@noboil/spacetimedb`, same exports as betterspace
- [ ] 2.3 — Migrate all tests:
  - Copy lazyconvex `pure.test.ts` (934 tests) → adapt imports to `@noboil/convex`
  - Copy betterspace `pure.test.ts` (1,170 tests) → adapt imports to `@noboil/spacetimedb`
- [ ] 2.4 — `bun fix && bun typecheck && bun test` passes for both library packages

### Phase 3: Backend Packages

**Goal:** Both backend packages deploy and pass backend tests.

- [ ] 3.1 — Copy `packages/be/` from lazyconvex → `backend/convex/`
  - Update imports from `lazyconvex` → `@noboil/convex`
  - Update package.json name to `@a/be-convex`
- [ ] 3.2 — Copy `packages/be/` from betterspace → `backend/spacetimedb/`
  - Update imports from `betterspace` → `@noboil/spacetimedb`
  - Update package.json name to `@a/be-spacetimedb`
- [ ] 3.3 — Docker compose: Convex (postgres + minio + backend + dashboard) on ports 3212/6791/9000
- [ ] 3.4 — Docker compose: SpacetimeDB on port 3000, MinIO on ports 9002/9003 (avoid conflicts)
- [ ] 3.5 — `genkey.sh` + `genenv.ts` for Convex, equivalent for SpacetimeDB
- [ ] 3.6 — Backend tests pass: 219 (Convex) + equivalent (SpacetimeDB)

### Phase 4: Demo Apps

**Goal:** All 8 web demo apps build and run.

- [ ] 4.1 — Copy lazyconvex `apps/{blog,chat,movie,org}` → `web/cvx/{blog,chat,movie,org}`
  - Update imports from `lazyconvex` → `@noboil/convex`
  - Update package.json names to `@a/convex-blog`, etc.
  - Update internal workspace references
- [ ] 4.2 — Copy betterspace `apps/{blog,chat,movie,org}` → `web/stdb/{blog,chat,movie,org}`
  - Update imports from `betterspace` → `@noboil/spacetimedb`
  - Update package.json names to `@a/stdb-blog`, etc.
  - Update internal workspace references
- [ ] 4.3 — All 8 apps: `bun fix && bun build` passes
- [ ] 4.4 — E2E tests pass for all 8 apps

### Phase 5: Mobile & Desktop (Convex-only)

**Goal:** Native apps build and test.

- [ ] 5.1 — Copy lazyconvex `mobile/` → `mobile/convex/`
- [ ] 5.2 — Copy lazyconvex `desktop/` → `desktop/convex/`
- [ ] 5.3 — Copy `swiftcore/`
- [ ] 5.4 — Swift codegen works: `bun codegen:swift`
- [ ] 5.5 — All native builds pass, Maestro tests pass, Swift tests pass

### Phase 6: Documentation Site (fumadocs)

**Goal:** `doc/` serves unified documentation with DB switcher.

- [ ] 6.1 — Scaffold fumadocs app at `doc/`
  - Next.js App Router, fumadocs-ui, fumadocs-mdx
  - Tailwind + `lib/ui/` integration
- [ ] 6.2 — Content architecture:
  - `content/docs/` — shared concepts (schema-first, zero-boilerplate philosophy)
  - Sidebar Tabs: “Convex” and “SpacetimeDB” as top-level navigation
  - `<Tabs groupId="db" persist>` on all code examples for DB switching
- [ ] 6.3 — Migrate existing markdown docs (15 files each repo) to MDX:
  - `getting-started.mdx`, `api-reference.mdx`, `data-fetching.mdx`
  - `schema.mdx`, `mutations.mdx`, `forms.mdx`, `file-upload.mdx`
  - `org-management.mdx`, `devtools.mdx`, `testing.mdx`
  - `migration.mdx`, `schema-evolution.mdx`, `ejecting.mdx`
  - `security.mdx`, `recipes.mdx`
- [ ] 6.4 — Each doc page shows both Convex and SpacetimeDB code side-by-side with tabs
- [ ] 6.5 — Remove markdown docs from library packages (docs site is the single source)
- [ ] 6.6 — Deploy docs site (Vercel or similar)

### Phase 7: CLI (`noboil` npm package)

**Goal:** `bun noboil@latest init` creates a working project.

- [ ] 7.1 — Create `tool/cli/` with name `noboil`
- [ ] 7.2 — `init` command:
  1. Ask: “Pick your database” → Convex | SpacetimeDB
  2. Ask: “Include demo apps? (Y/n)”
  3. Ask: “Include mobile/desktop? (y/N)” (only if Convex)
  4. Clone repo (degit, no git history)
  5. Remove other DB’s demo apps, backend, library package
  6. Remove `lib/shared/` source, `doc/`, `PLAN.md`
  7. Patch all `package.json` files to use npm-published versions instead of `workspace:*`
  8. `bun i`
  9. Print: “Done! Run `bun dev` to start.”
- [ ] 7.3 — `doctor` command — check if consumer’s monorepo is outdated vs upstream
- [ ] 7.4 — `sync` command — pull and apply upstream changes to demos and components
- [ ] 7.5 — `eject` command — detach from upstream, convert to standalone project
- [ ] 7.6 — Remove `init` command from `@noboil/convex` and `@noboil/spacetimedb` CLIs

### Phase 8: README & Publishing

**Goal:** Ship it.

- [ ] 8.1 — Write root `README.md`:
  - Concise pitch: schema-first, zero-boilerplate, pick your DB
  - Quick start: `bun noboil@latest init`
  - Link to docs site
  - Feature comparison table (Convex vs SpacetimeDB)
  - Architecture diagram
- [ ] 8.2 — Register `@noboil` npm org
- [ ] 8.3 — Publish `@noboil/convex`, `@noboil/spacetimedb`, `noboil` to npm
- [ ] 8.4 — CI green on all jobs
- [ ] 8.5 — All tests pass:
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

| Risk                                         | Mitigation                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Import path changes break tests              | Phase 2.3 runs all existing tests with new imports before anything else |
| Docker port conflicts (Convex + SpacetimeDB) | Assign non-overlapping ports in `noboil.yml`                            |
| Shared package extraction breaks types       | Extract one file at a time, typecheck after each                        |
| Fumadocs learning curve                      | Phase 6 is independent — can ship Phases 0-5 first                      |
| npm org `@noboil` unavailable                | Already registered `noboil` on npm — register org early                 |
| CI too slow with 8 apps + native builds      | Path filtering (only run what changed) + turbo remote caching           |

## Success Criteria

- [ ] `bun fix` passes at repo root
- [ ] `bun test` passes all library tests (934 + 1,170)
- [ ] `bun test:all` passes all tests including backend + E2E
- [ ] All 8 web demo apps build and run
- [ ] Mobile and desktop apps build and test
- [ ] `bun noboil@latest init` produces a working project for both DBs
- [ ] Documentation site live with DB switcher
- [ ] All three npm packages published
- [ ] CI green with path-filtered multi-job pipeline

## Ralph Loop Prompt

```
/ralph-loop "Execute PLAN.md phases 0 through 8 for the noboil monorepo. Read PLAN.md and AGENTS.md first — they are your single source of truth for structure, tasks, constraints, and code conventions.

Work phase by phase in order. Within each phase, work task by task. After each task, run the phase's verification command before moving on. After each phase, run full verification before starting the next phase.

Phase gate verification (run after completing each phase):
- Phase 0: bun i && bun fix
- Phase 1: bun fix && bun typecheck
- Phase 2: bun fix && bun typecheck && bun test
- Phase 3: docker compose -f noboil.yml up -d && backend tests pass for both DBs
- Phase 4: bun fix && bun build for all 8 apps && E2E tests pass
- Phase 5: Swift codegen && native builds && Maestro tests && Swift tests
- Phase 6: bun fix && bun build for docs app && docs site renders with DB switcher
- Phase 7: bun noboil@latest init works for both Convex and SpacetimeDB choices
- Phase 8: all npm packages published && CI green && all success criteria checked off

Source repos (archived, read-only — copy from these):
- /Users/o/z/betterspace (SpacetimeDB)
- /Users/o/z/lazyconvex (Convex)
- /Users/o/z/lintmax (linting framework source)

If any verification fails, fix it before moving forward. If stuck after 3 attempts on the same issue, consult Oracle. Never skip a failing check. Never leave tests broken. Commit after each completed task. Push after each completed phase.

Do not stop until every task in every phase is done and every success criterion at the bottom of PLAN.md is checked off." --max-iterations=100
```

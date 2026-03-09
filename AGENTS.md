# ohmystack

Schema-first, zero-boilerplate fullstack. Pick your database, forget about the backend.

## Monorepo Structure

```
apps/
  convex/{blog,chat,movie,org}       — Convex demo web apps
  spacetimedb/{blog,chat,movie,org}  — SpacetimeDB demo web apps
  docs/                              — fumadocs documentation site
packages/
  convex/          — @ohmystack/convex (published)
  spacetimedb/     — @ohmystack/spacetimedb (published)
  shared/          — internal shared code (NOT published)
  ui/              — shared shadcn components
  be-convex/       — Convex backend functions + schema
  be-spacetimedb/  — SpacetimeDB module + schema
  fe/              — shared frontend utilities
  e2e/             — shared Playwright utilities
  cli/             — ohmystack CLI (published as `ohmystack`)
mobile/convex/     — iOS/Android apps (Convex-only)
desktop/convex/    — macOS apps (Convex-only)
swift-core/        — shared Swift protocols
```

## Code Conventions

### Mandatory

- bun only — yarn/npm/npx/pnpm forbidden
- Arrow functions only
- All exports at end of file
- No comments (lint ignores allowed)
- No `any`, `Array#reduce()`, `forEach()`, non-null assertion (`!`)
- No `as any`, `@ts-ignore`, `@ts-expect-error`
- No hardcoded project-specific data in library packages (`packages/convex/`, `packages/spacetimedb/`, `packages/shared/`)
- Max 3 positional args — use keyword args (destructured object) for 4+
- `bun fix` must always pass
- Never touch files inside `packages/ui/` (shared components, read-only)

### Style

- `for` loops instead of `reduce()` or `forEach()`
- Exhaustive `switch` with `default: never` where applicable
- Prefer existing libraries over new dependencies

## Commands

```bash
bun i              # install all dependencies
bun fix            # lint + format + typecheck + build (must pass before commit)
bun dev:web        # start all web demo apps
bun test           # run library unit tests
bun test:all       # run ALL tests (unit + backend + e2e + native)
```

### Convex Backend Setup

```bash
docker compose -f ohmystack.yml up -d    # start all services
bash genkey.sh                            # get Convex admin key
bun genenv.ts                             # generate env vars
# then set env vars on Convex backend with `convex env set`
```

## npm Packages

| Package | Purpose |
|---|---|
| `ohmystack` | CLI — `bun ohmystack@latest init` |
| `@ohmystack/convex` | Convex library (replaces `lazyconvex`) |
| `@ohmystack/spacetimedb` | SpacetimeDB library (replaces `betterspace`) |

## packages/shared/ Architecture

Internal workspace package, never published. Contains code identical across both libraries:

- **React hooks**: `use-bulk-mutate`, `use-search`, `use-bulk-selection`, `use-optimistic`, `use-soft-delete`, `use-presence`, `use-cache`, `use-upload`, `use-online-status`, `error-toast`, `devtools`, `form`, `org`
- **Server utils**: `presence`, `middleware`, `schema-helpers`, `helpers`, `file`, `child`, `singleton`, `cache-crud`, `org`, `org-crud`, `org-members`, `org-invites`, `org-join`
- **Components**: `editors-section`, `misc`, `step-form`, `form`, `fields`
- **ESLint plugin**: 16 shared rules
- **CLI framework**: create, add, check commands
- **Zod utils**, seed utils, retry utils

Each published package re-exports from shared:
```ts
export { useBulkMutate } from '@a/shared/react'
export { useList } from './use-list' // DB-specific
```

## Key Technical Discoveries

1. **oxlint `eslint/sort-keys` conflicts with eslint perfectionist** — oxlint uses ASCII sort, perfectionist uses natural sort. Disable `eslint/sort-keys` in oxlint config.

2. **Lintmax runs biome TWICE** (biome → oxlint → eslint → biome). The 2nd biome pass can undo eslint auto-fixes. Disable conflicting biome rules like `noPlaywrightUselessAwait`.

3. **`next-env.d.ts` format mismatch** — Next.js generates with double quotes + semicolons, biome enforces single quotes + none. Add `apps/*/next-env.d.ts` to biome ignore.

4. **Docker port conflicts** — Convex MinIO uses 9000/9001, SpacetimeDB also needs MinIO. Assign different ports in `ohmystack.yml` to avoid conflicts.

5. **Convex `genenv.ts` outputs env vars** — must be set on backend via `convex env set`. JWT private key needs `--` separator due to dashes.

## Testing

| Suite | Runner | Count |
|---|---|---|
| Convex library | bun:test | 934 |
| SpacetimeDB library | bun:test | 1,170 |
| Convex backend | convex-test | 219 |
| Web E2E | Playwright | 220 per DB |
| Swift desktop | Swift Testing | 32 |
| Mobile | Maestro | 92 |

## Git Conventions

- Commit frequently after each small unit of work
- Push after logical groups of commits
- Never mention AI tooling in commit messages
- Commit message format: `type: description` (fix, feat, docs, chore, refactor, test)

## Design Decisions

- **All deps use `"latest"`** — intentional. The workspace always tests against newest versions. Consumers pin via `noboil init` which snapshots exact versions. This keeps us ahead of breaking changes instead of discovering them months later.
- **`sharp` is a hard dependency** — intentional. Users get optimized images out of the box. It’s only imported in the `/next` export path (server-side image route), so client bundles never include it.

## Port Allocation

All services and apps use the 4xxx range so they don’t conflict with common dev ports (3000-3999). All 8 demo apps can run simultaneously.

| Port | Service                |
| ---- | ---------------------- |
| 4000 | SpacetimeDB server     |
| 4001 | Convex backend API     |
| 4002 | Convex site            |
| 4100 | cvx/blog               |
| 4101 | cvx/chat               |
| 4102 | cvx/movie              |
| 4103 | cvx/org                |
| 4200 | stdb/blog              |
| 4201 | stdb/chat              |
| 4202 | stdb/movie             |
| 4203 | stdb/org               |
| 4300 | doc site               |
| 4400 | agent                  |
| 4500 | Convex dashboard       |
| 5432 | Postgres (SpacetimeDB) |
| 4600 | stdb MinIO API         |
| 4601 | stdb MinIO console     |

**Do NOT change these ports** — they are referenced in docker compose files, env files, playwright configs, E2E helpers, library defaults, and documentation. Changing one port requires updating all of them.

## Monorepo

```
web/cvx/              — Convex demo web apps
web/stdb/              — SpacetimeDB demo web apps
doc/                   — fumadocs site
lib/convex/            — @noboil/convex (npm published)
lib/spacetimedb/       — @noboil/spacetimedb (npm published)
lib/shared/            — internal shared code (NOT published)
readonly/ui/           — shared shadcn components (READ-ONLY, synced from cnsync)
backend/convex/        — Convex backend functions + schema
backend/spacetimedb/   — SpacetimeDB module + schema
lib/fe/                — shared frontend utilities
lib/e2e/               — shared Playwright utilities
tool/cli/              — noboil CLI (published as `noboil`)
```

Library packages (`lib/convex/`, `lib/spacetimedb/`) are published to npm. `lib/shared/` is internal-only (never published) — both libraries import from it via workspace alias `@a/shared`. Everything else is consumer code. Libraries must work for ANY project — never hardcode project-specific data.

## Shared Code (lib/shared/)

- COMMIT new shared files immediately — uncommitted files are lost on `bun clean`.
- Use factory pattern with DB-specific config injected as parameters.
- Export all types used in public API — DTS generation fails on unexported internal types leaking through re-exports.

## Convex

**`anyApi` trap**: Runtime is a Proxy accepting any property name — `api.blogprofile.get` (wrong casing) won’t type-error. Always match `api.<module>` to exact filenames. Rely on E2E tests.

**Setup**: `bun convex:up && bash script/genkey.sh && bun script/genenv.ts` → `convex env set` (JWT key needs `--` separator)

## SpacetimeDB

Generates TS bindings from Rust module. Regenerate after schema changes: `bun spacetime:generate`. Table/reducer names must match exactly. Columns: snake_case in Rust → camelCase in TS. Import from `@a/be-spacetimedb/spacetimedb`.

## lib/shared/

Internal, never published. Workspace alias `@a/shared`. Both libraries import from it and re-export with DB-specific config.

## Next.js

Both databases need `await connection()` in Server Components for dynamic rendering:

```tsx
import { connection } from 'next/server'
const Page = async () => {
  await connection()
  return <Client />
}
```

## Testing

| Suite               | Runner      |
| ------------------- | ----------- |
| Convex library      | bun:test    |
| SpacetimeDB library | bun:test    |
| Convex backend      | convex-test |
| Web E2E             | Playwright  |

### E2E with Real Services

Convex E2E (per app): `cd web/cvx/{app} && SKIP_CONVEX_ENV_TOGGLE=1 CONVEX_TEST_MODE=true bun with-env playwright test --reporter=dot`

SpacetimeDB E2E (per app): `cd web/stdb/{app} && SKIP_CONVEX_ENV_TOGGLE=1 SPACETIMEDB_TEST_MODE=true bun with-env playwright test --reporter=dot`

Pre-test: `bun fix` passes · `pkill -9 -f "next"` · `rm -rf test-results`

Convex: `cd backend/convex && CONVEX_TEST_MODE=true bun with-env convex dev --once`

SpacetimeDB: `SPACETIMEDB_TEST_MODE=true bun spacetime:publish`

## react-doctor

Run `bunx -y react-doctor@latest . --verbose` after adding components or before releases.

Always enforce: `use*` hook naming · stable array keys (never indices) · `<Suspense>` around `useSearchParams()` · no `Date.now()`/`Math.random()` in render

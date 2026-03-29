If `README.md` exists at the repo root, read it first.

**Pre-push (mandatory):** `bun clean:all && bun i && bun fix && bun test:all`

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
| 5432 | Postgres (Convex)      |
| 5432 | Postgres (SpacetimeDB) |
| 4600 | stdb MinIO API         |
| 4601 | stdb MinIO console     |

**Do NOT change these ports** — they are referenced in docker compose files, env files, playwright configs, E2E helpers, library defaults, and documentation. Changing one port requires updating all of them.

## Monorepo

```
web/cvx/              — Convex demo web apps
web/stdb/         — SpacetimeDB demo web apps
doc/                — fumadocs site
lib/convex/          — @noboil/convex (npm published)
lib/spacetimedb/     — @noboil/spacetimedb (npm published)
lib/shared/          — internal shared code (NOT published)
lib/ui/              — shared shadcn components (READ-ONLY, use bun ui:sync)
backend/convex/       — Convex backend functions + schema
backend/spacetimedb/  — SpacetimeDB module + schema
lib/fe/              — shared frontend utilities
lib/e2e/             — shared Playwright utilities
tool/cli/             — noboil CLI (published as `noboil`)
```

Library packages (`lib/convex/`, `lib/spacetimedb/`) are published to npm. `lib/shared/` is internal-only (never published) — both libraries import from it via workspace alias `@a/shared`. Everything else is consumer code. Libraries must work for ANY project — never hardcode project-specific data.

---

## Standards

### Must do

- Only `bun` — yarn/npm/npx/pnpm forbidden
- `bun fix` must always pass
- Only arrow functions
- All exports at end of file
- `.tsx` with single component → `export default`; utilities/backend → named exports
- `for` loops instead of `reduce()` or `forEach()`
- Exhaustive `switch` with `default: never`
- `catch (error)` enforced by oxlint — name state vars descriptively to avoid shadow (`chatError`, `formError`)
- Short map callback names: `t`, `m`, `i`
- Max 3 positional args — use destructured object for 4+
- Co-locate components with their page; only move to `~/components` when reused
- Explicit imports from exact file paths — no barrel `index.ts` in app code (library packages use barrels for their public API)
- Prefer existing libraries over new dependencies

### Must NOT do

- NEVER write comments (lint ignores allowed)
- NEVER touch `lib/ui/` manually
- NEVER use `!` (non-null assertion), `any`, `as any`, `@ts-ignore`, `@ts-expect-error`
- NEVER disable lint rules globally/per-directory — fix the code
- NEVER ignore written source code from linters — only auto-generated code (`_generated/`, `generated/`, `module_bindings/`, `lib/ui/`)
- NEVER reduce lintmax strictness — if upstream removes rules, find replacements

### Script output philosophy

- Scripts: silent on success, verbose on failure. Prefer `q ...` for noisy commands.
- NEVER use `git clean` — it deletes `.env` and uncommitted files. Use explicit `rm -rf`.

### Shared code (lib/shared/)

- COMMIT new shared files immediately — uncommitted files are lost on `bun clean`.
- Use factory pattern with DB-specific config injected as parameters.
- Export all types used in public API — DTS generation fails on unexported internal types leaking through re-exports.

---

## Linters & Lintmax

**lintmax** is our own max-strict lint/format orchestrator. Source at `~/z/lintmax`. We own it — read the source code to understand the pipeline, and feel free to suggest improvements that bring better strictness or better defaults.

### Ignore syntax

| Linter | File-level                                           | Per-line                                         |
| ------ | ---------------------------------------------------- | ------------------------------------------------ |
| oxlint | `/* oxlint-disable rule-name */`                     | `// oxlint-disable-next-line rule-name`          |
| eslint | `/* eslint-disable rule-name */`                     | `// eslint-disable-next-line rule-name`          |
| biome  | `/** biome-ignore-all lint/category/rule: reason */` | `/** biome-ignore lint/category/rule: reason */` |

### Ignore strategy

1. **Fix the code** — always first choice
2. **File-level disable** — when a file has many unavoidable violations of the same rule (sequential DB mutations, standard React patterns, external images)
3. **Per-line ignore** — isolated unavoidable violations
4. **Consolidate** — if file-level `biome-ignore-all` exists, remove redundant per-line `biome-ignore` for the same rule
5. NEVER 5+ per-line ignores for the same rule — use file-level

- File-level directives go at absolute file top, above any imports/code (including `'use client'`/`'use node'`).
- Remove duplicate directives; keep one canonical directive block.
- Use one top `eslint-disable` line per file; combine multiple rules with commas.

### Cross-linter rules

- 2 linters with the same rule (biome `noAwaitInLoops` + oxlint `no-await-in-loop`) = double enforcement, NOT a conflict. Never disable one because the other covers it.
- To suppress a shared eslint/oxlint rule: suppress eslint’s version — oxlint auto-picks up eslint rules and is faster.
- oxlint `eslint/sort-keys` conflicts with perfectionist (ASCII vs natural sort) — disabled in lintmax.

### Safe-to-ignore rules

**oxlint:** `promise/prefer-await-to-then` (Promise.race, ky chaining)

**eslint:** `no-await-in-loop`, `max-statements`, `max-depth`, `complexity` (sequential ops) · `@typescript-eslint/no-unnecessary-condition` (type narrowing) · `@typescript-eslint/promise-function-async` (thenable returns) · `@typescript-eslint/max-params` · `@next/next/no-img-element` (external images) · `react-hooks/refs`

**biome:** `style/noProcessEnv` (env files) · `performance/noAwaitInLoops` (sequential ops) · `nursery/noForIn` · `performance/noImgElement` · `suspicious/noExplicitAny` (generic boundaries)

## Playbook Maintenance

- Every new lesson must be merged into the most relevant existing section immediately; do NOT create append-only “recent lessons” buckets.
- Correct rules in place (single source of truth), then remove superseded guidance.

---

## Testing

| Suite               | Runner      |
| ------------------- | ----------- |
| Convex library      | bun:test    |
| SpacetimeDB library | bun:test    |
| Convex backend      | convex-test |
| Web E2E             | Playwright  |

### E2E (Playwright)

**Verify before scaling.** Never run full suites blindly.

```bash
timeout 10 bun with-env playwright test -g "test name" --timeout=5000  # single test
timeout 30 bun with-env playwright test path/to/file.test.ts           # single file
bun test:e2e -- --workers=1 --timeout=10000 --reporter=dot             # full (user asks only)
```

| Scope       | Timeout  | Kill |
| ----------- | -------- | ---- |
| Single test | 5s       | 10s  |
| Single file | 8s/test  | 30s  |
| Full suite  | 10s/test | 180s |

**AI agents**: Run only failing tests, verify 2-3x, stop. Full suite only when user asks. **Pre-test**: `bun fix` passes · `pkill -9 -f "next"` · `rm -rf test-results` **Convex**: `cd backend/convex && CONVEX_TEST_MODE=true bun with-env convex dev --once` **SpacetimeDB**: `SPACETIMEDB_TEST_MODE=true bun spacetime:publish`

### E2E with real services

Convex E2E (per app): `cd web/cvx/{app} && SKIP_CONVEX_ENV_TOGGLE=1 CONVEX_TEST_MODE=true bun with-env playwright test --reporter=dot`

SpacetimeDB E2E (per app): `cd web/stdb/{app} && SKIP_CONVEX_ENV_TOGGLE=1 SPACETIMEDB_TEST_MODE=true bun with-env playwright test --reporter=dot`

| Symptom                     | Fix                               |
| --------------------------- | --------------------------------- |
| Hangs on `fill()`/`click()` | Check element visible/enabled     |
| `networkidle` hangs         | Use `waitForSelector()` instead   |
| Element not found           | Check testid on element vs parent |
| Flaky counts                | `--workers=1`                     |

---

## Minimal DOM (React + Tailwind)

Same UI, fewest DOM nodes. Every element must earn its place. If you can delete it and nothing breaks (semantics, layout, behavior, required styling) → it shouldn’t exist.

**A node is allowed only if it provides:**

- **Semantics/a11y** — correct elements (`ul/li`, `button`, `label`, `form`, `nav`, `section`), ARIA patterns, focus behavior
- **Layout constraint** — needs its own containing block / positioning / clipping / scroll / stacking context (`relative`, `overflow-*`, `sticky`, `z-*`, `min-w-0`)
- **Behavior** — measurement refs, observers, portals, event boundary, virtualization
- **Component API** — can’t pass props/classes to the real root (and you tried `as`/`asChild`/prop forwarding)

**Before adding wrappers:**

- Spacing → parent `gap-*` (flex/grid) or `space-x/y-*`
- Separators → parent `divide-y / divide-x`
- Alignment → `flex`/`grid` on existing parent
- Visual (padding/bg/border/shadow/radius) → on the element that owns the box
- JSX grouping → `<>...</>` (Fragment), not `<div>`

**Styling children — props first, selectors second:**

- Mapped component → pass `className` to the item
- Uniform direct children → `*:` or `[&>tag]:` to avoid repeating classes

```tsx
// bad: repeated classes
<div className='divide-y'>
  <p className='px-3 py-2'>A</p>
  <p className='px-3 py-2'>B</p>
</div>
// good: selector pushdown
<div className='divide-y [&>p]:px-3 [&>p]:py-2'>
  <p>A</p>
  <p>B</p>
</div>
```

**Tailwind selector tools:**

- `*:` direct children · `[&>li]:py-2` targeted · `[&_a]:underline` descendant (sparingly)
- `group`/`peer` on existing nodes → `group-hover:*`, `peer-focus:*`
- `data-[state=open]:*`, `aria-expanded:*`, `disabled:*`
- `first:` `last:` `odd:` `even:` `only:` — structural variants

**Review checklist:** Can I delete this node? → delete. Can `gap/space/divide` replace it? → do it. Can I pass `className`? → do it. Can `[&>...]:` remove repetition? → do it.

---

## react-doctor

Run `bunx -y react-doctor@latest . --verbose` after adding components or before releases.

**False positives**: Unused Next.js entry files, cross-package exports, `<img>` for storage URLs, SPA form `preventDefault()`, intersection observer `useEffect`, `useSearchParams` with Suspense at call site, `dangerouslySetInnerHTML` in org-redirect, missing demo app metadata.

**Always enforce**: `use*` hook naming · stable array keys (never indices) · `<Suspense>` around `useSearchParams()` · no `Date.now()`/`Math.random()` in render

---

## Next.js

Both databases need `await connection()` in Server Components for dynamic rendering:

```tsx
import { connection } from 'next/server'
const Page = async () => {
  await connection()
  return <Client />
}
```

---

## Convex

**`anyApi` trap**: Runtime is a Proxy accepting any property name — `api.blogprofile.get` (wrong casing) won’t type-error. Always match `api.<module>` to exact filenames. Rely on E2E tests.

**Setup**: `bun convex:up && bash script/genkey.sh && bun script/genenv.ts` → `convex env set` (JWT key needs `--` separator)

## SpacetimeDB

Generates TS bindings from Rust module. Regenerate after schema changes: `bun spacetime:generate`. Table/reducer names must match exactly. Columns: snake_case in Rust → camelCase in TS. Import from `@a/be-spacetimedb/spacetimedb`.

## lib/shared/

Internal, never published. Workspace alias `@a/shared`. Both libraries import from it and re-export with DB-specific config.

## Known Gotchas

- `next-env.d.ts` format mismatch — Next.js generates double quotes + semicolons, biome wants single + none. Add to biome ignore.
- LSP errors in `tool/cli/src/*.ts` and `lib/*/src/doctor.ts` are false positives — `bun run tsc` passes fine.
- Base UI Switch renders as `<span>` not `<button>` — use `[role="switch"]` selector in E2E tests, never `button[role="switch"]`.
- SpacetimeDB CLI must match SDK version — after `bun i`, check `spacetime version list` vs `node_modules/spacetimedb/package.json`. Mismatched CLI generates bindings missing `accessor` field on indexes, causing silent client-side connection failure. Fix: `spacetime version upgrade && spacetime publish ... && spacetime generate ...`.
- SpacetimeDB v2.0 index accessors (`table.slug`, `table.id`) are NOT iterable. Don’t pass them to `for..of` — iterate the table directly.
- SpacetimeDB E2E: republish module before running tests (`bun spacetime:publish`). Stale module state causes “fatal error” on reducers.
- SpacetimeDB E2E: stdb blog avatar upload test requires working MinIO presign endpoint. Check MinIO container health.
- Shimmer component (`@a/ui/ai-elements/shimmer`) requires `as` prop (e.g. `as="p"`). Without it, `motion.create(undefined)` crashes.
- SpacetimeDB SDK `createSpacetimeClient` caches the connection builder at module scope. Once created with a token, it never re-reads localStorage. The `lib/spacetimedb/src/react/provider.ts` invalidates cache when token changes, but the browser’s first connection might use an anonymous identity before the `addInitScript` token is available. In Playwright tests, some serial groups may see stale identity.
- SpacetimeDB SDK `useTable` returns `[data, isReady]`. The `isReady` flag (`subscribeApplied`) may stay `false` in React strict mode due to double-effect. Use `data.length > 0` as a supplementary ready signal. Use `useRef` to prevent `isReady` from flipping back to `false`.
- SpacetimeDB SDK subscription re-renders can cause React components to briefly unmount and remount. Pagination controls and other conditional UI should use stable state (e.g., `wasReadyRef`) to prevent flip-flop. The `pickPatch` in `reducer-utils.ts` uses `key in args` (not `value !== undefined`) so that `Option::None` values are included in updates.
- SpacetimeDB `org_create` auto-creates an `org_member` entry for the owner. The org layout checks both `org.userId` (ownership) and `org_member` (membership) to build `myOrgItems`.
- SpacetimeDB cascade deletion: configure `cascadeTo: { foreignKey, table }` in `orgScopedTable` options. The `rm_*` reducer iterates the child table and deletes matching rows before deleting the parent.
- SpacetimeDB singleton tables (blogProfile, orgProfile) have auto-incremented primary keys. The `upsert_*` reducer uses `table.id.update()` for existing records.
- SpacetimeDB org E2E: test helpers (`lib/e2e/src/stdb-org-helpers.ts`) share identity with browser via `addInitScript` + `activeOrgId` cookie. Run `spacetime publish --delete-data` before test runs. The `cleanupOrgTestData` deletes ALL orgs (not prefix-filtered) to handle browser-created orgs.
- SpacetimeDB org E2E: `removeTestOrgMember` finds the member by identity substring match (`String(m.user_id).includes(userId.slice(0, 20))`). SpacetimeDB serializes Identity as `[[“0xHEX”]]` in SQL responses.
- SpacetimeDB blog avatar E2E: requires MinIO with public-read bucket. Setup: `docker exec noboil-stdb-minio-1 mc mb --ignore-existing local/mybucket && docker exec noboil-stdb-minio-1 mc anonymous set download local/mybucket`. Set `.env`: `S3_ACCESS_KEY_ID=minioadmin S3_SECRET_ACCESS_KEY=minioadmin S3_ENDPOINT=http://localhost:4600 S3_BUCKET=mybucket`.
- SpacetimeDB RLS: v2.0 subscriptions cannot evaluate JOIN-based SQL. Org-scoped table subscriptions use sender-only filters, not JOINs. The `org_member` table has no RLS (all members visible to all users) so org owners can see all members.
- SpacetimeDB E2E remaining flaky tests (4 of 440): `blog.test.ts:75` (edit form subscription stale in long suites), `blog-pagination.test.ts:17` (pagination status flip-flop), `org.test.ts:203` (removeMember invite token flow). These pass individually but occasionally fail in full suite due to SpacetimeDB connection caching.

## Git

Commit frequently, push logical groups. Never mention AI tooling. Format: `type: description` (fix, feat, docs, chore, refactor, test).

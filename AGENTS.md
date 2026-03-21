If `README.md` or `PLAN.md` exists at the repo root, read it first.

**Pre-push (mandatory):** `bun clean:all && bun i && bun fix && bun test:all`

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

Library packages (`lib/convex/`, `lib/spacetimedb/`, `lib/shared/`) are published to npm. Everything else is consumer code. Libraries must work for ANY project — never hardcode project-specific data.

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
- Explicit imports from exact file paths — no barrel `index.ts` files
- Prefer existing libraries over new dependencies

### Must NOT do

- NEVER write comments (lint ignores allowed)
- NEVER touch `lib/ui/` manually
- NEVER use `!` (non-null assertion), `any`, `as any`, `@ts-ignore`, `@ts-expect-error`
- NEVER disable lint rules globally/per-directory — fix the code
- NEVER ignore written source code from linters — only auto-generated code (`_generated/`, `generated/`, `module_bindings/`, `lib/ui/`)
- NEVER reduce lintmax strictness — if upstream removes rules, find replacements

### Script output philosophy

- Scripts: silent on success, verbose on failure. Prefer `q ...` for noisy commands and keep script definitions concise.
- NEVER use `git clean` in scripts — it deletes `.env`, untracked source files, and anything not committed. Use explicit `rm -rf` of known build dirs instead.

---

## Linters & Lintmax

### Pipeline

**lintmax** is our own lint/format orchestrator. We own it — publish new versions to improve strictness, better defaults, or eliminate cross-linter conflicts.

```
biome fix → oxlint fix → eslint fix → biome fix (again)
```

**Why biome runs twice**: oxlint/eslint auto-fixes can introduce formatting drift. The 2nd biome pass re-normalizes.

**Cross-linter conflicts**: One linter’s auto-fix can violate another. Fix in lintmax config, not project code.

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

**Setup**: `docker compose -f noboil.yml up -d && bash genkey.sh && bun genenv.ts` → `convex env set` (JWT key needs `--` separator)

## SpacetimeDB

Generates TS bindings from Rust module. Regenerate after schema changes: `bun spacetime:generate`. Table/reducer names must match exactly. Columns: snake_case in Rust → camelCase in TS. Import from `@a/be-spacetimedb/spacetimedb`.

## lib/shared/

Internal, never published. Shared across both libraries: React hooks, server utils, components, ESLint plugin (16 rules), CLI framework, Zod/seed/retry utils. Each published package re-exports from shared.

## Known Gotchas

- `next-env.d.ts` format mismatch — Next.js generates double quotes + semicolons, biome wants single + none. Add to biome ignore.
- Docker port conflicts — Convex MinIO 9000/9001 vs SpacetimeDB MinIO. Use different ports in `noboil.yml`.

## Git

Commit frequently, push logical groups. Never mention AI tooling. Format: `type: description` (fix, feat, docs, chore, refactor, test).

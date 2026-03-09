# ohmystack

Schema-first, zero-boilerplate fullstack.
Pick your database, forget about the backend.

If `PLAN.md` exists at the repo root, read it first for migration plan, execution
phases, and success criteria.

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
  ui/              — shared shadcn components (READ-ONLY)
  be-convex/       — Convex backend functions + schema
  be-spacetimedb/  — SpacetimeDB module + schema
  fe/              — shared frontend utilities
  e2e/             — shared Playwright utilities
  cli/             — ohmystack CLI (published as `ohmystack`)
mobile/convex/     — iOS/Android apps (Convex-only)
desktop/convex/    — macOS apps (Convex-only)
swift-core/        — shared Swift protocols
```

## Repository Architecture

Library packages are **published to npm**. Everything else is **consumer code** — demo
apps that happen to live in the same monorepo:

| Path                       | Role                         | Can reference library internals? |
| -------------------------- | ---------------------------- | -------------------------------- |
| `packages/convex/`         | Library (npm published)      | N/A — IS the library             |
| `packages/spacetimedb/`    | Library (npm published)      | N/A — IS the library             |
| `packages/shared/`         | Internal shared code         | N/A — IS library code            |
| `packages/be-convex/`      | Demo backend (consumer)      | NO — uses public API only        |
| `packages/be-spacetimedb/` | Demo backend (consumer)      | NO — uses public API only        |
| `apps/`                    | Demo web apps (consumer)     | NO — uses public API only        |
| `desktop/`                 | Demo desktop apps (consumer) | NO — uses generated output only  |
| `mobile/`                  | Demo mobile apps (consumer)  | NO — uses generated output only  |
| `swift-core/`              | Shared Swift protocol        | NO — uses generated output only  |
| `packages/ui/`             | Shared UI components         | NO — read-only                   |

Libraries must work for ANY project, not just these demos.
A developer who runs `bun add @ohmystack/convex` and defines their own Zod schemas must
get correct output without editing library source.

## npm Packages

| Package                  | Purpose                                      |
| ------------------------ | -------------------------------------------- |
| `ohmystack`              | CLI — `bun ohmystack@latest init`            |
| `@ohmystack/convex`      | Convex library (replaces `lazyconvex`)       |
| `@ohmystack/spacetimedb` | SpacetimeDB library (replaces `betterspace`) |

## Commands

```bash
bun i              # install all dependencies
bun fix            # lint + format + typecheck + build (must pass before commit)
bun dev:web        # start all web demo apps
bun test           # run library unit tests
bun test:all       # run ALL tests (unit + backend + e2e + native)
```

## Pre-Push Verification (MANDATORY)

NEVER push before ALL of these pass locally:

```bash
bun fix
bun test:all
```

---

# RULES

- only use `bun`, `yarn/npm/npx/pnpm` are forbidden
- `bun fix` must always pass
- `bun test:all` to run all tests in parallel, should pass every time we add new tests,
  new features, fix bugs or refactor code
- only use arrow functions
- all exports must be at end of file
- if a `.tsx` file only exports a single component, use `export default`
- `bun ts-unused-exports apps/<app-name>/tsconfig.json` to detect and remove unused
  exports
- `bun why <package>` to check if a package is already installed, no need to install
  packages that are already dependencies of other packages

---

# PROHIBITIONS

- NEVER write comments at all (lint ignores are allowed)
- NEVER touch files inside `packages/ui` (shared frontend components, read-only)
- NEVER use `Array#reduce()`, use `for` loops instead
- NEVER use `forEach()`, use `for` loops instead
- NEVER use non-null assertion operator (`!`)
- NEVER use `any` type
- NEVER use `as any`, `@ts-ignore`, `@ts-expect-error`
- NEVER hardcode project-specific data in library packages (`packages/convex/`,
  `packages/spacetimedb/`, `packages/shared/`)
- Max 3 positional args — use keyword args (destructured object) for 4+

---

## Code Style

- consolidate into fewer files, co-locate small components
- short names in map callbacks: `t`, `m`, `i`
- `export default` for components, named exports for utilities/backend
- `catch (error)` is enforced by oxlint; name state variables descriptively to avoid
  shadow (e.g. `chatError`, `formError`)
- `for` loops instead of `reduce()` or `forEach()`
- exhaustive `switch` with `default: never` where applicable
- prefer existing libraries over new dependencies

### Component & Import Organization

- **co-location**: if a component is only used by 1 page, it lives next to that page
  (same folder)
- **shared components**: only move to `~/components` when reused across multiple pages
- **explicit imports**: always import from the exact file path, never from barrel
  `index.ts` files
- **no barrel exports**: do not create `index.ts` re-export files

---

## Linting

| Linter  | Ignore comment                                         |
| ------- | ------------------------------------------------------ |
| oxlint  | `// oxlint-disable(-next-line) rule-name`              |
| eslint  | `// eslint-disable(-next-line) rule-name`              |
| biomejs | `/** biome-ignore(-all) lint/category/rule: reason */` |

Run `bun fix` to auto-fix and verify all linters pass (zero errors, warnings allowed).

### Safe-to-ignore rules (only when cannot fix)

**oxlint:**

- `promise/prefer-await-to-then` - ky/fetch chaining

**eslint:**

- `no-await-in-loop`, `max-statements`, `complexity` - complex handlers
- `@typescript-eslint/no-unnecessary-condition` - type narrowing false positives
- `@typescript-eslint/promise-function-async` - functions returning thenable (not
  Promise)
- `@typescript-eslint/max-params` - max 3 positional args; use keyword args (object
  parameter) for 4+
- `@typescript-eslint/class-methods-use-this` - React lifecycle methods
  (componentDidCatch)
- `@next/next/no-img-element` - external images without optimization
- `react-hooks/refs` - custom ref patterns

**biomejs:**

- `style/noProcessEnv` - env validation files
- `performance/noAwaitInLoops` - sequential async operations
- `nursery/noForIn` - intentional control flow
- `performance/noImgElement` - external images
- `suspicious/noExplicitAny` - unavoidable generic boundaries

---

## Minimal DOM rule (React + Tailwind)

### Philosophy

Same UI, fewest DOM nodes.
Every element must earn its place.
If you can delete it and nothing breaks (semantics, layout, behavior, required styling)
→ it shouldn’t exist.
Wrappers require justification in code review.

### When a node is allowed ("real reasons")

A DOM node is allowed only if it provides at least 1 of:

- Semantics / accessibility
  - Correct elements: `ul/li`, `button`, `label`, `form`, `fieldset/legend`, `nav`,
    `section`, etc.
  - Required relationships / focus behavior / ARIA patterns.

- Layout constraint you cannot apply to an existing node
  - Needs its own containing block / positioning context / clipping / scroll container /
    stacking context.
  - Examples: `relative`, `overflow-*`, `sticky`, `isolation`, `z-*`, `transform`,
    `contain-*`, `min-w-0` (truncation), etc.

- Behavior
  - Measurement refs, observers, portals target, event boundary, virtualization/scroll
    container.

- Component API necessity
  - You truly can’t pass props/classes to the real root (and you considered `as` /
    `asChild` / prop forwarding).

If none apply → **no wrapper**.

### Default moves (before adding wrappers)

Spacing / rhythm

- Between siblings → parent `gap-*` (flex/grid) or `space-x/y-*`.
- Prefer `gap-*` when you already use `flex`/`grid`

Separators

- Between siblings → parent `divide-y / divide-x` (instead of per-item borders).

Alignment

- Centering/alignment → put `flex/grid` on the existing parent that already owns the
  layout.

Visual ownership

- Padding/background/border/shadow/radius → put it on the element that visually owns the
  box.

JSX-only grouping

- Wrapper only to return multiple children → `<>...</>` (Fragment), not a `<div>`.

### Styling repeated children: pass props first, selectors second

#### Prefer passing `className` to the mapped item when

- The row is a component (`<Row />`) that can accept `className`.
- You need per-item variation (selected/disabled/first-last rules).
- You want clarity and low coupling (child internals can change).

```tsx
<div className="divide-y">
  {items.map(i => (
    <Row key={i.id} item={i} className="px-3 py-2" />
  ))}
</div>
```

#### Use selector pushdown when

- Children are simple elements you control (and styling is uniform).
- You want to avoid repeating the same classes on every item.
- You’re styling **direct children**, not deep internals.

```tsx
// bad
<div className='divide-y'>
  <p className='px-3 py-2'>Item 1</p>
  <p className='px-3 py-2'>Item 2</p>
  <p className='px-3 py-2'>Item 3</p>
  <button>click</button>
</div>
// good
<div className='divide-y [&>p]:px-3 [&>p]:py-2'>
  <p>Item 1</p>
  <p>Item 2</p>
  <p>Item 3</p>
  <button>click</button>
</div>
```

### Tailwind selector tools (for lists you own)

- `*:` applies to direct children: `*:min-w-0 *:shrink-0`
- Direct child targeting: `[&>li]:py-2 [&>li]:px-3`
- Broad descendant targeting (use sparingly): `[&_a]:underline [&_code]:font-mono`
- Stateful styling without wrappers:
  - `group` / `peer` on existing nodes (`group-hover:*`, `peer-focus:*`)
  - `data-[state=open]:*`, `aria-expanded:*`, `disabled:*`
- Structural variants to avoid wrapper logic: `first:* last:* odd:* even:* only:*`

### Review checklist (strict)

- **Delete test:** can I remove this node without changing
  semantics/layout/behavior/required styling?
  → delete.
- **Parent control:** can `gap/space/divide` replace wrapper/margins/borders?
  → do it.
- **Props first:** can I pass `className` to the mapped item/component?
  → do it.
- **Selectors second:** can `[&>...]:` / `*:` remove repetition on direct children I
  control? → do it.
- **No hidden coupling:** avoid styling deep child internals unless it’s a deliberate
  API.

---

## E2E Testing Strategy (Playwright)

### Golden Rule: Verify Before Scaling

NEVER run full test suites blindly.
Always follow this progression:

#### 1. Isolate → Fix → Verify (Single Test)

```bash
timeout 10 bun with-env playwright test -g "test name" --timeout=5000
```

#### 2. Verify Fix Works (Same Single Test)

```bash
timeout 10 bun with-env playwright test -g "test name" --timeout=5000
```

#### 3. Expand to Test File

```bash
timeout 30 bun with-env playwright test path/to/file.test.ts --timeout=8000
```

#### 4. Run Related Test Files

```bash
timeout 60 bun with-env playwright test file1.test.ts file2.test.ts --timeout=8000
```

#### 5. Full Suite (ONLY WHEN USER ASKS)

**AI agents: Only run specific failing tests.** Fix them, verify they pass 2-3 times,
then stop. Run full suite ONLY when user explicitly requests it.

```bash
bun test:e2e -- --workers=1 --timeout=10000 --reporter=dot
```

### Timeout Rules

| Scope             | Max Timeout  | Kill After |
| ----------------- | ------------ | ---------- |
| Single test debug | 5s           | 10s        |
| Single test file  | 8s per test  | 30s total  |
| Multiple files    | 8s per test  | 60s total  |
| Full suite        | 10s per test | 180s total |

### Common Playwright Issues

| Symptom                                 | Likely Cause                 | Fix                                     |
| --------------------------------------- | ---------------------------- | --------------------------------------- |
| Test hangs on `fill()`                  | Input not visible/enabled    | Check element state first               |
| Test hangs on `click()`                 | Button disabled              | Check `isDisabled()`                    |
| `waitForLoadState('networkidle')` hangs | Continuous polling/websocket | Use `waitForSelector()` instead         |
| Element not found                       | Wrong locator                | Check if testid is on element vs parent |
| Flaky counts                            | Parallel test interference   | Run with `--workers=1`                  |

### Pre-Test Checklist

Before running any E2E test:

1. [ ] `bun fix` passes (0 errors)
2. [ ] Dev server killed: `pkill -9 -f "next"`
3. [ ] Test results cleaned: `rm -rf test-results`

For Convex apps, deploy first:

```bash
cd packages/be-convex && CONVEX_TEST_MODE=true bun with-env convex dev --once
```

For SpacetimeDB apps, publish first:

```bash
SPACETIMEDB_TEST_MODE=true bun spacetime:publish
```

---

## Next.js Dynamic Rendering

Both databases require signaling dynamic rendering in Server Components.

### Convex

`preloadQuery`/`fetchQuery` use `Math.random()` internally:

```tsx
import { connection } from 'next/server'

const Page = async () => {
  await connection()
  const data = await preloadQuery(api.foo.bar, {}, { token })
  return <Client data={data} />
}
```

### SpacetimeDB

Data fetching is client-side via WebSocket subscriptions:

```tsx
import { connection } from 'next/server'

const Page = async () => {
  await connection()
  return <ClientComponent />
}
```

---

## react-doctor

Run `bunx -y react-doctor@latest . --verbose` to scan all projects for React
best-practice violations.

### When to run

- After adding new components or pages
- After significant React refactors
- Before releases

### Known false positives (do NOT fix)

| Warning                                                               | Why it’s OK                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Unused file (Next.js pages/layouts/configs)                           | Framework entry points, not imported by user code                         |
| Unused export (cross-package library API)                             | Public API consumed by other packages — react-doctor scans per-project    |
| `<img>` for storage URLs                                              | Dynamic URLs — `next/image` requires known `images.domains`               |
| `preventDefault()` on `<form>`                                        | SPA forms submitting via mutations/reducers, no server action             |
| `useEffect` with intersection observer `inView`                       | Standard infinite scroll pattern with `react-intersection-observer`       |
| `useSearchParams requires Suspense` when already wrapped at call site | react-doctor scans the component file, not where it’s rendered            |
| `dangerouslySetInnerHTML` / `<script>` in org-redirect                | Controlled redirect pattern for setting active org cookie                 |
| Missing metadata in demo app layouts/pages                            | Metadata is optional for demo apps — user preference to keep source clean |

### Rules to always follow

| Rule                                                       | Fix                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Hook naming: functions calling hooks must start with `use` | Rename `withFoo` → `useFoo`                                                  |
| Array keys must use stable IDs, never indices              | Use `item.id`, `item.toolCallId`, etc.                                       |
| `useSearchParams()` needs `<Suspense>` boundary            | Wrap the component using it at the render site                               |
| No `Date.now()` / `Math.random()` during render            | Move impure calls into `useEffect` / `useState` initializer / event handlers |

---

## Convex-Specific Notes

### `anyApi` Proxy — Type Safety Gap

Convex’s generated `api` object is typed as `FilterApi<typeof fullApi, ...>` (strict,
case-sensitive), but the runtime value is `anyApi` — a `Proxy` with `[key: string]`
index signatures that accept ANY property name at runtime.

**Impact**: `api.blogprofile.get` (wrong casing) won’t raise a TypeScript error even
though only `api.blogProfile.get` exists.

**Defense**:

- Always match `api.<module>` references to the EXACT filename in `convex/`
- Rely on E2E tests and `convex dev --once` deployments to catch casing errors
- In test module maps, use exact casing

### Convex Backend Setup

```bash
docker compose -f ohmystack.yml up -d
bash genkey.sh
bun genenv.ts
```

Then set env vars on Convex backend with `convex env set`. JWT private key needs `--`
separator due to dashes.

---

## SpacetimeDB-Specific Notes

### Module Type Safety

SpacetimeDB generates TypeScript bindings from the Rust module.
Always regenerate after schema changes:

```bash
bun spacetime:generate
```

- Table names and reducer names must match the generated bindings exactly
- Column names are snake_case in Rust but camelCase in generated TypeScript
- Always import from `@a/be-spacetimedb/spacetimedb` (the generated bindings)
- Rely on E2E tests and `bun spacetime:publish` to catch schema drift

---

## codegen-swift (Convex-only)

`codegen-swift.ts` must derive ALL output from inputs it receives (schema file, convex
directory, CLI flags).
It must NEVER contain:

- Hardcoded function names, parameter lists, or return types for specific tables/modules
- Data structures that describe THIS project’s endpoints
- Anything that would require editing library source when a consumer adds a table

### What codegen CAN know (from its own library code)

- Factory patterns: `crud()` always produces `list`, `read`, `create`, `update`, `rm`,
  `bulkCreate`, `bulkRm`, `bulkUpdate`
- `orgCrud()` with `acl: true` always produces `addEditor`, `removeEditor`,
  `setEditors`, `editors`
- `pub` option always produces `pub.list`, `pub.read`
- `softDelete` always produces `restore`
- `singletonCrud()` always produces `get`, `upsert`
- `cacheCrud()` always produces `get`, `all`, `list`, `create`, `update`, `rm`,
  `invalidate`, `purge`, `load`, `refresh`

### What codegen CANNOT know (must come from project-level config)

- Custom function signatures
- Custom return types for non-standard endpoints
- Custom subscription descriptors beyond standard patterns

### Test: is this generic?

If a developer runs
`bunx @ohmystack/convex codegen-swift --schema their-schema.ts --convex their-convex/`
on a project they built, does it produce correct output?
If not, something is hardcoded that shouldn’t be.

---

## Refactoring

After any significant refactoring, verify that passing a wrong field name to a mutation
or reducer call fails to compile.

---

## packages/shared/ Architecture

Internal workspace package, never published.
Contains code identical across both libraries:

- **React hooks**: `use-bulk-mutate`, `use-search`, `use-bulk-selection`,
  `use-optimistic`, `use-soft-delete`, `use-presence`, `use-cache`, `use-upload`,
  `use-online-status`, `error-toast`, `devtools`, `form`, `org`
- **Server utils**: `presence`, `middleware`, `schema-helpers`, `helpers`, `file`,
  `child`, `singleton`, `cache-crud`, `org`, `org-crud`, `org-members`, `org-invites`,
  `org-join`
- **Components**: `editors-section`, `misc`, `step-form`, `form`, `fields`
- **ESLint plugin**: 16 shared rules
- **CLI framework**: create, add, check commands
- **Zod utils**, seed utils, retry utils

Each published package re-exports from shared:

```ts
export { useBulkMutate } from '@a/shared/react'
export { useList } from './use-list' // DB-specific
```

---

## Key Technical Discoveries

1. **oxlint `eslint/sort-keys` conflicts with eslint perfectionist** — oxlint uses ASCII
   sort, perfectionist uses natural sort.
   Disable `eslint/sort-keys` in oxlint config.

2. **Lintmax runs biome TWICE** (biome → oxlint → eslint → biome).
   The 2nd biome pass can undo eslint auto-fixes.
   Disable conflicting biome rules like `noPlaywrightUselessAwait`.

3. **`next-env.d.ts` format mismatch** — Next.js generates with double quotes +
   semicolons, biome enforces single quotes + none.
   Add `apps/*/next-env.d.ts` to biome ignore.

4. **Docker port conflicts** — Convex MinIO uses 9000/9001, SpacetimeDB also needs
   MinIO. Assign different ports in `ohmystack.yml` to avoid conflicts.

5. **Convex `genenv.ts` outputs env vars** — must be set on backend via
   `convex env set`. JWT private key needs `--` separator due to dashes.

## Testing

| Suite               | Runner        | Count      |
| ------------------- | ------------- | ---------- |
| Convex library      | bun:test      | 934        |
| SpacetimeDB library | bun:test      | 1,170      |
| Convex backend      | convex-test   | 219        |
| Web E2E             | Playwright    | 220 per DB |
| Swift desktop       | Swift Testing | 32         |
| Mobile              | Maestro       | 92         |

## Git Conventions

- Commit frequently after each small unit of work
- Push after logical groups of commits
- Never mention AI tooling in commit messages
- Commit message format: `type: description` (fix, feat, docs, chore, refactor, test)

## Swift Mobile API (Convex-only)

- Subscription cleanup uses `cancelSubscription(&subscriptionID)` — NOT
  `ConvexService.shared.unsubscribe()`
- `cancelSubscription` is a free function from `ConvexShared/SharedUI.swift`
- Mobile subscriptions use `Sub<T>` pattern or manual `subscriptionID` +
  `cancelSubscription`

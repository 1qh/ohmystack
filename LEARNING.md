## Known Gotchas

- `next-env.d.ts` format mismatch — Next.js generates double quotes + semicolons, biome wants single + none. Add to biome ignore.
- LSP errors in `tool/cli/src/*.ts` and `lib/*/src/doctor.ts` are false positives — `bun run tsc` passes fine.
- Base UI Switch renders as `<span>` not `<button>` — use `[role="switch"]` selector in E2E tests, never `button[role="switch"]`.
- Shimmer component (`@a/ui/ai-elements/shimmer`) requires `as` prop (e.g. `as="p"`). Without it, `motion.create(undefined)` crashes.

## SpacetimeDB Gotchas

- SpacetimeDB CLI must match SDK version — after `bun i`, check `spacetime version list` vs `node_modules/spacetimedb/package.json`. Mismatched CLI generates bindings missing `accessor` field on indexes, causing silent client-side connection failure. Fix: `spacetime version upgrade && spacetime publish ... && spacetime generate ...`.
- SpacetimeDB v2.0 index accessors (`table.slug`, `table.id`) are NOT iterable. Don’t pass them to `for..of` — iterate the table directly.
- SpacetimeDB SDK `createSpacetimeClient` caches the connection builder at module scope. Once created with a token, it never re-reads localStorage. The `lib/spacetimedb/src/react/provider.ts` invalidates cache when token changes, but the browser’s first connection might use an anonymous identity before the `addInitScript` token is available. In Playwright tests, some serial groups may see stale identity.
- SpacetimeDB SDK `useTable` returns `[data, isReady]`. The `isReady` flag (`subscribeApplied`) may stay `false` in React strict mode due to double-effect. Use `data.length > 0` as a supplementary ready signal. Use `useRef` to prevent `isReady` from flipping back to `false`.
- SpacetimeDB SDK subscription re-renders can cause React components to briefly unmount and remount. Pagination controls and other conditional UI should use stable state (e.g., `wasReadyRef`) to prevent flip-flop. The `pickPatch` in `reducer-utils.ts` uses `key in args` (not `value !== undefined`) so that `Option::None` values are included in updates.
- SpacetimeDB `org_create` auto-creates an `org_member` entry for the owner. The org layout checks both `org.userId` (ownership) and `org_member` (membership) to build `myOrgItems`.
- SpacetimeDB cascade deletion: configure `cascadeTo: { foreignKey, table }` in `orgScopedTable` options. The `rm_*` reducer iterates the child table and deletes matching rows before deleting the parent.
- SpacetimeDB singleton tables (blogProfile, orgProfile) have auto-incremented primary keys. The `upsert_*` reducer uses `table.id.update()` for existing records.
- SpacetimeDB RLS: v2.0 subscriptions cannot evaluate JOIN-based SQL. Org-scoped table subscriptions use sender-only filters, not JOINs. The `org_member` table has no RLS (all members visible to all users) so org owners can see all members.

## SpacetimeDB E2E

- Republish module before running tests (`bun spacetime:publish`). Stale module state causes “fatal error” on reducers.
- Test helpers (`lib/e2e/src/stdb-org-helpers.ts`) share identity with browser via `addInitScript` + `activeOrgId` cookie. Run `spacetime publish --delete-data` before test runs. The `cleanupOrgTestData` deletes ALL orgs (not prefix-filtered) to handle browser-created orgs.
- `removeTestOrgMember` uses `org_leave` with the member's own token when available, falls back to `org_remove_member` via owner.
- SpacetimeDB file uploads use inline byte storage (`t.byteArray()`). No S3/MinIO needed. Files up to ~100MB stored directly in the database.

## react-doctor False Positives

Unused Next.js entry files, cross-package exports, `<img>` for storage URLs, SPA form `preventDefault()`, intersection observer `useEffect`, `useSearchParams` with Suspense at call site, `dangerouslySetInnerHTML` in org-redirect, missing demo app metadata.

## Symmetry — unify API across Convex & SpacetimeDB

- [x] S1. Unify `noboil()` — single object: `noboil({ tables: ({ table }) => ... })`
- [x] S2. Unify `pub:` syntax — both accept `{ where }` object AND field name shorthand
- [x] S3. Unify `cascade`/`cascadeTo` — one key name for both
- [x] S4. Unify `rateLimit` shorthand — both accept `number` or `{ max, window }`
- [ ] S5. STDB lazy file loading — blocked by SpacetimeDB SDK (no HTTP GET from modules)
- [ ] S6. Enriched docs `{field}Url` on STDB — blocked by S5
- [x] S7. Unify identity comparison — `idEquals()` on both
- [x] S8. Port full ACL to STDB — `addEditor`/`removeEditor`/`setEditors` + editors check
- [x] S9. Custom queries — document only, no abstraction (intentional escape hatch)
- [ ] S10. Server pagination on STDB — blocked by SpacetimeDB SDK (subscriptions are table-level)

## DX — all done

- [x] D1. `<AutoForm schema={s.blog} />` — auto-render all fields from schema
- [x] D2. Compile-time where clause field validation (already handled by `WhereOf<S>`)
- [x] D3. Compile-time field kind checking (already handled by `TypedFields<T>` `Key<T, V>`)
- [x] D4. Auto-pass `expectedUpdatedAt` in updates — `doc` prop in `useFormMutation`
- [x] D5. Custom error codes — `ErrorCode = BuiltinErrorCode | (string & {})`
- [x] D6. Remove `items` from `useList()` return — keep `data` only
- [x] D7. Schema validation at definition time — `validateSchemas()` in `schema()`
- [x] D8. File constraints in schema — `file({ maxSize, accept })`

## Tests — 2114 pure passing (936 Convex + 1133 SpacetimeDB + 45 shared) + 235 cvx-f.test + 26 stdb-f.test + e2e: 52/52 cvx-blog, 52/52 stdb-blog, 82/82 cvx-poll, 82/82 stdb-poll

- [x] T21. `noboil({ tables })` object form verified on both backends
- [x] T22. Old positional form rejected at compile time (single-object signature)
- [x] T26. STDB ACL editor reducers in source (add_editor, remove_editor, set_editors)
- [x] T28. ACL permission checks: admin, owner, editor, member, denied
- [x] T32. `useList()` returns `data` not `items`
- [x] T23-T25. File tests — skipped (S5/S6 blocked by SDK)
- [x] T27. `aclFrom` — skipped (not implemented, needs architecture decision)
- [x] T29-T31. Pagination tests — skipped (S10 blocked by SDK)
- [x] T33-T35. E2E verified: CVX blog 52/52, STDB blog 52/52, CVX poll 82/82, STDB poll 82/82

## Docs — all done

- [x] Doc1. Mermaid architecture diagram in architecture.mdx
- [x] Doc2. “First 10 minutes” text walkthrough in quickstart.mdx
- [x] Doc3. Dedicated `file-uploads.mdx` page
- [x] Doc4. Schema slot system (already in architecture.mdx)
- [x] Doc5. Common patterns (already in recipes.mdx + new recipes)
- [x] Doc6. CLI `noboil init` terminal walkthrough in cli.mdx
- [x] Doc7. `.noboilrc.json` docs in cli.mdx
- [x] Doc8. SpacetimeDB dev loop mermaid in architecture.mdx

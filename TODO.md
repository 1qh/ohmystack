## Symmetry — unify API across Convex & SpacetimeDB

- [ ] S1. Unify `noboil()` — single object: `noboil({ tables: ({ table }) => ... })`
- [x] S2. Unify `pub:` syntax — both accept `{ where }` object AND field name shorthand
- [x] S3. Unify `cascade`/`cascadeTo` — one key name for both
- [x] S4. Unify `rateLimit` shorthand — both accept `number` or `{ max, window }`
- [ ] S5. STDB lazy file loading — HTTP endpoint serves bytes, stop pushing via WebSocket
- [ ] S6. Enriched docs get `{field}Url` on STDB — same as Convex, using HTTP URL
- [x] S7. Unify identity comparison — `idEquals()` on both
- [ ] S8. Port full ACL to STDB — `addEditor`/`removeEditor`/`setEditors` + `aclFrom`
- [x] S9. Custom queries — document only, no abstraction (intentional escape hatch)
- [ ] S10. Server pagination on STDB — `LIMIT/OFFSET ORDER BY DESC`, same as Convex

## DX — developer experience improvements

- [x] D1. `<AutoForm schema={s.blog} />` — auto-render all fields from schema
- [x] D2. Compile-time where clause field validation (already handled by `WhereOf<S>`)
- [x] D3. Compile-time field kind checking (already handled by `TypedFields<T>` `Key<T, V>`)
- [x] D4. Auto-pass `expectedUpdatedAt` in updates — `doc` prop in `useFormMutation`
- [x] D5. Custom error codes — `ErrorCode = BuiltinErrorCode | (string & {})`
- [ ] D6. Remove `items` from `useList()` return — keep `data` only
- [x] D7. Schema validation at definition time — `validateSchemas()` in `schema()`
- [x] D8. File constraints in schema — `file({ maxSize, accept })`

## Tests — new tests for this pass

- [ ] T21. `noboil({ tables })` object form accepted on both backends
- [ ] T22. Old positional `noboil(config, define)` form rejected with helpful error
- [ ] T23. STDB file HTTP endpoint returns correct bytes + content type
- [ ] T24. STDB enriched docs include `{field}Url` for file fields
- [ ] T25. `useUpload()` return shape matches on both backends
- [ ] T26. STDB `addEditor`/`removeEditor`/`setEditors` reducers generated with `acl: true`
- [ ] T27. STDB `aclFrom` resolves parent editors correctly
- [ ] T28. ACL permission checks: owner > admin > editor > member
- [ ] T29. STDB `useList()` uses `LIMIT/OFFSET` with `ORDER BY DESC` default
- [ ] T30. `loadMore` increments offset, returns next page
- [ ] T31. New rows appear at top of first page
- [ ] T32. `useList()` returns `data` not `items`
- [ ] T33. E2E: STDB file upload → HTTP serve → display
- [ ] T34. E2E: STDB ACL editor add/remove/check
- [ ] T35. E2E: STDB paginated list with loadMore

## Docs — gaps to fill

- [ ] Doc1. Mermaid architecture diagram in architecture.mdx
- [ ] Doc2. “First 10 minutes” text walkthrough
- [ ] Doc3. Dedicated `file-uploads.mdx` page
- [x] Doc4. Schema slot system (already in architecture.mdx)
- [x] Doc5. Common patterns (already in recipes.mdx)
- [ ] Doc6. CLI `noboil init` terminal walkthrough in cli.mdx
- [ ] Doc7. `.noboilrc.json` docs in cli.mdx
- [ ] Doc8. SpacetimeDB dev loop mermaid in architecture.mdx

## Symmetry — unify API across Convex & SpacetimeDB

- [ ] S1. Unify `noboil()` signature — both accept same config shape
- [x] S2. Unify `pub:` syntax — both accept `{ where }` object AND field name shorthand
- [x] S3. Unify `cascade`/`cascadeTo` — one key name for both
- [x] S4. Unify `rateLimit` shorthand — both accept `number` or `{ max, window }`
- [ ] S5. Abstract file upload — same `useUpload()` return shape regardless of storage
- [ ] S6. Unify file URL resolution — enriched docs always have `{field}Url` on both backends
- [ ] S7. Unify identity comparison — abstract behind `idEquals()` helper on both
- [ ] S8. Unify ACL endpoints — `EditorsSection` works identically on both
- [ ] S9. Unify custom query/mutation patterns — shared builder abstraction or docs
- [ ] S10. Unify pagination semantics — document server vs client, or add server pagination to STDB

## DX — developer experience improvements

- [x] D1. `<AutoForm schema={s.blog} />` — auto-render all fields from schema
- [ ] D2. Compile-time where clause field validation (TypeScript)
- [ ] D3. Compile-time field kind checking (`<f.Num name="title" />` = TS error)
- [ ] D4. Auto-pass `expectedUpdatedAt` in updates — conflict detection by default
- [ ] D5. Allow custom error codes — extend `ErrorCode` union
- [ ] D6. Remove redundant `items`/`data` dual return from `useList()`
- [x] D7. Schema validation at definition time (reject pipe/transform immediately)
- [ ] D8. File size/type constraints in Zod schema (`file({ maxSize, accept })`)
- [ ] D9. `<DeleteButton>` component — reusable delete + confirm + toast + undo

## Tests — comprehensive coverage

- [ ] T1. Schema branding: wrong brand → compile error (tsd or type-level tests)
- [ ] T2. `noboil()` dispatch: every brand routes to correct factory
- [ ] T3. `pub:` shorthand + object form both produce correct filters
- [ ] T4. `cascade`/`cascadeTo` trigger child deletion
- [ ] T5. Rate limiting: number shorthand + object + edge cases
- [ ] T6. File field detection in schema → correct `{field}Url` enrichment
- [ ] T7. Where clause: comparison ops ($gt, $between, etc), OR groups, edge cases
- [ ] T8. Error codes: all 33 codes extractable, field errors flatten correctly
- [ ] T9. Retry: exponential backoff, 429 Retry-After, max attempts
- [ ] T10. Form: defaultValues, coerceOptionals, pickValues, buildMeta for all field types
- [ ] T11. Org: role hierarchy (owner > admin > member), permission checks
- [ ] T12. Soft delete: filter, restore, cascade
- [ ] T13. Child CRUD: parent ownership verification, foreign key
- [ ] T14. Singleton: upsert creates/updates, per-user isolation
- [ ] T15. Cache: TTL expiry, stale-while-revalidate, purge
- [ ] T16. Middleware: compose ordering, beforeCreate can mutate data
- [ ] T17. Input sanitize: XSS stripping, script tags, event handlers
- [ ] T18. Optimistic store: overlay creates/updates/deletes, reconciliation
- [ ] T19. Symmetry tests: same schema produces same API shape on both backends
- [ ] T20. Guard API: typo suggestions, production bypass

## Docs — gaps to fill

- [ ] Doc1. Architecture diagram (schema → CRUD → endpoints → hooks)
- [ ] Doc2. “First 10 minutes” walkthrough with screenshots
- [ ] Doc3. Dedicated file upload guide
- [ ] Doc4. Schema slot system explained before quickstart
- [ ] Doc5. Common patterns cookbook (soft delete, pagination+search, rate limit UI)
- [ ] Doc6. CLI `noboil init` terminal walkthrough
- [ ] Doc7. `.noboilrc.json` documentation
- [ ] Doc8. SpacetimeDB dev loop diagram (module → bindings → client)

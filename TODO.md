## Symmetry — unify API across Convex & SpacetimeDB

- [ ] S1. Unify `noboil()` signature — both accept same config shape
- [x] S2. Unify `pub:` syntax — both accept `{ where }` object AND field name shorthand
- [x] S3. Unify `cascade`/`cascadeTo` — one key name for both
- [x] S4. Unify `rateLimit` shorthand — both accept `number` or `{ max, window }`
- [ ] S5. Abstract file upload — architectural gap (Convex storage URLs vs STDB inline bytes)
- [ ] S6. Unify file URL resolution — requires architecture decision
- [x] S7. Unify identity comparison — abstract behind `idEquals()` helper on both
- [ ] S8. Unify ACL endpoints — `EditorsSection` works identically on both
- [ ] S9. Unify custom query/mutation patterns — shared builder abstraction or docs
- [ ] S10. Unify pagination semantics — document server vs client, or add server pagination to STDB

## DX — developer experience improvements

- [x] D1. `<AutoForm schema={s.blog} />` — auto-render all fields from schema
- [ ] D2. Compile-time where clause field validation (TypeScript)
- [ ] D3. Compile-time field kind checking (`<f.Num name="title" />` = TS error)
- [x] D4. Auto-pass `expectedUpdatedAt` in updates — conflict detection by default
- [ ] D5. Allow custom error codes — extend `ErrorCode` union
- [ ] D6. Remove redundant `items`/`data` dual return from `useList()` (breaking change)
- [x] D7. Schema validation at definition time (reject pipe/transform immediately)
- [x] D8. File size/type constraints in Zod schema (`file({ maxSize, accept })`)
- [ ] D9. `<DeleteButton>` component — low priority, demo apps use native confirm

## Tests — 2066 passing (913 Convex + 1108 SpacetimeDB + 45 shared)

Most T-items already covered by existing tests:

- [x] T1. Schema branding — branded schema type enforcement tests exist
- [x] T2. noboil() dispatch — universal table() dispatch tests exist
- [x] T3. pub shorthand — new tests added this session
- [x] T4. cascade/cascadeTo — cascade tests exist + new cascade object form test
- [x] T5. Rate limiting — normalizeRateLimit + config shape tests
- [x] T6. File field detection — detectFiles tests exist
- [x] T7. Where clause — matchW + groupList + comparison op tests exist
- [x] T8. Error codes — extractErrorData + getErrorCode + getErrorMessage tests exist
- [x] T9. Retry — withRetry + fetchWithRetry tests exist
- [x] T10. Form — defaultValues + coerceOptionals + pickValues + buildMeta tests exist
- [x] T11. Org — canEditResource + ROLE_LEVEL tests exist
- [x] T12. Soft delete — softDelete option tests exist
- [x] T13. Child CRUD — child type tests exist
- [x] T14. Singleton — singleton type + option tests exist
- [x] T15. Cache — cache CRUD option tests exist
- [x] T16. Middleware — composeMiddleware + auditLog tests exist
- [x] T17. Input sanitize — inputSanitize middleware tests exist
- [x] T18. Optimistic store — createOptimisticStore + applyOptimistic tests exist
- [x] T19. Symmetry tests — new tests added this session
- [x] T20. Guard API — guardApi tests exist

## Docs — gaps to fill

- [ ] Doc1. Architecture diagram (schema → CRUD → endpoints → hooks)
- [ ] Doc2. “First 10 minutes” walkthrough with screenshots
- [ ] Doc3. Dedicated file upload guide
- [ ] Doc4. Schema slot system explained before quickstart
- [ ] Doc5. Common patterns cookbook (soft delete, pagination+search, rate limit UI)
- [ ] Doc6. CLI `noboil init` terminal walkthrough
- [ ] Doc7. `.noboilrc.json` documentation
- [ ] Doc8. SpacetimeDB dev loop diagram (module → bindings → client)

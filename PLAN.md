# noboil v0.2 — absorb eximagent patterns

Source of truth: see also `~/.claude/projects/-Users-o-z/memory/project_noboil_v02_absorb_eximagent.md`.

Both noboil + eximagent are owned by `1qh`. Plan: noboil absorbs eximagent’s superior generic engineering, then eximagent becomes a thin consumer.

## Order — pull-then-shrink, no parallel

Land each pattern in noboil first. Eximagent untouched until step 5+.

### 1. `noboil/test` — hermetic adapter + property-test helpers

- Hermetic adapter: `setHermeticAdapter` / `hermeticTry(op, fn)` — generic op interception for tests
- Deterministic LCG: seeded RNG class for fuzz-style state machine tests
- Fake clock: `setNow(ms) / restoreNow()`
- Source: `eximagent/apps/backend/test-utils/convex.ts` + `ownerSpend.property.test.ts`

### 2. `budget` factory — reserve / commit / refund + daily cap

- Generic over: cap unit, period (day/hour), inflight max, estimate-per-call
- Distinct from `quota` (sliding window timestamps)
- Source: `eximagent/apps/backend/convex/ownerSpend.ts`
- Property-tested invariants: no overshoot beyond tolerance, no negative inflight/cents, consolidation safe

### 3. `audit` factory — preset over `log`

- Fixed schema: action, actor, args, ok, mode, traceId
- TTL-based purge cron
- Source: eximagent `auditLogs` + `lib.ts` rate-limit helper

### 4. `noboil/convex/tools` — three-tier framework (Convex-only, accepted)

- `_lib/` (fork-safe, zero project refs) / `_app/` (project glue) / `<provider>/` (consumer tools)
- Tier-gated registry, schema fingerprinting, manifest endpoint, dispatch endpoint
- Source: `eximagent/apps/backend/convex/tools/_lib/*` + `tools/_app/*`
- STDB has NO equivalent. Documented same way as file storage / pagination.

### 5. Eximagent migration — one PR per table

- chats → owned, messages/streamEvents/auditLogs → log/audit, sandboxes → singleton
- xToolCache → cache, xTraces → owned, systemStatus → kv
- rateLimits → quota, ownerSpend → budget (NEW from step 2)
- tools/\_lib + \_app → import from noboil/convex/tools
- Keep raw: HTTP actions (anthropic proxy, sandbox lifecycle), proxy helpers, stream protocol, redactor

## Architecture rules

- Subpath isolation: `noboil/test`, `noboil/budget`, `noboil/convex/tools`
- Cross-DB promise unchanged for factories — all dual-DB
- CLI tools explicitly Convex-only
- Each new factory = new noboil minor version before user publishes 0.1.0

## Quality bar (from eximagent)

- Property-based tests for state machines (budget, log seq, quota window)
- Invariant logging on every transition
- Constant-time comparison for secrets
- Header allowlists for any HTTP I/O
- Generated artifacts checked in + drift-tested
- Framework boundary tests (assert `_lib` has zero project imports)

## What stays in eximagent (not generic)

- `messages/proxyHelpers.ts` — Anthropic proxy header/beta allowlist
- `messages/streamHelpers.ts` — model rate cards, bounded body
- `messages/sendCore.ts` — chat title sanitizer + content limits
- `streamProtocol.ts` — Anthropic stream event Zod
- `sandboxLaunch.ts` / `sandboxKill.ts` — E2B lifecycle
- `redactor.ts` — secret redaction (could become noboil util later)
- All `tools/exim/*` — business tools (USPTO/HS code/etc)

## Status

Plan agreed 2026-04-29. CLI tools confirmed Convex-only. Starting step 1.

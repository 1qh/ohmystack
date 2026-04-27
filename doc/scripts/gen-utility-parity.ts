#!/usr/bin/env bun
/* eslint-disable no-console, no-continue, max-depth */
/** biome-ignore-all lint/performance/useTopLevelRegex: small file */
/** biome-ignore-all lint/nursery/noContinue: parser */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const EXPORT_BRACE_RE = /export\s+\{(?<syms>[^}]+)\}/gu
const EXPORT_DECL_RE = /export\s+(?:const|function|class)\s+(?<name>\w+)/gu
interface UtilDomain {
  cvxFiles: string[]
  intentionalCvxOnly?: Record<string, string>
  intentionalStdbOnly?: Record<string, string>
  name: string
  stdbFiles: string[]
}
const DOMAINS: UtilDomain[] = [
  { cvxFiles: ['file.ts'], name: 'File upload', stdbFiles: ['file.ts'] },
  { cvxFiles: ['presence.ts'], name: 'Presence', stdbFiles: ['presence.ts'] },
  {
    cvxFiles: ['org-invites.ts', 'org-join.ts', 'org-members.ts', 'org.ts'],
    intentionalCvxOnly: {
      makeInviteHandlers: 'cvx convention: handlers are server-side mutation builders (returns mutation defs)',
      makeJoinHandlers: 'cvx convention: handlers are server-side mutation builders',
      makeMemberHandlers: 'cvx convention: handlers are server-side mutation builders'
    },
    intentionalStdbOnly: {
      canEdit: 'stdb-side ACL helper invoked client-side from RLS where clause; cvx checks server-side via requireOrgRole',
      makeInviteReducers: 'stdb convention: reducers are explicit table writers (parallel to cvx makeInviteHandlers)',
      makeInviteToken: 'stdb invite tokens are generated reducer-side; cvx uses crypto.randomUUID inline',
      makeJoinReducers: 'stdb convention: reducers (parallel to cvx makeJoinHandlers)',
      makeMemberReducers: 'stdb convention: reducers (parallel to cvx makeMemberHandlers)',
      makeOrgTables: 'stdb table-builder helpers; cvx tables defined declaratively in schema',
      requireOrgMember:
        'stdb auth check helper exposed for direct reducer use; cvx uses requireOrgRole/requireOrgEditor inside CRUD wrappers'
    },
    name: 'Org membership',
    stdbFiles: ['org-invites.ts', 'org-join.ts', 'org-members.ts', 'org.ts', 'org-crud-helpers.ts']
  },
  {
    cvxFiles: ['helpers.ts', 'schema-helpers.ts', 'bridge.ts'],
    intentionalCvxOnly: { handleConvexError: 'Convex-specific error wrapping; stdb uses SenderError class instead' },
    intentionalStdbOnly: {
      applyPatch: 'reducer arg patch helper — Convex uses ctx.db.patch() directly',
      enforceRateLimit: 'stdb-side rate-limit enforcement helper — cvx uses checkRateLimit via setup',
      getFieldErrors: 'stdb field-error parsing — cvx uses ConvexError shape',
      getFirstFieldError: 'see getFieldErrors',
      getOwnedRow: 'stdb ownership-checked row fetch — cvx uses requireOwn via context',
      idFromWire: 'stdb id wire-format conversion (u32/u64) — cvx uses string Id throughout',
      idToWire: 'see idFromWire',
      identityEquals: 'stdb Identity comparison — cvx compares string ids with ===',
      identityFromHex: 'stdb Identity hex conversion — cvx has no Identity type',
      identityToHex: 'see identityFromHex',
      makeError: 'stdb SenderError factory — cvx uses ConvexError',
      makeOptionalFields: 'stdb reducer arg builder helper',
      parseSenderMessage: 'stdb sender message parsing — cvx uses Convex auth context',
      pickPatch: 'stdb patch shape builder — cvx uses spread/pick inline',
      reducerArgs: 'stdb reducer arg mapper — cvx uses convex/values directly',
      resetRateLimitState: 'stdb rate-limit state reset — cvx uses internal mutation',
      timestampEquals: 'stdb Timestamp comparison — cvx uses number ==='
    },
    name: 'Server helpers',
    stdbFiles: ['helpers.ts', 'schema-helpers.ts', 'bridge.ts', 'reducer-utils.ts']
  },
  { cvxFiles: ['middleware.ts'], name: 'Middleware', stdbFiles: ['middleware.ts'] },
  {
    cvxFiles: ['setup.ts', 'noboil.ts'],
    intentionalCvxOnly: {
      api: 'cvx exports a unified `api` proxy wrapping all functions — stdb exposes `tables`/`reducers` directly',
      mergeCacheHooks: 'cvx hook composition for cache factory — stdb uses inline closures',
      mergeGlobalHooks: 'cvx hook composition for global hooks — stdb uses inline closures',
      mergeHooks: 'see mergeGlobalHooks'
    },
    intentionalStdbOnly: {
      setupCrud: 'stdb-specific CRUD setup helper that registers reducers — cvx setup() returns helpers used per-table'
    },
    name: 'Setup / entry',
    stdbFiles: ['setup.ts']
  },
  {
    cvxFiles: ['test.ts'],
    intentionalCvxOnly: {
      TEST_EMAIL: 'convex-test deterministic email constant — stdb uses createTestUser instead',
      getOrgMembership: 'convex-test helper to inspect membership rows — stdb uses queryTable with filter',
      makeOrgTestCrud:
        'convex-test wrapper that exposes server-side org-scoped CRUD with auth pre-baked — stdb tests use callReducer with asUser instead',
      makeTestAuth: 'convex-test auth helper — stdb uses asUser + connectAsTestUser pattern'
    },
    intentionalStdbOnly: {
      asUser: 'stdb test helper to call reducer as a specific identity — cvx uses ctx.withIdentity',
      callReducer: 'stdb reducer-call wrapper — cvx uses ctx.mutation directly',
      cleanup: 'stdb test cleanup helper — cvx uses ctx.run',
      createTestUser: 'stdb deterministic test-user factory — cvx uses ensureTestUser',
      extractErrorData: 'stdb SenderError data parsing — cvx uses err.data directly',
      getErrorCode: 'see extractErrorData',
      getErrorDetail: 'see extractErrorData',
      getErrorMessage: 'see extractErrorData',
      queryTable: 'stdb test-time table query helper — cvx uses ctx.run + ctx.db.query'
    },
    name: 'Test helpers',
    stdbFiles: ['test.ts']
  },
  {
    cvxFiles: [],
    intentionalStdbOnly: {
      RLS_COL: 'stdb RLS column-name constants — cvx auth happens in handler, no constants',
      RLS_TBL: 'see RLS_COL',
      makeSchema: 'stdb table-builder for spacetimedb schema generation — cvx uses defineSchema',
      rlsChildSql: 'stdb child-table RLS where-clause builder',
      rlsJoinWhereSender: 'stdb join-based RLS builder',
      rlsSql: 'stdb generic RLS SQL where-clause builder',
      rlsWherePub: 'stdb pub-visibility RLS builder',
      rlsWhereSender: 'stdb sender-scoped RLS builder',
      zodToStdbFields: 'Zod → SpacetimeDB column-type mapper'
    },
    name: 'RLS / subscriptions',
    stdbFiles: ['rls.ts', 'stdb-tables.ts']
  }
]
const collectExports = (root: string, files: string[]): Set<string> => {
  const out = new Set<string>()
  for (const f of files) {
    const path = `${root}/${f}`
    if (!existsSync(path)) continue
    const src = readFileSync(path, 'utf8')
    let m = EXPORT_BRACE_RE.exec(src)
    while (m) {
      if (m.groups?.syms)
        for (const part of m.groups.syms.split(',')) {
          const trimmed = part.trim()
          if (!trimmed) continue
          const aliasIdx = trimmed.indexOf(' as ')
          const name = aliasIdx === -1 ? trimmed.replace(/^type\s+/u, '') : trimmed.slice(aliasIdx + 4).trim()
          if (name && name !== 'type') out.add(name)
        }
      m = EXPORT_BRACE_RE.exec(src)
    }
    EXPORT_BRACE_RE.lastIndex = 0
    let dm = EXPORT_DECL_RE.exec(src)
    while (dm) {
      if (dm.groups?.name) out.add(dm.groups.name)
      dm = EXPORT_DECL_RE.exec(src)
    }
    EXPORT_DECL_RE.lastIndex = 0
  }
  return out
}
const main = () => {
  const cvxRoot = `${REPO}/lib/noboil/src/convex/server`
  const stdbRoot = `${REPO}/lib/noboil/src/spacetimedb/server`
  const rows: string[] = []
  let perfect = 0
  const intentionalNotes: string[] = []
  for (const d of DOMAINS) {
    const cvx = collectExports(cvxRoot, d.cvxFiles)
    const stdb = collectExports(stdbRoot, d.stdbFiles)
    const cvxIntentional = new Set(Object.keys(d.intentionalCvxOnly ?? {}))
    const stdbIntentional = new Set(Object.keys(d.intentionalStdbOnly ?? {}))
    const shared = [...cvx].filter(s => stdb.has(s))
    const cvxOnly = [...cvx].filter(s => !(stdb.has(s) || cvxIntentional.has(s)))
    const stdbOnly = [...stdb].filter(s => !(cvx.has(s) || stdbIntentional.has(s)))
    const allOk = cvxOnly.length === 0 && stdbOnly.length === 0
    if (allOk) perfect += 1
    rows.push(
      `| **${d.name}** | ${shared.length} | ${cvx.size} | ${stdb.size} | ${
        cvxOnly.length === 0
          ? '—'
          : cvxOnly
              .toSorted()
              .map(s => `\`${s}\``)
              .join(', ')
      } | ${
        stdbOnly.length === 0
          ? '—'
          : stdbOnly
              .toSorted()
              .map(s => `\`${s}\``)
              .join(', ')
      } | ${cvxIntentional.size + stdbIntentional.size} | ${allOk ? '🟢' : '🟡'} |`
    )
    for (const [opt, reason] of Object.entries(d.intentionalCvxOnly ?? {}))
      intentionalNotes.push(`- **${d.name} \`${opt}\`** (cvx-only): ${reason}`)
    for (const [opt, reason] of Object.entries(d.intentionalStdbOnly ?? {}))
      intentionalNotes.push(`- **${d.name} \`${opt}\`** (stdb-only): ${reason}`)
  }
  const body = [
    'Per-domain parity for non-factory utilities. Compares the export surface of each utility module across both backends. Shared exports = symbols present on both sides; cvx-only/stdb-only counts exclude documented architectural exemptions.',
    '',
    `**${perfect}/${DOMAINS.length} domains at full parity.**`,
    '',
    '| Domain | shared | cvx exports | stdb exports | cvx-only (gap) | stdb-only (gap) | intentional asym | status |',
    '|---|---|--:|--:|--:|--:|--:|--|',
    ...rows,
    '',
    '### Intentional architectural asymmetries',
    '',
    ...intentionalNotes
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'UTILITY-PARITY', body)
  if (dirty) console.log(`Updated utility parity (${perfect}/${DOMAINS.length} full)`)
}
main()

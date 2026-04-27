#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: walker */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const EXPORT_BRACE_RE = /export\s+\{(?<syms>[^}]+)\}/gu
const EXPORT_DECL_RE =
  /export\s+(?:const|function|class|interface|type|default\s+(?:const|function|class)?)\s+(?<name>\w+)/gu
const SKIP_DIRS = new Set([
  '.next',
  '.turbo',
  '__tests__',
  '_generated',
  'dist',
  'generated',
  'module_bindings',
  'node_modules'
])
const SKIP_FILE_SUFFIX = ['.test.ts', '.test.tsx', '.d.ts']
interface Pair {
  cvxRoot: string
  exemptFiles?: Record<string, string>
  exemptSymbols?: Set<string>
  name: string
  scanContentFiles?: string[]
  stdbRoot: string
}
const stripStrings = (src: string): string =>
  src
    .replaceAll(/`[\s\S]*?`/gu, '``')
    .replaceAll(/'[^'\n]*'/gu, "''")
    .replaceAll(/"[^"\n]*"/gu, '""')
    .replaceAll(/\/\/[^\n]*/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
const walkRel = (root: string, rel = ''): string[] => {
  const out: string[] = []
  const dir = join(root, rel)
  if (!statSync(dir, { throwIfNoEntry: false })) return out
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    const s = statSync(full)
    const r = rel ? `${rel}/${name}` : name
    if (s.isDirectory()) out.push(...walkRel(root, r))
    else if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !SKIP_FILE_SUFFIX.some(suf => name.endsWith(suf)))
      out.push(r)
  }
  return out
}
const collectExports = (path: string): Set<string> => {
  const out = new Set<string>()
  if (!statSync(path, { throwIfNoEntry: false })) return out
  const src = stripStrings(readFileSync(path, 'utf8'))
  let m = EXPORT_BRACE_RE.exec(src)
  while (m) {
    if (m.groups?.syms)
      for (const part of m.groups.syms.split(',')) {
        const t = part.trim()
        if (!t) continue
        const idx = t.indexOf(' as ')
        const name = idx === -1 ? t.replace(/^type\s+/u, '') : t.slice(idx + 4).trim()
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
  return out
}
const LIB_FILE_EXEMPT: Record<string, string> = {
  'cvx:react/optimistic-provider.tsx':
    'cvx-specific React provider for optimistic-mutation store; stdb optimism is built into useMut',
  'cvx:server/env.ts': 'cvx env.ts wraps Convex `internal.x` env access; stdb reads process.env directly',
  'cvx:server/noboil.ts': 'cvx noboil() entry helper; stdb merges this into setup.ts',
  'cvx:server/types.ts': 'cvx ships types in single file; stdb splits into types/ folder',
  'stdb:dev.ts': 'stdb dev-tooling helper invoked by CLI; cvx CLI delegates to convex CLI',
  'stdb:generate.ts': 'stdb codegen wrapper around `spacetime generate`',
  'stdb:next/active-org-types.ts': 'stdb-specific type split — types only',
  'stdb:next/query.ts': 'stdb server-side SQL query helper for Next.js — cvx uses preloadQuery',
  'stdb:react/list-utils.ts': 'stdb client-side filter/sort utilities',
  'stdb:react/provider.ts': 'stdb SpacetimeDBProvider wrapper',
  'stdb:react/use-file-url.tsx': 'stdb file-URL hook',
  'stdb:server/org-crud-helpers.ts': 'stdb org-crud reducer helpers',
  'stdb:server/reducer-utils.ts': 'stdb reducer-arg parsing utilities',
  'stdb:server/rls.ts': 'stdb Row-Level-Security SQL builders',
  'stdb:server/stdb-tables.ts': 'stdb table-builder helpers',
  'stdb:server/types/cache.ts': 'stdb types/ folder',
  'stdb:server/types/child.ts': 'stdb types/ folder',
  'stdb:server/types/common.ts': 'stdb types/ folder',
  'stdb:server/types/crud.ts': 'stdb types/ folder',
  'stdb:server/types/file.ts': 'stdb types/ folder',
  'stdb:server/types/index.ts': 'stdb types/ folder',
  'stdb:server/types/kv.ts': 'stdb types/ folder',
  'stdb:server/types/log.ts': 'stdb types/ folder',
  'stdb:server/types/middleware.ts': 'stdb types/ folder',
  'stdb:server/types/org-crud.ts': 'stdb types/ folder',
  'stdb:server/types/presence.ts': 'stdb types/ folder',
  'stdb:server/types/quota.ts': 'stdb types/ folder',
  'stdb:server/types/singleton.ts': 'stdb types/ folder',
  'stdb:server/types/test.ts': 'stdb types/ folder',
  'stdb:stdb-zod.ts': 'stdb-only Zod ↔ SpacetimeDB column-type mapping',
  'stdb:use.ts': 'stdb deployment-target switcher (local/cloud)'
}
const LIB_SYMBOL_EXEMPT = new Set<string>([
  'cvx:add.ts:fieldToZod',
  'cvx:add.ts:genEndpointContent',
  'cvx:add.ts:genSchemaContent',
  'cvx:add.ts:kv',
  'cvx:add.ts:log',
  'cvx:add.ts:quota',
  'cvx:create.ts:api',
  'cvx:create.ts:crud',
  'cvx:create.ts:file',
  'cvx:create.ts:m',
  'cvx:create.ts:owned',
  'cvx:create.ts:pq',
  'cvx:create.ts:q',
  'cvx:doctor.ts:checkRateLimit',
  'cvx:react/use-list.ts:applyOptimistic',
  'cvx:react/use-search.ts:DEFAULT_MIN_LENGTH',
  'cvx:server/helpers.ts:handleConvexError',
  'cvx:server/index.ts:getOrgMember',
  'cvx:server/index.ts:getOrgRole',
  'cvx:server/index.ts:handleConvexError',
  'cvx:server/index.ts:idEquals',
  'cvx:server/index.ts:normalizeRateLimit',
  'cvx:server/index.ts:requireOrgRole',
  'cvx:server/org-crud.ts:getOrgMember',
  'cvx:server/org-crud.ts:getOrgRole',
  'cvx:server/org-crud.ts:requireOrgMember',
  'cvx:server/org-crud.ts:requireOrgRole',
  'cvx:server/org-invites.ts:makeInviteHandlers',
  'cvx:server/org-join.ts:makeJoinHandlers',
  'cvx:server/org-members.ts:makeMemberHandlers',
  'cvx:server/setup.ts:mergeCacheHooks',
  'cvx:server/setup.ts:mergeGlobalHooks',
  'cvx:server/setup.ts:mergeHooks',
  'cvx:server/test.ts:getOrgMembership',
  'cvx:server/test.ts:makeOrgTestCrud',
  'cvx:server/test.ts:makeTestAuth',
  'cvx:server/test.ts:TEST_EMAIL',
  'cvx:viz.ts:extractFieldsFromBlock',
  'stdb:add.ts:fieldToInputType',
  'stdb:add.ts:fieldToTypeExpr',
  'stdb:add.ts:genReducerContent',
  'stdb:add.ts:genTableContent',
  'stdb:create.ts:blog',
  'stdb:create.ts:blogTable',
  'stdb:create.ts:clientContext',
  'stdb:create.ts:createBlog',
  'stdb:create.ts:db',
  'stdb:create.ts:removeBlog',
  'stdb:create.ts:updateBlog',
  'stdb:create.ts:useSpacetime',
  'stdb:doctor.ts:checkDocker',
  'stdb:doctor.ts:checkSpacetimeCli',
  'stdb:index.ts:identityEquals',
  'stdb:index.ts:identityFromHex',
  'stdb:index.ts:identityToHex',
  'stdb:index.ts:idEquals',
  'stdb:index.ts:idFromWire',
  'stdb:index.ts:idToWire',
  'stdb:index.ts:zodFromTable',
  'stdb:next/index.ts:queryTable',
  'stdb:react/devtools.ts:completeReducerCall',
  'stdb:react/devtools.ts:injectError',
  'stdb:react/devtools.ts:trackReducerCall',
  'stdb:react/form.ts:resolveFormToast',
  'stdb:react/index.ts:completeReducerCall',
  'stdb:react/index.ts:createFileUploader',
  'stdb:react/index.ts:createSpacetimeClient',
  'stdb:react/index.ts:createTokenStore',
  'stdb:react/index.ts:extractErrorData',
  'stdb:react/index.ts:fail',
  'stdb:react/index.ts:fileBlobUrl',
  'stdb:react/index.ts:FileProvider',
  'stdb:react/index.ts:getErrorCode',
  'stdb:react/index.ts:getErrorDetail',
  'stdb:react/index.ts:getErrorMessage',
  'stdb:react/index.ts:getFieldErrors',
  'stdb:react/index.ts:getFirstFieldError',
  'stdb:react/index.ts:handleError',
  'stdb:react/index.ts:injectError',
  'stdb:react/index.ts:isErrorCode',
  'stdb:react/index.ts:isMutationError',
  'stdb:react/index.ts:matchError',
  'stdb:react/index.ts:noop',
  'stdb:react/index.ts:ok',
  'stdb:react/index.ts:resolveFileUrl',
  'stdb:react/index.ts:toWsUri',
  'stdb:react/index.ts:trackReducerCall',
  'stdb:react/index.ts:useFiles',
  'stdb:react/index.ts:useFileUrl',
  'stdb:react/index.ts:useMut',
  'stdb:react/index.ts:useMutation',
  'stdb:react/index.ts:useResolveFileUrl',
  'stdb:react/optimistic-store.ts:OptimisticProvider',
  'stdb:react/use-infinite-list.ts:DEFAULT_BATCH_SIZE',
  'stdb:react/use-mutate.ts:useMut',
  'stdb:react/use-mutate.ts:useMutation',
  'stdb:server/helpers.ts:enforceRateLimit',
  'stdb:server/helpers.ts:getFieldErrors',
  'stdb:server/helpers.ts:getFirstFieldError',
  'stdb:server/helpers.ts:identityEquals',
  'stdb:server/helpers.ts:identityFromHex',
  'stdb:server/helpers.ts:identityToHex',
  'stdb:server/helpers.ts:idFromWire',
  'stdb:server/helpers.ts:idToWire',
  'stdb:server/helpers.ts:parseSenderMessage',
  'stdb:server/helpers.ts:resetRateLimitState',
  'stdb:server/index.ts:asUser',
  'stdb:server/index.ts:callReducer',
  'stdb:server/index.ts:checkMembership',
  'stdb:server/index.ts:cleanup',
  'stdb:server/index.ts:createTestContext',
  'stdb:server/index.ts:createTestUser',
  'stdb:server/index.ts:discoverModules',
  'stdb:server/index.ts:errValidation',
  'stdb:server/index.ts:isTestMode',
  'stdb:server/index.ts:makeOrgTables',
  'stdb:server/index.ts:makeSchema',
  'stdb:server/index.ts:makeUnique',
  'stdb:server/index.ts:queryTable',
  'stdb:server/index.ts:setupCrud',
  'stdb:server/index.ts:warnLargeFilterSet',
  'stdb:server/index.ts:zodToStdbFields',
  'stdb:server/org-crud.ts:checkMembership',
  'stdb:server/org-invites.ts:makeInviteReducers',
  'stdb:server/org-invites.ts:makeInviteToken',
  'stdb:server/org-join.ts:makeJoinReducers',
  'stdb:server/org-members.ts:makeMemberReducers',
  'stdb:server/org.ts:makeOrgTables',
  'stdb:server/setup.ts:noboil',
  'stdb:server/setup.ts:setupCrud',
  'stdb:server/test.ts:asUser',
  'stdb:server/test.ts:callReducer',
  'stdb:server/test.ts:cleanup',
  'stdb:server/test.ts:createTestUser',
  'stdb:server/test.ts:extractErrorData',
  'stdb:server/test.ts:getErrorCode',
  'stdb:server/test.ts:getErrorDetail',
  'stdb:server/test.ts:getErrorMessage',
  'stdb:server/test.ts:queryTable',
  'stdb:zod.ts:partialValues',
  'stdb:zod.ts:schemaVariants'
])
const BACKEND_FILE_EXEMPT: Record<string, string> = {
  'cvx:ai.ts': 'cvx-only AI helpers (Convex actions support OpenAI calls server-side)',
  'cvx:check-schema.ts': 'cvx schema verification script; stdb relies on `spacetime build` validation',
  'cvx:convex/auth.config.ts': 'Convex auth configuration; stdb auth handled in src/index.ts',
  'cvx:convex/auth.ts': 'Convex auth re-export; stdb auth integrated into reducers',
  'cvx:convex/blog.ts': 'Convex per-table RPC re-export; stdb auto-generates create_blog/update_blog/rm_blog reducers',
  'cvx:convex/blogProfile.ts': 'Convex per-table re-export; stdb auto-generates upsert_blogProfile reducer',
  'cvx:convex/chat.ts': 'Convex per-table re-export; stdb auto-generates chat reducers',
  'cvx:convex/file.ts': 'Convex file storage re-export; stdb files inline as Uint8Array',
  'cvx:convex/http.ts': 'Convex HTTP router (auth callbacks, image proxy); stdb has no HTTP router',
  'cvx:convex/message.ts': 'Convex per-table re-export; stdb auto-generates message reducers',
  'cvx:convex/movie.ts': 'Convex cacheCrud re-export with TMDB fetcher; stdb does fetching client-side',
  'cvx:convex/org.ts': 'Convex per-table re-export; stdb auto-generates org reducers',
  'cvx:convex/orgProfile.ts': 'Convex per-table re-export; stdb auto-generates upsert_orgProfile',
  'cvx:convex/poll.ts': 'Convex per-table re-export; stdb auto-generates poll reducers',
  'cvx:convex/pollProfile.ts': 'Convex per-table re-export; stdb auto-generates upsert_pollProfile',
  'cvx:convex/pollVoteQuota.ts': 'Convex per-table re-export; stdb auto-generates consume_/record_pollVoteQuota',
  'cvx:convex/presence.ts': 'Convex makePresence re-export; stdb presence reducers auto-registered',
  'cvx:convex/project.ts': 'Convex per-table re-export; stdb auto-generates project reducers',
  'cvx:convex/schema.ts': 'Convex defineSchema export; stdb schema lives in module bindings',
  'cvx:convex/siteConfig.ts': 'Convex per-table re-export; stdb auto-generates set_siteConfig',
  'cvx:convex/task.ts': 'Convex per-table re-export; stdb auto-generates task reducers',
  'cvx:convex/testauth.ts': 'convex-test test-auth helper; stdb tests use connectAsTestUser',
  'cvx:convex/tools/weather.ts': 'Convex action calling external weather API for AI demo; stdb does client-side fetch',
  'cvx:convex/user.ts': 'Convex user re-export; stdb users derived from Identity',
  'cvx:convex/vote.ts': 'Convex log-factory re-export; stdb auto-generates append_vote/purge_vote_by_parent',
  'cvx:convex/wiki.ts': 'Convex orgCrud re-export; stdb auto-generates wiki reducers',
  'cvx:env.ts': 'cvx env wrapper',
  'cvx:lazy.ts': 'cvx convention: lazy.ts is the noboil() entry; stdb uses src/index.ts',
  'cvx:models.mock.ts': 'cvx models mock for tests + AI features; stdb uses test-skeleton.ts',
  'stdb:env.ts': 'stdb env',
  'stdb:src/index.ts': 'stdb noboil() entry — parallel to cvx lazy.ts',
  'stdb:test-skeleton.ts': 'stdb test-fixture skeleton; cvx uses convex-test inline'
}
const BACKEND_SYMBOL_EXEMPT = new Set<string>([
  'cvx:s.ts:base',
  'cvx:s.ts:children',
  'cvx:s.ts:kv',
  'cvx:s.ts:log',
  'cvx:s.ts:org',
  'cvx:s.ts:orgScoped',
  'cvx:s.ts:owned',
  'cvx:s.ts:quota',
  'cvx:s.ts:singleton',
  'stdb:s.ts:messagePart',
  'stdb:s.ts:profileShape'
])
const DEMO_FILE_EXEMPT: Record<string, string> = {
  'cvx:src/app/[id]/client.tsx': 'see [id]/edit/client.tsx — Convex preloadQuery → Client pattern',
  'cvx:src/app/[id]/edit/client.tsx':
    'cvx Next.js pattern: page.tsx server-preloads, client.tsx renders interactive part; stdb co-locates in page.tsx',
  'cvx:src/app/[id]/typing-indicator.tsx':
    'cvx typing indicator backed by Convex presence + ephemeral cleanup; stdb uses RLS-filtered table subscription',
  'cvx:src/app/api/image/route.ts':
    'Convex-side Next.js API route that proxies external images (e.g. TMDB) via Convex action; stdb fetches images client-side',
  'cvx:src/app/fetch/page.tsx': 'TMDB fetching delegated to cvx action (stdb does it client-side)',
  'cvx:src/app/types.ts': 'cvx Movie type extracted to module-level types.ts; stdb co-locates type with usage',
  'cvx:src/utils.ts':
    'cvx-side helpers (mostly Convex Id formatters); stdb has equivalents inline or in noboil/spacetimedb/react',
  'stdb:dev.ts': 'stdb dev-script symlink',
  'stdb:e2e/helpers.ts': 'stdb test cleanup utilities — cvx uses convex-test in-memory runtime so no cleanup needed',
  'stdb:src/app/dev/page.tsx': 'SpacetimeDB SchemaPlayground dev tool — no cvx equivalent',
  'stdb:src/app/fetch/page.tsx': 'TMDB fetching client-side in stdb (cvx delegates to action)',
  'stdb:src/hook/use-org-table.ts':
    'stdb-side hook reading orgs from subscribed table; cvx uses noboil/convex/react useOrgQuery',
  'stdb:src/hook/use-profile-map.ts': 'stdb-side hook for orgProfile lookup map; cvx queries by id via useQuery',
  'stdb:src/proxy.ts': 'stdb-only WebSocket proxy for local dev',
  'stdb:src/schema.ts': 'stdb client-side schema re-export'
}
const DEMO_SYMBOL_EXEMPT = new Set<string>([
  'cvx:src/app/layout.tsx:metadata',
  'cvx:src/app/providers.tsx:ConvexWrapper',
  'stdb:e2e/helpers.ts:cleanupTestData',
  'stdb:src/app/layout.tsx:OrgRedirect',
  'stdb:src/app/providers.tsx:SpacetimeWrapper',
  'stdb:src/hook/use-org.tsx:useActiveOrg',
  'stdb:src/hook/use-org.tsx:useMyOrgs',
  'stdb:src/hook/use-org.tsx:useOrg',
  'stdb:src/hook/use-org.tsx:useOrgMutation',
  'stdb:src/schema.ts:project',
  'stdb:src/schema.ts:wiki'
])
const PAIRS: Pair[] = [
  {
    cvxRoot: `${REPO}/lib/noboil/src/convex`,
    exemptFiles: LIB_FILE_EXEMPT,
    exemptSymbols: LIB_SYMBOL_EXEMPT,
    name: 'lib/noboil/src',
    stdbRoot: `${REPO}/lib/noboil/src/spacetimedb`
  },
  {
    cvxRoot: `${REPO}/backend/convex`,
    exemptFiles: BACKEND_FILE_EXEMPT,
    exemptSymbols: BACKEND_SYMBOL_EXEMPT,
    name: 'backend',
    stdbRoot: `${REPO}/backend/spacetimedb`
  },
  {
    cvxRoot: `${REPO}/web/cvx/blog`,
    exemptFiles: DEMO_FILE_EXEMPT,
    exemptSymbols: DEMO_SYMBOL_EXEMPT,
    name: 'web/blog',
    stdbRoot: `${REPO}/web/stdb/blog`
  },
  {
    cvxRoot: `${REPO}/web/cvx/chat`,
    exemptFiles: DEMO_FILE_EXEMPT,
    exemptSymbols: DEMO_SYMBOL_EXEMPT,
    name: 'web/chat',
    stdbRoot: `${REPO}/web/stdb/chat`
  },
  {
    cvxRoot: `${REPO}/web/cvx/movie`,
    exemptFiles: DEMO_FILE_EXEMPT,
    exemptSymbols: DEMO_SYMBOL_EXEMPT,
    name: 'web/movie',
    stdbRoot: `${REPO}/web/stdb/movie`
  },
  {
    cvxRoot: `${REPO}/web/cvx/org`,
    exemptFiles: DEMO_FILE_EXEMPT,
    exemptSymbols: DEMO_SYMBOL_EXEMPT,
    name: 'web/org',
    stdbRoot: `${REPO}/web/stdb/org`
  },
  {
    cvxRoot: `${REPO}/web/cvx/poll`,
    exemptFiles: DEMO_FILE_EXEMPT,
    exemptSymbols: DEMO_SYMBOL_EXEMPT,
    name: 'web/poll',
    stdbRoot: `${REPO}/web/stdb/poll`
  }
]
interface PairResult {
  cvxOnly: string[]
  cvxUnaccounted: string[]
  name: string
  shared: number
  stdbOnly: string[]
  stdbUnaccounted: string[]
  symbolGapDetails: string[]
  symbolGaps: number
}
const auditPair = (p: Pair): PairResult => {
  const cvxFiles = new Set(walkRel(p.cvxRoot))
  const stdbFiles = new Set(walkRel(p.stdbRoot))
  const cvxOnly = [...cvxFiles].filter(f => !stdbFiles.has(f))
  const stdbOnly = [...stdbFiles].filter(f => !cvxFiles.has(f))
  const shared = [...cvxFiles].filter(f => stdbFiles.has(f))
  const cvxUnaccounted = cvxOnly.filter(f => !p.exemptFiles?.[`cvx:${f}`])
  const stdbUnaccounted = stdbOnly.filter(f => !p.exemptFiles?.[`stdb:${f}`])
  let symbolGaps = 0
  const symbolGapDetails: string[] = []
  for (const f of shared.toSorted()) {
    const cvxExports = collectExports(`${p.cvxRoot}/${f}`)
    const stdbExports = collectExports(`${p.stdbRoot}/${f}`)
    const cvxOnlyExports = [...cvxExports].filter(e => !(stdbExports.has(e) || p.exemptSymbols?.has(`cvx:${f}:${e}`)))
    const stdbOnlyExports = [...stdbExports].filter(e => !(cvxExports.has(e) || p.exemptSymbols?.has(`stdb:${f}:${e}`)))
    if (cvxOnlyExports.length > 0 || stdbOnlyExports.length > 0) {
      symbolGaps += 1
      symbolGapDetails.push(
        `- \`${p.name}/${f}\` — cvx-only: ${
          cvxOnlyExports.length === 0
            ? '—'
            : cvxOnlyExports
                .toSorted()
                .map(e => `\`${e}\``)
                .join(', ')
        } · stdb-only: ${
          stdbOnlyExports.length === 0
            ? '—'
            : stdbOnlyExports
                .toSorted()
                .map(e => `\`${e}\``)
                .join(', ')
        }`
      )
    }
  }
  return {
    cvxOnly,
    cvxUnaccounted,
    name: p.name,
    shared: shared.length,
    stdbOnly,
    stdbUnaccounted,
    symbolGapDetails,
    symbolGaps
  }
}
const main = () => {
  const results = PAIRS.map(auditPair)
  let totalShared = 0
  let totalCvxOnly = 0
  let totalStdbOnly = 0
  let totalUnaccounted = 0
  let totalSymbolGaps = 0
  const summary: string[] = []
  const allGapDetails: string[] = []
  for (const r of results) {
    totalShared += r.shared
    totalCvxOnly += r.cvxOnly.length
    totalStdbOnly += r.stdbOnly.length
    totalUnaccounted += r.cvxUnaccounted.length + r.stdbUnaccounted.length + r.symbolGaps
    totalSymbolGaps += r.symbolGaps
    const status = r.cvxUnaccounted.length === 0 && r.stdbUnaccounted.length === 0 && r.symbolGaps === 0 ? '🟢' : '🔴'
    summary.push(
      `| **${r.name}** | ${r.shared} | ${r.cvxOnly.length} (${r.cvxUnaccounted.length} unaccounted) | ${r.stdbOnly.length} (${r.stdbUnaccounted.length} unaccounted) | ${r.symbolGaps} | ${status} |`
    )
    if (r.cvxUnaccounted.length > 0)
      allGapDetails.push(`- **${r.name}**: cvx-only file \`${r.cvxUnaccounted.join('`, `')}\``)
    if (r.stdbUnaccounted.length > 0)
      allGapDetails.push(`- **${r.name}**: stdb-only file \`${r.stdbUnaccounted.join('`, `')}\``)
    allGapDetails.push(...r.symbolGapDetails)
  }
  const overall =
    totalUnaccounted === 0
      ? '🟢 zero unaccounted-for gaps across the entire repo'
      : `🔴 ${totalUnaccounted} unaccounted-for gap(s)`
  const lines: string[] = [
    `Whole-repo audit. Walks every \`*.ts*\` in ${PAIRS.length} parallel cvx/stdb directory pairs (lib + backend + 5 demos). ${PAIRS.reduce((s, p) => s + Object.keys(p.exemptFiles ?? {}).length, 0)} file-level + ${PAIRS.reduce((s, p) => s + (p.exemptSymbols?.size ?? 0), 0)} symbol-level architectural exemptions registered.`,
    '',
    `**${totalShared} shared files · ${totalCvxOnly} cvx-only · ${totalStdbOnly} stdb-only · ${totalSymbolGaps} files with cross-backend symbol divergence.** Status: ${overall}.`,
    '',
    '| Pair | shared | cvx-only | stdb-only | symbol gaps | status |',
    '|---|--:|---|---|--:|--|',
    ...summary
  ]
  if (allGapDetails.length > 0) {
    lines.push('', '### Unaccounted gaps', '')
    lines.push(...allGapDetails)
  }
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'MEGA-PARITY', lines.join('\n'))
  if (dirty) console.log(`Updated mega parity (${totalUnaccounted} unaccounted-for gaps across ${PAIRS.length} pairs)`)
}
main()

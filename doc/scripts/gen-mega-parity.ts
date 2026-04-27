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
const SKIP_DIRS = new Set(['__tests__', 'dist', 'generated', 'module_bindings', 'node_modules'])
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
    else if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.test.ts')) out.push(r)
  }
  return out
}
const stripStrings = (src: string): string =>
  src
    .replaceAll(/`[\s\S]*?`/gu, '``')
    .replaceAll(/'[^'\n]*'/gu, "''")
    .replaceAll(/"[^"\n]*"/gu, '""')
    .replaceAll(/\/\/[^\n]*/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
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
const SYMBOL_EXEMPT = new Set<string>([
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
const FILE_EXEMPT: Record<string, string> = {
  'cvx:react/optimistic-provider.tsx':
    'cvx-specific React provider for optimistic-mutation store; stdb optimism is built into useMut',
  'cvx:server/env.ts': 'cvx env.ts wraps Convex `internal.x` env access; stdb reads process.env directly',
  'cvx:server/noboil.ts': 'cvx noboil() entry helper; stdb merges this into setup.ts',
  'cvx:server/types.ts': 'cvx ships types in single file; stdb splits into types/ folder (parity by content, not file)',
  'stdb:dev.ts': 'stdb dev tooling helper invoked by CLI; cvx CLI delegates to convex CLI',
  'stdb:generate.ts': 'stdb codegen wrapper around `spacetime generate`; cvx codegen is built into convex CLI',
  'stdb:next/active-org-types.ts': 'stdb-specific type split for ActiveOrgQuery union — types only',
  'stdb:next/query.ts': 'stdb server-side SQL query helper for Next.js server components; cvx uses preloadQuery',
  'stdb:react/list-utils.ts':
    'stdb client-side filter/sort utilities (subscriptions return raw rows); cvx server paginates',
  'stdb:react/provider.ts': 'stdb SpacetimeDBProvider wrapper; cvx uses ConvexProvider directly',
  'stdb:react/use-file-url.tsx': 'stdb file-URL hook (files inline as Uint8Array); cvx uses Convex storage URL hook',
  'stdb:server/org-crud-helpers.ts': 'stdb org-crud reducer helpers — internal scaffolding',
  'stdb:server/reducer-utils.ts': 'stdb reducer-arg parsing utilities — internal scaffolding',
  'stdb:server/rls.ts': 'stdb Row-Level-Security SQL builders; cvx auth filters in handlers',
  'stdb:server/stdb-tables.ts': 'stdb table-builder helpers; cvx uses defineSchema',
  'stdb:server/types/cache.ts': 'stdb types/ folder (cvx ships in single types.ts)',
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
  'stdb:use.ts': 'stdb deployment-target switcher (local/cloud); cvx uses Convex deployment URL env'
}
const main = () => {
  const cvxRoot = `${REPO}/lib/noboil/src/convex`
  const stdbRoot = `${REPO}/lib/noboil/src/spacetimedb`
  const cvxFiles = new Set(walkRel(cvxRoot))
  const stdbFiles = new Set(walkRel(stdbRoot))
  const cvxOnly = [...cvxFiles].filter(f => !stdbFiles.has(f))
  const stdbOnly = [...stdbFiles].filter(f => !cvxFiles.has(f))
  const shared = [...cvxFiles].filter(f => stdbFiles.has(f))
  const cvxUnaccounted = cvxOnly.filter(f => !FILE_EXEMPT[`cvx:${f}`])
  const stdbUnaccounted = stdbOnly.filter(f => !FILE_EXEMPT[`stdb:${f}`])
  let symbolGaps = 0
  const symbolGapDetails: string[] = []
  for (const f of shared.toSorted()) {
    const cvxExports = collectExports(`${cvxRoot}/${f}`)
    const stdbExports = collectExports(`${stdbRoot}/${f}`)
    const cvxOnlyExports = [...cvxExports].filter(e => !(stdbExports.has(e) || SYMBOL_EXEMPT.has(`cvx:${f}:${e}`)))
    const stdbOnlyExports = [...stdbExports].filter(e => !(cvxExports.has(e) || SYMBOL_EXEMPT.has(`stdb:${f}:${e}`)))
    if (cvxOnlyExports.length > 0 || stdbOnlyExports.length > 0) {
      symbolGaps += 1
      symbolGapDetails.push(
        `- \`${f}\` — cvx-only: ${
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
  const totalUnaccounted = cvxUnaccounted.length + stdbUnaccounted.length + symbolGaps
  const status = totalUnaccounted === 0 ? '🟢 zero unaccounted-for gaps' : `🔴 ${totalUnaccounted} unaccounted-for gap(s)`
  const lines: string[] = [
    `Walks every \`*.ts*\` in \`lib/noboil/src/{convex,spacetimedb}/\` (skipping \`__tests__\`, \`generated/\`, \`module_bindings/\`). Compares file presence + per-file export sets. ${Object.keys(FILE_EXEMPT).length} file-level architectural exemptions documented.`,
    '',
    `**${shared.length} shared files · ${cvxOnly.length} cvx-only (${cvxUnaccounted.length} unaccounted) · ${stdbOnly.length} stdb-only (${stdbUnaccounted.length} unaccounted) · ${symbolGaps} files with symbol-set divergence.** Status: ${status}.`
  ]
  if (cvxUnaccounted.length > 0) {
    lines.push('', '### Unaccounted cvx-only files', '')
    for (const f of cvxUnaccounted.toSorted()) lines.push(`- \`${f}\``)
  }
  if (stdbUnaccounted.length > 0) {
    lines.push('', '### Unaccounted stdb-only files', '')
    for (const f of stdbUnaccounted.toSorted()) lines.push(`- \`${f}\``)
  }
  if (symbolGapDetails.length > 0) {
    lines.push('', '### Files with cross-backend symbol divergence', '')
    lines.push(...symbolGapDetails)
  }
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'MEGA-PARITY', lines.join('\n'))
  if (dirty)
    console.log(
      `Updated mega parity (${cvxUnaccounted.length} cvx + ${stdbUnaccounted.length} stdb + ${symbolGaps} symbol gaps unaccounted)`
    )
}
main()

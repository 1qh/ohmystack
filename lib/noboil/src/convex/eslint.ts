import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BaseNode, DbConfig } from '../shared/eslint-factory'
import { createEslintPluginBundle } from '../shared/eslint'
import { buildRules, readSchemaContentFrom } from '../shared/eslint-factory'
const cache: { modules?: string[]; schemaDir?: string } = {}
const hasGenerated = (dir: string): boolean => existsSync(join(dir, '_generated'))
const searchSubdirs = (root: string): string | undefined => {
  if (!existsSync(root)) return
  for (const sub of readdirSync(root, { withFileTypes: true }))
    if (sub.isDirectory()) {
      const nested = join(root, sub.name, 'convex')
      if (hasGenerated(nested)) return nested
    }
}
const findConvexDirFresh = (root: string): string | undefined => {
  const direct = join(root, 'convex')
  return hasGenerated(direct) ? direct : searchSubdirs(root)
}
const findConvexDir = (root: string): string | undefined => {
  if (cache.schemaDir) return cache.schemaDir
  const found = findConvexDirFresh(root)
  if (found) cache.schemaDir = found
  return found
}
const listModuleFiles = (dir: string): string[] => {
  const result: string[] = []
  for (const entry of readdirSync(dir))
    if (entry.endsWith('.ts') && !entry.startsWith('_') && !entry.includes('.test.') && !entry.includes('.config.'))
      result.push(entry.slice(0, -'.ts'.length))
  return result
}
const getModules = (root: string): string[] => {
  if (cache.modules) return cache.modules
  const dir = findConvexDir(root)
  if (!dir) return []
  cache.modules = listModuleFiles(dir)
  return cache.modules
}
const getModulesFresh = (root: string): string[] => {
  const dir = findConvexDirFresh(root)
  return dir ? listModuleFiles(dir) : []
}
const findSchemaContent = (root: string): string => {
  const convexDir = findConvexDir(root)
  return readSchemaContentFrom(convexDir ? dirname(convexDir) : root)
}
const findSchemaContentFresh = (root: string): string => {
  const convexDir = findConvexDirFresh(root)
  return readSchemaContentFrom(convexDir ? dirname(convexDir) : root)
}
const isApiExpression = (node: BaseNode): boolean => {
  if (node.type === 'Identifier') return node.name === 'api'
  if (node.type !== 'MemberExpression' || !node.object) return false
  return isApiExpression(node.object)
}
const config: DbConfig = {
  apiCasing: {
    casingMismatchMsg: 'api.{{used}} — wrong casing. Use api.{{suggestion}} to match the convex/ filename.',
    getApiBaseName: node => (node.type === 'Identifier' && node.name === 'api' ? 'api' : undefined),
    unknownModuleMsg: 'api.{{used}} — no matching file in convex/.'
  },
  bindings: {
    discoveryFailedMsg:
      'noboil/convex: could not find {{missing}} (searched ./convex/ and ./lib/*/convex/). Some rules are inactive.',
    discoveryMissingLabel: 'convex/ directory'
  },
  cast: {
    isCastTarget: isApiExpression,
    unsafeApiCastMsg:
      'Unsafe cast on api object. This bypasses type safety. Extract the function reference from the factory or use a custom query.'
  },
  connection: {
    dataFns: new Set(['fetchAction', 'fetchQuery', 'preloadQuery']),
    missingConnectionMsg:
      "{{fn}}() requires 'await connection()' before it in Next.js server components to signal dynamic rendering.",
    unhandledFetchMsg:
      '{{fn}}() without try-catch. If the query fails, the page crashes. Wrap in try-catch or use an error-handling wrapper.'
  },
  crud: {
    factories: new Set(['childCrud', 'crud', 'orgCrud', 'singletonCrud']),
    writeFactories: new Set(['crud', 'orgCrud'])
  },
  list: {
    hookName: 'useQuery',
    msg: 'useQuery() on a list endpoint — use useList() instead for built-in pagination, loadMore, and loading states.',
    propNames: new Set(['list', 'pubList'])
  },
  mutation: {
    authIdents: ['getAuthUserId', 'requireAuth', 'requireOrgMember', 'requireOrgRole'],
    requireDbInBody: true
  },
  orgQuery: {
    isHook: callee => callee === 'useQuery',
    msg: 'useQuery() with orgId — use useOrgQuery() instead. It injects orgId automatically from the OrgProvider context.'
  },
  pluginName: 'noboil-convex',
  provider: {
    missingErrorBoundaryMsg:
      '<ConvexProvider> without an error boundary. Wrap with an ErrorBoundary to handle Convex errors gracefully.',
    nameMatchers: ['ConvexProvider']
  },
  schema: {
    findSchemaContent,
    findSchemaContentFresh,
    getModules,
    getModulesFresh
  }
}
const rules = buildRules(config)
const { plugin, recommended } = createEslintPluginBundle({ pluginName: config.pluginName, rules })
export { plugin, recommended, rules }

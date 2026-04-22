/* eslint-disable max-depth */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BaseNode, DbConfig } from '../shared/eslint-factory'
import { createEslintPluginBundle } from '../shared/eslint'
import {
  bodyContainsIdent,
  buildRules,
  extractTables,
  isSchemaFile,
  readSchemaContentFrom
} from '../shared/eslint-factory'
const cache: { modules?: string[]; schemaDir?: string } = {}
const hasSchemaMarkers = (dir: string): boolean => {
  if (!existsSync(dir)) return false
  for (const entry of readdirSync(dir))
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.config.ts')) {
      const content = readFileSync(join(dir, entry), 'utf8')
      if (isSchemaFile(content)) return true
    }
  return false
}
const searchSubdirs = (root: string): string | undefined => {
  if (!existsSync(root)) return
  for (const sub of readdirSync(root, { withFileTypes: true }))
    if (sub.isDirectory()) {
      const nested = join(root, sub.name)
      if (hasSchemaMarkers(nested)) return nested
      for (const child of readdirSync(nested, { withFileTypes: true }))
        if (child.isDirectory()) {
          const deep = join(nested, child.name)
          if (hasSchemaMarkers(deep)) return deep
        }
    }
}
const findSchemaDirFresh = (root: string): string | undefined => (hasSchemaMarkers(root) ? root : searchSubdirs(root))
const findSchemaDir = (root: string): string | undefined => {
  if (cache.schemaDir) return cache.schemaDir
  const found = findSchemaDirFresh(root)
  if (found) cache.schemaDir = found
  return found
}
const findSchemaContent = (root: string): string => readSchemaContentFrom(findSchemaDir(root) ?? root)
const findSchemaContentFresh = (root: string): string => readSchemaContentFrom(findSchemaDirFresh(root) ?? root)
const STDB_IMPORT_MARKERS = [
  "'@a/be-spacetimedb'",
  '"@a/be-spacetimedb"',
  "'@a/be-spacetimedb/spacetimedb'",
  '"@a/be-spacetimedb/spacetimedb"',
  "'noboil/spacetimedb'",
  '"noboil/spacetimedb"',
  "'noboil/spacetimedb/server'",
  '"noboil/spacetimedb/server"',
  "'spacetimedb/react'",
  '"spacetimedb/react"'
]
const hasSpacetimeImportsFresh = (root: string): boolean => {
  if (existsSync(join(root, 'module_bindings'))) return true
  const schemaDir = findSchemaDirFresh(root)
  const searchRoots: string[] = [root]
  if (schemaDir) searchRoots.push(dirname(schemaDir))
  for (const dir of searchRoots)
    if (existsSync(dir))
      for (const entry of readdirSync(dir, { withFileTypes: true }))
        if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = readFileSync(join(dir, entry.name), 'utf8')
          for (const marker of STDB_IMPORT_MARKERS) if (content.includes(marker)) return true
        }
  return false
}
const getModulesFrom = (root: string): string[] => {
  const tables = extractTables(readSchemaContentFrom(findSchemaDir(root) ?? root))
  return [...tables.keys()]
}
const getModulesFreshFrom = (root: string): string[] => {
  const tables = extractTables(readSchemaContentFrom(findSchemaDirFresh(root) ?? root))
  return [...tables.keys()]
}
const getModules = (root: string): string[] => {
  if (cache.modules) return cache.modules
  cache.modules = getModulesFrom(root)
  return cache.modules
}
const isSpacetimeExpression = (node: BaseNode): boolean => {
  if (node.type === 'Identifier') return node.name === 'reducers' || node.name === 'tables'
  if (node.type !== 'MemberExpression' || !node.object) return false
  return isSpacetimeExpression(node.object)
}
const config: DbConfig = {
  apiCasing: {
    casingMismatchMsg: '{{used}} — wrong casing. Use {{suggestion}} to match your SpacetimeDB table name.',
    getApiBaseName: node => {
      if (node.type !== 'Identifier') return
      if (node.name === 'reducers' || node.name === 'tables') return node.name
    },
    unknownModuleMsg: '{{used}} — no matching SpacetimeDB table found in schema.'
  },
  bindings: {
    discoveryExtraCheck: hasSpacetimeImportsFresh,
    discoveryFailedMsg:
      'noboil/spacetimedb: could not find {{missing}} while scanning project TypeScript sources. Some rules are inactive.',
    discoveryMissingLabel: 'SpacetimeDB imports (@a/be/spacetimedb or spacetimedb/react)'
  },
  cast: {
    isCastTarget: isSpacetimeExpression,
    unsafeApiCastMsg:
      'Unsafe cast on reducers/tables object. This bypasses type safety. Extract a typed reducer/table reference instead.'
  },
  connection: {
    dataFns: new Set(['useReducer', 'useTable']),
    extraConnectionCheck: body => bodyContainsIdent(body, 'useSpacetimeDB'),
    missingConnectionMsg:
      '{{fn}}() should be used with useSpacetimeDB() in scope so reducer and table calls share one initialized client context.',
    unhandledFetchMsg:
      '{{fn}}() without try-catch. If the query fails, the page crashes. Wrap in try-catch or use an error-handling wrapper.'
  },
  crud: {
    factories: new Set(['childCrud', 'crud', 'orgCrud', 'singletonCrud']),
    writeFactories: new Set(['crud'])
  },
  list: {
    hookName: 'useReducer',
    msg: 'useReducer() on a list endpoint — use useTable() for subscription-ready reads and readiness state.',
    propNames: new Set(['list', 'pubList'])
  },
  mutation: {
    authIdents: ['getAuthUserId', 'requireAuth'],
    requireDbInBody: false
  },
  orgQuery: {
    isHook: callee => callee === 'useTable' || callee === 'useReducer',
    msg: 'Manual orgId in SpacetimeDB hook call — prefer deriving org context from useSpacetimeDB() instead of passing orgId directly.'
  },
  pluginName: 'noboil-stdb',
  provider: {
    missingErrorBoundaryMsg:
      '<SpacetimeDBProvider> without an error boundary. Wrap with an ErrorBoundary to handle realtime data errors gracefully.',
    nameMatchers: ['SpacetimeDBProvider', 'SpacetimeProvider']
  },
  schema: {
    findSchemaContent,
    findSchemaContentFresh,
    getModules,
    getModulesFresh: getModulesFreshFrom
  }
}
const rules = buildRules(config)
const { plugin, recommended } = createEslintPluginBundle({ pluginName: config.pluginName, rules })
export { plugin, recommended, rules }

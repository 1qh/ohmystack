/* eslint-disable one-var, max-depth */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

interface BaseNode {
  argument?: BaseNode
  async?: boolean
  body?: { body?: BaseNode[]; type?: string }
  callee?: BaseNode
  expression?: BaseNode
  key?: BaseNode
  name?: string
  object?: BaseNode
  properties?: BaseNode[]
  property?: BaseNode
  type: string
  value?: unknown
}

interface EslintContext {
  cwd: string
  filename: string
  report: (d: { data?: Record<string, string>; messageId: string; node: BaseNode }) => void
}

interface JsxNode {
  attributes?: { name?: { name?: string }; type: string; value?: { type: string; value?: string } }[]
  name?: { name?: string; type: string }
}

let cachedModules: string[] | undefined
let cachedSchema: Map<string, Map<string, string>> | undefined
let discoveredSchemaDir: string | undefined
const discoveryWarnedRoots = new Set<string>()
const seenCrudTables = new Map<string, string>()
const schemaMarkers = ['makeOwned(', 'makeOrgScoped(', 'makeSingleton(', 'makeBase(', 'child(']

const isSchemaFile = (content: string): boolean => {
  for (const marker of schemaMarkers) if (content.includes(marker)) return true
  return false
}

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

const findSchemaDir = (root: string): string | undefined => {
  if (discoveredSchemaDir) return discoveredSchemaDir
  const found = hasSchemaMarkers(root) ? root : searchSubdirs(root)
  if (found) discoveredSchemaDir = found
  return found
}

const zodFieldKinds: Record<string, string> = {
  array: 'arr',
  boolean: 'toggle',
  cvFile: 'file',
  cvFiles: 'files',
  enum: 'choose',
  number: 'number',
  string: 'text',
  zenum: 'choose'
}

const componentToKind: Record<string, string> = {
  Arr: 'arr',
  Choose: 'choose',
  File: 'file',
  Files: 'files',
  NumberInput: 'number',
  Text: 'text',
  Toggle: 'toggle'
}

const kindToComponent: Record<string, string> = {
  arr: 'Arr',
  choose: 'Choose',
  file: 'File',
  files: 'Files',
  number: 'NumberInput',
  text: 'Text',
  toggle: 'Toggle'
}

const crudFactories = new Set(['childCrud', 'crud', 'orgCrud', 'singletonCrud'])
const spacetimeDataHooks = new Set(['useReducer', 'useTable'])
const routeFilePattern = /\/route\.[jt]sx?$/u

const isIdent = (node: BaseNode, name: string): boolean => node.type === 'Identifier' && node.name === name

const getIdentName = (node: BaseNode): string | undefined => (node.type === 'Identifier' ? node.name : undefined)

const getLiteralString = (node: BaseNode): string | undefined =>
  node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined

const getPropertyName = (node: BaseNode): string | undefined =>
  node.type === 'MemberExpression' && node.property?.type === 'Identifier' ? node.property.name : undefined

const isSpacetimeExpression = (node: BaseNode): boolean => {
  if (node.type === 'Identifier') return node.name === 'reducers' || node.name === 'tables'
  if (node.type !== 'MemberExpression' || !node.object) return false
  return isSpacetimeExpression(node.object)
}

const parseFields = (fieldsStr: string): Map<string, string> => {
  const fields = new Map<string, string>()
  const fieldPattern = /(?<fname>\w+):\s*(?<ftype>[\w.]+)\(/gu
  let fieldMatch = fieldPattern.exec(fieldsStr)
  while (fieldMatch) {
    const { fname, ftype } = fieldMatch.groups as { fname: string; ftype: string }
    if (fname && ftype) {
      const kind = zodFieldKinds[ftype]
      if (kind) fields.set(fname, kind)
    }
    fieldMatch = fieldPattern.exec(fieldsStr)
  }
  return fields
}

const addTable = (tables: Map<string, Map<string, string>>, tableName: string, fieldsStr: string): void => {
  const fields = parseFields(fieldsStr)
  if (fields.size > 0) tables.set(tableName, fields)
}

const extractTables = (content: string): Map<string, Map<string, string>> => {
  const tables = new Map<string, Map<string, string>>()
  if (!content) return tables
  const pat = /(?<tname>\w+):\s*object\(\{(?<tbody>[^}]*(?:\{[^}]*\}[^}]*)*)\}\)/gu
  let m = pat.exec(content)
  while (m) {
    if (m.groups) addTable(tables, m.groups.tname ?? '', m.groups.tbody ?? '')
    m = pat.exec(content)
  }
  return tables
}

const findSchemaContent = (root: string): string => {
  const schemaDir = findSchemaDir(root)
  const searchDir = schemaDir ?? root
  if (!existsSync(searchDir)) return ''
  for (const entry of readdirSync(searchDir))
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.config.ts')) {
      const content = readFileSync(join(searchDir, entry), 'utf8')
      if (isSchemaFile(content)) return content
    }
  return ''
}

const parseSchemaFile = (root: string): Map<string, Map<string, string>> => {
  if (cachedSchema) return cachedSchema
  cachedSchema = extractTables(findSchemaContent(root))
  return cachedSchema
}

const getContextRoot = (context: EslintContext): string => {
  if (!context.filename.startsWith(context.cwd)) return context.cwd
  let current = dirname(context.filename)
  while (current.startsWith(context.cwd)) {
    if (existsSync(join(current, 'package.json'))) return current
    if (current === context.cwd) return context.cwd
    const parent = dirname(current)
    if (parent === current) return context.cwd
    current = parent
  }
  return context.cwd
}

const findSchemaDirFresh = (root: string): string | undefined => (hasSchemaMarkers(root) ? root : searchSubdirs(root))

const findSchemaContentFresh = (root: string): string => {
  const schemaDir = findSchemaDirFresh(root)
  const searchDir = schemaDir ?? root
  if (!existsSync(searchDir)) return ''
  for (const entry of readdirSync(searchDir))
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.config.ts')) {
      const content = readFileSync(join(searchDir, entry), 'utf8')
      if (isSchemaFile(content)) return content
    }
  return ''
}

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
          if (
            content.includes("'@a/be-spacetimedb'") ||
            content.includes('"@a/be-spacetimedb"') ||
            content.includes("'@a/be-spacetimedb/spacetimedb'") ||
            content.includes('"@a/be-spacetimedb/spacetimedb"') ||
            content.includes("'@noboil/spacetimedb'") ||
            content.includes('"@noboil/spacetimedb"') ||
            content.includes("'@noboil/spacetimedb/server'") ||
            content.includes('"@noboil/spacetimedb/server"')
          )
            return true
          if (content.includes("'spacetimedb/react'") || content.includes('"spacetimedb/react"')) return true
        }
  return false
}

const getModules = (root: string): string[] => {
  if (cachedModules) return cachedModules
  const result: string[] = []
  const tables = parseSchemaFile(root)
  for (const tableName of tables.keys()) result.push(tableName)
  cachedModules = result
  return result
}

const getJsxNameProp = (node: JsxNode): string | undefined => {
  if (!node.attributes) return
  for (const attr of node.attributes)
    if (attr.type === 'JSXAttribute' && attr.name?.name === 'name' && attr.value?.type === 'Literal')
      return attr.value.value
}

const getAllFieldNames = (tables: Map<string, Map<string, string>>): Set<string> => {
  const names = new Set<string>()
  for (const fields of tables.values()) for (const name of fields.keys()) names.add(name)
  return names
}

const getFieldKind = (tables: Map<string, Map<string, string>>, fieldName: string): string | undefined => {
  for (const fields of tables.values()) {
    const kind = fields.get(fieldName)
    if (kind) return kind
  }
}

const checkStandardCrud = (node: BaseNode & { arguments: BaseNode[] }, context: EslintContext): void => {
  if (node.arguments.length < 2) return
  const [first, second] = node.arguments
  if (!(first && second)) return
  const nameArg = getLiteralString(first)
  if (!nameArg) return
  const schemaProp = getPropertyName(second)
  if (!schemaProp || nameArg === schemaProp) return
  context.report({
    data: { expected: schemaProp, got: nameArg },
    messageId: 'crudNameMismatch',
    node: first
  })
}

const extractCacheCrudProps = (
  obj: BaseNode & { properties: (BaseNode & { key: BaseNode; value: BaseNode })[] }
): { schemaName?: string; tableName?: string; tableNode?: BaseNode } => {
  let tableName: string | undefined, schemaName: string | undefined, tableNode: BaseNode | undefined
  for (const p of obj.properties)
    if (p.type === 'Property') {
      const key = getIdentName(p.key)
      if (key === 'table') {
        tableName = getLiteralString(p.value)
        tableNode = p.value
      }
      if (key === 'schema') schemaName = getPropertyName(p.value)
    }
  return { schemaName, tableName, tableNode }
}

type CallNode = BaseNode & { arguments: BaseNode[]; callee: BaseNode }

const checkCacheCrud = (node: CallNode, context: EslintContext): void => {
  if (node.arguments.length === 0) return
  const [arg] = node.arguments
  if (arg?.type !== 'ObjectExpression') return
  const { schemaName, tableName, tableNode } = extractCacheCrudProps(
    arg as BaseNode & { properties: (BaseNode & { key: BaseNode; value: BaseNode })[] }
  )
  if (!(tableName && schemaName) || tableName === schemaName) return
  context.report({
    data: { expected: schemaName, got: tableName },
    messageId: 'crudNameMismatch',
    node: tableNode ?? node
  })
}

const blockHasConnection = (body: BaseNode[]): boolean => {
  for (const stmt of body)
    if (stmt.type === 'ExpressionStatement' && stmt.expression) {
      const expr = stmt.expression
      if (expr.type === 'AwaitExpression' && expr.argument) {
        const arg = expr.argument
        if (arg.type === 'CallExpression' && arg.callee && isIdent(arg.callee, 'connection')) return true
      }
    }
  return false
}

const findEnclosingAsyncBody = (ancestors: BaseNode[]): BaseNode[] | undefined => {
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const a = ancestors[i]
    if (!a) break
    const isFunc =
      a.type === 'ArrowFunctionExpression' || a.type === 'FunctionDeclaration' || a.type === 'FunctionExpression'
    if (isFunc && a.async && a.body?.type === 'BlockStatement' && a.body.body) return a.body.body
  }
}

const hasOrgIdArg = (node: CallNode): boolean => {
  if (node.arguments.length < 2) return false
  const [, args] = node.arguments
  if (args?.type !== 'ObjectExpression') return false
  const obj = args as BaseNode & { properties: (BaseNode & { key: BaseNode })[] }
  for (const p of obj.properties) if (p.type === 'Property' && isIdent(p.key, 'orgId')) return true
  return false
}

const getCalleeProperty = (node: CallNode): string | undefined => {
  if (node.arguments.length === 0) return
  const [first] = node.arguments
  if (first?.type !== 'MemberExpression') return
  return getPropertyName(first)
}

const isInsideTryBlock = (ancestors: BaseNode[]): boolean => {
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const a = ancestors[i]
    if (!a) break
    if (a.type === 'TryStatement') return true
    const isFunc = a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression'
    if (isFunc && i > 0 && ancestors[i - 1]?.type === 'CallExpression') return true
  }
  return false
}

const getCacheCrudTable = (node: CallNode): string | undefined => {
  if (node.arguments.length === 0) return
  const [arg] = node.arguments
  if (arg?.type !== 'ObjectExpression') return
  const obj = arg as BaseNode & { properties: (BaseNode & { key: BaseNode; value: BaseNode })[] }
  for (const p of obj.properties)
    if (p.type === 'Property' && getIdentName(p.key) === 'table') return getLiteralString(p.value)
}

const getComponentKind = (node: JsxNode): string | undefined =>
  node.name?.type === 'JSXIdentifier' && node.name.name ? componentToKind[node.name.name] : undefined

const checkFieldKindMismatch = (node: JsxNode, tables: Map<string, Map<string, string>>, context: EslintContext): void => {
  const componentKind = getComponentKind(node)
  if (!componentKind) return
  const fieldName = getJsxNameProp(node)
  if (!fieldName) return
  const schemaKind = getFieldKind(tables, fieldName)
  if (!schemaKind || componentKind === schemaKind) return
  const expected = kindToComponent[schemaKind]
  if (!expected) return
  context.report({
    data: { expected, field: fieldName, got: node.name?.name ?? '' },
    messageId: 'fieldKindMismatch',
    node: node as unknown as BaseNode
  })
}

type MemberNode = BaseNode & { object: BaseNode; property: BaseNode }

/** ESLint rule to detect and suggest corrections for api module name casing errors. */
const apiCasing = {
  create: (context: EslintContext) => {
    const modules = getModules(context.cwd)
    if (modules.length === 0) return {}
    const lowerMap = new Map<string, string>()
    for (const m of modules) lowerMap.set(m.toLowerCase(), m)
    return {
      MemberExpression: (node: MemberNode) => {
        if (node.object.type !== 'MemberExpression') return
        const parent = node.object as MemberNode
        if (parent.object.type !== 'Identifier') return
        const base = (parent.object as { name: string }).name
        if (base !== 'reducers' && base !== 'tables') return
        if (parent.property.type !== 'Identifier') return
        const prop = parent.property as BaseNode & { name: string }
        if (modules.includes(prop.name)) return
        const suggestion = lowerMap.get(prop.name.toLowerCase())
        context.report({
          data: suggestion ? { suggestion, used: prop.name } : { used: prop.name },
          messageId: suggestion ? 'casingMismatch' : 'unknownModule',
          node: prop
        })
      }
    }
  },
  meta: {
    messages: {
      casingMismatch: '{{used}} \u2014 wrong casing. Use {{suggestion}} to match your SpacetimeDB table name.',
      unknownModule: '{{used}} \u2014 no matching SpacetimeDB table found in schema.'
    },
    type: 'problem' as const
  }
}

/** ESLint rule to ensure CRUD factory table names match their schema property names. */
const consistentCrudNaming = {
  create: (context: EslintContext) => ({
    CallExpression: (node: CallNode) => {
      const callee = getIdentName(node.callee)
      if (callee && crudFactories.has(callee)) return checkStandardCrud(node, context)
      if (callee === 'cacheCrud') return checkCacheCrud(node, context)
    }
  }),
  meta: {
    messages: {
      crudNameMismatch:
        "Table name '{{got}}' doesn't match schema property '{{expected}}'. Use '{{expected}}' to avoid runtime errors."
    },
    type: 'problem' as const
  }
}

const isRouteHandler = (filename: string): boolean => routeFilePattern.test(filename)

const bodyContainsIdent = (nodes: BaseNode[], target: string): boolean => {
  for (const n of nodes) {
    if (n.type === 'Identifier' && n.name === target) return true
    if (n.body?.body && bodyContainsIdent(n.body.body, target)) return true
    if (n.argument && bodyContainsIdent([n.argument], target)) return true
    if (n.expression && bodyContainsIdent([n.expression], target)) return true
    if (n.callee && bodyContainsIdent([n.callee], target)) return true
    if (n.properties) for (const p of n.properties) if (bodyContainsIdent([p], target)) return true
  }
  return false
}

/** ESLint rule to require useSpacetimeDB() before SpacetimeDB data hooks. */
const requireConnection = {
  create: (context: EslintContext) => {
    if (isRouteHandler(context.filename)) return {}
    return {
      CallExpression: (node: CallNode) => {
        const callee = getIdentName(node.callee)
        if (!(callee && spacetimeDataHooks.has(callee))) return
        const src = context as unknown as { sourceCode: { getAncestors: (n: BaseNode) => BaseNode[] } }
        const body = findEnclosingAsyncBody(src.sourceCode.getAncestors(node))
        if (!body) return
        if (blockHasConnection(body) || bodyContainsIdent(body, 'useSpacetimeDB')) return
        context.report({ data: { fn: callee }, messageId: 'missingConnection', node })
      }
    }
  },
  meta: {
    messages: {
      missingConnection:
        '{{fn}}() should be used with useSpacetimeDB() in scope so reducer and table calls share one initialized client context.'
    },
    type: 'problem' as const
  }
}

/** ESLint rule to prevent unsafe type casts on SpacetimeDB objects. */
const noUnsafeApiCast = {
  create: (context: EslintContext) => ({
    TSAsExpression: (node: BaseNode & { expression: BaseNode }) => {
      if (!isSpacetimeExpression(node.expression)) return
      context.report({ messageId: 'unsafeApiCast', node })
    }
  }),
  meta: {
    messages: {
      unsafeApiCast:
        'Unsafe cast on reducers/tables object. This bypasses type safety. Extract a typed reducer/table reference instead.'
    },
    type: 'suggestion' as const
  }
}

/** ESLint rule to suggest useTable() instead of useReducer() for list endpoints. */
const preferUseList = {
  create: (context: EslintContext) => ({
    CallExpression: (node: CallNode) => {
      if (!isIdent(node.callee, 'useReducer')) return
      const prop = getCalleeProperty(node)
      if (prop !== 'list' && prop !== 'pubList') return
      context.report({ messageId: 'preferUseList', node })
    }
  }),
  meta: {
    messages: {
      preferUseList:
        'useReducer() on a list endpoint \u2014 use useTable() for subscription-ready reads and readiness state.'
    },
    type: 'suggestion' as const
  }
}

/** ESLint rule to suggest useSpacetimeDB() context instead of manual orgId args. */
const preferUseOrgQuery = {
  create: (context: EslintContext) => ({
    CallExpression: (node: CallNode) => {
      const callee = getIdentName(node.callee)
      if (callee !== 'useTable' && callee !== 'useReducer') return
      if (!hasOrgIdArg(node)) return
      context.report({ messageId: 'preferOrgQuery', node })
    }
  }),
  meta: {
    messages: {
      preferOrgQuery:
        'Manual orgId in SpacetimeDB hook call \u2014 prefer deriving org context from useSpacetimeDB() instead of passing orgId directly.'
    },
    type: 'suggestion' as const
  }
}

/** ESLint rule to validate form field names exist in the schema. */
const formFieldExists = {
  create: (context: EslintContext) => {
    const tables = parseSchemaFile(context.cwd)
    if (tables.size === 0) return {}
    const allFields = getAllFieldNames(tables)
    return {
      JSXOpeningElement: (node: JsxNode) => {
        if (node.name?.type !== 'JSXIdentifier') return
        const tag = node.name.name
        if (!(tag && componentToKind[tag])) return
        const fieldName = getJsxNameProp(node)
        if (!fieldName) return
        if (allFields.has(fieldName)) return
        context.report({
          data: { field: fieldName },
          messageId: 'fieldNotFound',
          node: node as unknown as BaseNode
        })
      }
    }
  },
  meta: {
    messages: {
      fieldNotFound: "'{{field}}' does not match any field in the schema. Check for typos."
    },
    type: 'problem' as const
  }
}

/** ESLint rule to validate form field components match their schema field types. */
const formFieldKind = {
  create: (context: EslintContext) => {
    const tables = parseSchemaFile(context.cwd)
    if (tables.size === 0) return {}
    return {
      JSXOpeningElement: (node: JsxNode) => checkFieldKindMismatch(node, tables, context)
    }
  },
  meta: {
    messages: {
      fieldKindMismatch: "'{{field}}' is a {{expected}} field, but rendered with <{{got}}>. Use <{{expected}}> instead."
    },
    type: 'suggestion' as const
  }
}

/** ESLint rule to warn if SpacetimeDB bindings or schema file cannot be discovered. */
const discoveryCheck = {
  create: (context: EslintContext) => {
    const root = getContextRoot(context)
    if (discoveryWarnedRoots.has(root)) return {}
    const hasBindings = hasSpacetimeImportsFresh(root)
    const hasSchema = extractTables(findSchemaContentFresh(root)).size > 0
    if (hasBindings && hasSchema) return {}
    discoveryWarnedRoots.add(root)
    const parts: string[] = []
    if (!hasBindings) parts.push('SpacetimeDB imports (@a/be/spacetimedb or spacetimedb/react)')
    if (!hasSchema) parts.push('schema file')
    return {
      Program: (node: BaseNode) => {
        context.report({
          data: { missing: parts.join(' and ') },
          messageId: 'discoveryFailed',
          node
        })
      }
    }
  },
  meta: {
    messages: {
      discoveryFailed:
        '@noboil/spacetimedb: could not find {{missing}} while scanning project TypeScript sources. Some rules are inactive.'
    },
    type: 'suggestion' as const
  }
}

/** ESLint rule to detect duplicate CRUD factory registrations for the same table. */
const noDuplicateCrud = {
  create: (context: EslintContext) => ({
    CallExpression: (node: CallNode) => {
      const callee = getIdentName(node.callee)
      if (!(callee && (crudFactories.has(callee) || callee === 'cacheCrud'))) return
      if (node.arguments.length === 0) return
      const [first] = node.arguments
      if (!first) return
      const tableName = callee === 'cacheCrud' ? getCacheCrudTable(node) : getLiteralString(first)
      if (!tableName) return
      const prev = seenCrudTables.get(tableName)
      if (prev) return context.report({ data: { file: prev, table: tableName }, messageId: 'duplicateCrud', node: first })
      seenCrudTables.set(
        tableName,
        context.filename.startsWith(context.cwd) ? context.filename.slice(context.cwd.length + 1) : context.filename
      )
    }
  }),
  meta: {
    messages: {
      duplicateCrud: "Duplicate CRUD factory for table '{{table}}'. Already registered in {{file}}."
    },
    type: 'problem' as const
  }
}

/** ESLint rule to require try-catch around SpacetimeDB reducer/table hook calls in server components. */
const noRawFetchInServerComponent = {
  create: (context: EslintContext) => ({
    CallExpression: (node: CallNode) => {
      const callee = getIdentName(node.callee)
      if (!(callee && spacetimeDataHooks.has(callee))) return
      const src = context as unknown as { sourceCode: { getAncestors: (n: BaseNode) => BaseNode[] } }
      if (isInsideTryBlock(src.sourceCode.getAncestors(node))) return
      context.report({ data: { fn: callee }, messageId: 'unhandledFetch', node })
    }
  }),
  meta: {
    messages: {
      unhandledFetch:
        '{{fn}}() without try-catch. If the query fails, the page crashes. Wrap in try-catch or use an error-handling wrapper.'
    },
    type: 'suggestion' as const
  }
}

/** ESLint rule to require ErrorBoundary when using SpacetimeDB providers. */
const requireErrorBoundary = {
  create: (context: EslintContext) => {
    const providerNodes: BaseNode[] = []
    let hasErrorBoundary = false
    return {
      JSXOpeningElement: (node: JsxNode) => {
        const name = node.name?.type === 'JSXIdentifier' ? node.name.name : undefined
        if (!name) return
        if (name.includes('SpacetimeDBProvider') || name.includes('SpacetimeProvider'))
          providerNodes.push(node as unknown as BaseNode)
        if (name.includes('ErrorBoundary')) hasErrorBoundary = true
      },
      'Program:exit': () => {
        if (providerNodes.length > 0 && !hasErrorBoundary)
          for (const n of providerNodes) context.report({ messageId: 'missingErrorBoundary', node: n })
      }
    }
  },
  meta: {
    messages: {
      missingErrorBoundary:
        '<SpacetimeDBProvider> without an error boundary. Wrap with an ErrorBoundary to handle realtime data errors gracefully.'
    },
    type: 'suggestion' as const
  }
}

const writeCrudFactories = new Set(['crud'])

const getOptionsObject = (
  node: CallNode
): (BaseNode & { properties: (BaseNode & { key: BaseNode; value: BaseNode })[] }) | undefined => {
  const argIdx = node.arguments.length >= 3 ? 2 : -1
  if (argIdx < 0) return
  const arg = node.arguments[argIdx]
  if (arg?.type !== 'ObjectExpression') return
  return arg as BaseNode & { properties: (BaseNode & { key: BaseNode; value: BaseNode })[] }
}

const hasProperty = (obj: BaseNode & { properties: (BaseNode & { key: BaseNode })[] }, name: string): boolean => {
  for (const p of obj.properties) if (p.type === 'Property' && getIdentName(p.key) === name) return true
  return false
}

/** ESLint rule to require rateLimit option on write CRUD factories. */
const requireRateLimit = {
  create: (context: EslintContext) => ({
    CallExpression: (node: CallNode) => {
      const callee = getIdentName(node.callee)
      if (!(callee && writeCrudFactories.has(callee))) return
      const opts = getOptionsObject(node)
      if (opts && hasProperty(opts, 'rateLimit')) return
      context.report({ data: { factory: callee }, messageId: 'missingRateLimit', node })
    }
  }),
  meta: {
    messages: {
      missingRateLimit:
        '{{factory}}() without rateLimit. Add rateLimit: { max, window } to prevent abuse on write endpoints.'
    },
    type: 'suggestion' as const
  }
}

const getHandlerBody = (node: CallNode): BaseNode[] | undefined => {
  if (node.arguments.length === 0) return
  const [arg] = node.arguments
  if (arg?.type !== 'ObjectExpression') return
  const obj = arg as BaseNode & { properties: (BaseNode & { key: BaseNode; value: BaseNode })[] }
  for (const p of obj.properties)
    if (p.type === 'Property' && getIdentName(p.key) === 'handler') {
      const fn = p.value
      if (fn.body?.type === 'BlockStatement' && fn.body.body) return fn.body.body
    }
}

/** ESLint rule to require auth checks in mutation handlers. */
const noUnprotectedMutation = {
  create: (context: EslintContext) => {
    if (context.filename.includes('_generated') || context.filename.includes('.test.')) return {}
    return {
      CallExpression: (node: CallNode) => {
        if (!isIdent(node.callee, 'm')) return
        const handlerBody = getHandlerBody(node)
        if (!handlerBody) return
        if (bodyContainsIdent(handlerBody, 'getAuthUserId') || bodyContainsIdent(handlerBody, 'requireAuth')) return
        context.report({ messageId: 'unprotectedMutation', node })
      }
    }
  },
  meta: {
    messages: {
      unprotectedMutation:
        'm() handler without auth check. Call getAuthUserId() or add a comment explaining why auth is not needed.'
    },
    type: 'suggestion' as const
  }
}

/** ESLint rule to require .max() on cvFile/cvFiles in schema. */
const noUnlimitedFileSize = {
  create: (context: EslintContext) => {
    const content = findSchemaContent(context.cwd)
    if (!content) return {}
    const fileCallPattern = /cvFiles?\(\)/gu
    let warned = false
    return {
      Program: (node: BaseNode) => {
        if (warned) return
        let match = fileCallPattern.exec(content)
        while (match) {
          const after = content.slice(match.index + match[0].length, match.index + match[0].length + 50)
          if (!after.startsWith('.max(')) {
            warned = true
            context.report({
              data: { call: match[0] },
              messageId: 'unlimitedFileSize',
              node
            })
            return
          }
          match = fileCallPattern.exec(content)
        }
      }
    }
  },
  meta: {
    messages: {
      unlimitedFileSize: '{{call}} without .max() in schema. Add a size limit to prevent unbounded file uploads.'
    },
    type: 'suggestion' as const
  }
}

/** ESLint rule to require specific field names in search configuration. */
const noEmptySearchConfig = {
  create: (context: EslintContext) => ({
    CallExpression: (node: CallNode) => {
      const callee = getIdentName(node.callee)
      if (!(callee && crudFactories.has(callee))) return
      const opts = getOptionsObject(node)
      if (!opts) return
      for (const p of opts.properties)
        if (p.type === 'Property' && getIdentName(p.key) === 'search') {
          const val = p.value
          if (val.type === 'Literal' && val.value === true) return context.report({ messageId: 'searchTrue', node: val })
          if (val.type === 'ObjectExpression') {
            const obj = val as BaseNode & { properties: BaseNode[] }
            if (obj.properties.length === 0) return context.report({ messageId: 'searchEmpty', node: val })
          }
        }
    }
  }),
  meta: {
    messages: {
      searchEmpty:
        "search: {} is ambiguous. Specify the field to search: search: 'fieldName' or search: { field: 'fieldName' }.",
      searchTrue:
        "search: true is ambiguous. Specify the field to search: search: 'fieldName' or search: { field: 'fieldName' }."
    },
    type: 'problem' as const
  }
}

/** Map of all ESLint rules provided by the noboil-stdb plugin. */
const rules = {
  'api-casing': apiCasing,
  'consistent-crud-naming': consistentCrudNaming,
  'discovery-check': discoveryCheck,
  'form-field-exists': formFieldExists,
  'form-field-kind': formFieldKind,
  'no-duplicate-crud': noDuplicateCrud,
  'no-empty-search-config': noEmptySearchConfig,
  'no-raw-fetch-in-server-component': noRawFetchInServerComponent,
  'no-unlimited-file-size': noUnlimitedFileSize,
  'no-unprotected-mutation': noUnprotectedMutation,
  'no-unsafe-api-cast': noUnsafeApiCast,
  'prefer-useList': preferUseList,
  'prefer-useOrgQuery': preferUseOrgQuery,
  'require-connection': requireConnection,
  'require-error-boundary': requireErrorBoundary,
  'require-rate-limit': requireRateLimit
}

/** ESLint plugin object containing all noboil-stdb rules. */
const plugin = { rules }

/** Recommended ESLint configuration for noboil-stdb projects. */
const recommended = {
  files: ['**/*.ts', '**/*.tsx'],
  plugins: {
    'noboil-stdb': plugin
  },
  rules: {
    'noboil-stdb/api-casing': 'error' as const,
    'noboil-stdb/consistent-crud-naming': 'error' as const,
    'noboil-stdb/discovery-check': 'warn' as const,
    'noboil-stdb/form-field-exists': 'error' as const,
    'noboil-stdb/form-field-kind': 'warn' as const,
    'noboil-stdb/no-duplicate-crud': 'error' as const,
    'noboil-stdb/no-empty-search-config': 'error' as const,
    'noboil-stdb/no-raw-fetch-in-server-component': 'warn' as const,
    'noboil-stdb/no-unlimited-file-size': 'warn' as const,
    'noboil-stdb/no-unprotected-mutation': 'warn' as const,
    'noboil-stdb/no-unsafe-api-cast': 'warn' as const,
    'noboil-stdb/prefer-useList': 'warn' as const,
    'noboil-stdb/prefer-useOrgQuery': 'warn' as const,
    'noboil-stdb/require-connection': 'error' as const,
    'noboil-stdb/require-error-boundary': 'warn' as const,
    'noboil-stdb/require-rate-limit': 'warn' as const
  }
}

export { plugin, recommended, rules }

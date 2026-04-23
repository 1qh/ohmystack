/* oxlint-disable eslint/complexity, max-depth */
/* eslint-disable complexity, max-depth */
interface CreateSchemaUtilsOptions {
  baseTables?: (content: string) => SchemaTable[]
  schemaFactoryMap?: Record<string, string>
  wrapperFactories: string[]
}
interface FactoryCall {
  factory: string
  file: string
  options: string
  table: string
}
interface SchemaField {
  field: string
  type: string
}
interface SchemaTable {
  factory: string
  fields: SchemaField[]
  table: string
}
const childSchemaPat = /child\(\{[^}]*schema\s*:\s*object\(\{/gu
const childNamePat = /(?<cname>\w+)\s*:\s*child\(/u
const childValidPat = /child\(\{[^}]*foreignKey[^}]*parent[^}]*schema/u
const objPropPat = /(?<pname>\w+)\s*:\s*object\(\{/gu
const fieldLinePat = /^(?<fname>\w+)\s*:\s*(?<ftype>.+?)\s*,?$/u
const trailingCommaPat = /,$/u
const parenContentPat = /\([^)]*\)/gu
const braceContentPat = /\{[^}]*\}/gu
const schemaFactoryMapBase: Record<string, string> = {
  child: 'childCrud',
  makeBase: 'cacheCrud',
  makeOrgScoped: 'orgCrud',
  makeOwned: 'crud',
  makeSingleton: 'singletonCrud'
}
const CRUD_BASE = ['create', 'update', 'rm']
const CRUD_PUB = ['pub.list', 'pub.read']
const ORG_CRUD_BASE = ['list', 'read', 'create', 'update', 'rm']
const ORG_ACL = ['addEditor', 'removeEditor', 'setEditors', 'editors']
const CHILD_BASE = ['list', 'create', 'update', 'rm']
const CACHE_BASE = ['get', 'all', 'list', 'create', 'update', 'rm', 'invalidate', 'purge', 'load', 'refresh']
const SINGLETON_BASE = ['get', 'upsert']
const hasOption = (opts: string, key: string): boolean => opts.includes(key)
const parseObjectFields = (content: string, startPos: number): SchemaField[] => {
  const fields: SchemaField[] = []
  let depth = 1
  let pos = startPos
  while (pos < content.length && depth > 0) {
    const c = content[pos]
    if (c === '(' || c === '{' || c === '[') depth += 1
    else if (c === ')' || c === '}' || c === ']') depth -= 1
    pos += 1
  }
  const block = content.slice(startPos, pos - 1)
  for (const line of block.split('\n')) {
    const trimmed = line.trim()
    if (!(trimmed.length === 0 || trimmed.startsWith('//'))) {
      const m = fieldLinePat.exec(trimmed)
      if (m?.groups) {
        const { fname: field, ftype: rawType } = m.groups
        if (field && rawType) {
          const typeStr = rawType
            .replace(trailingCommaPat, '')
            .trim()
            .replace(parenContentPat, '()')
            .replace(braceContentPat, '{}')
          fields.push({ field, type: typeStr })
        }
      }
    }
  }
  return fields
}
const createSchemaUtils = ({ baseTables, schemaFactoryMap, wrapperFactories }: CreateSchemaUtilsOptions) => {
  const mergedFactoryMap = { ...schemaFactoryMapBase, ...schemaFactoryMap }
  const extractSchemaFields = (content: string): SchemaTable[] => {
    const tables = baseTables ? baseTables(content) : []
    for (const factory of [...wrapperFactories, 'child']) {
      const pat = factory === 'child' ? new RegExp(childSchemaPat.source, 'gu') : new RegExp(`${factory}\\(\\{`, 'gu')
      for (;;) {
        const fm = pat.exec(content)
        if (!fm) break
        const startBlock = fm.index + fm[0].length
        if (factory === 'child') {
          const lookback = Math.max(0, fm.index - 50)
          if (childValidPat.test(content.slice(fm.index))) {
            const tableLine = childNamePat.exec(content.slice(lookback, fm.index + 10))
            const tableName = tableLine?.groups?.cname ?? 'unknown'
            const fields = parseObjectFields(content, startBlock)
            tables.push({ factory: mergedFactoryMap[factory] ?? factory, fields, table: tableName })
          }
        } else {
          let depth = 1
          let pos = startBlock
          while (pos < content.length && depth > 0) {
            if (content[pos] === '{') depth += 1
            else if (content[pos] === '}') depth -= 1
            pos += 1
          }
          const block = content.slice(startBlock, pos - 1)
          const pp = new RegExp(objPropPat.source, 'gu')
          for (;;) {
            const pm = pp.exec(block)
            if (!pm) break
            const tableName = pm.groups?.pname ?? 'unknown'
            const objStart = block.indexOf('{', pm.index + pm[0].length - 1) + 1
            const fields = parseObjectFields(block, objStart)
            tables.push({ factory: mergedFactoryMap[factory] ?? factory, fields, table: tableName })
          }
        }
      }
    }
    return tables
  }
  const endpointsForFactory = (call: FactoryCall): string[] => {
    const { factory, options: opts } = call
    if (factory === 'singletonCrud') return [...SINGLETON_BASE]
    if (factory === 'cacheCrud') return [...CACHE_BASE]
    if (factory === 'childCrud') {
      const eps = [...CHILD_BASE]
      if (hasOption(opts, 'pub')) {
        eps.push('pub.list')
        eps.push('pub.get')
      }
      return eps
    }
    if (factory === 'orgCrud') {
      const eps = [...ORG_CRUD_BASE]
      if (hasOption(opts, 'acl')) eps.push(...ORG_ACL)
      if (hasOption(opts, 'softDelete')) eps.push('restore')
      if (hasOption(opts, 'search')) eps.push('search')
      return eps
    }
    const eps = [...CRUD_BASE, ...CRUD_PUB]
    if (hasOption(opts, 'search')) eps.push('pub.search')
    if (hasOption(opts, 'softDelete')) eps.push('restore')
    return eps
  }
  return { endpointsForFactory, extractSchemaFields }
}
export type { CreateSchemaUtilsOptions, FactoryCall, SchemaField, SchemaTable }
export {
  CACHE_BASE,
  CHILD_BASE,
  createSchemaUtils,
  CRUD_BASE,
  CRUD_PUB,
  hasOption,
  ORG_ACL,
  ORG_CRUD_BASE,
  parseObjectFields,
  SINGLETON_BASE
}

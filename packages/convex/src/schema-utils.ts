/* oxlint-disable eslint/max-statements, eslint/complexity, max-depth */
/* eslint-disable max-depth */
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

const wrapperFactories = ['makeOwned', 'makeOrgScoped', 'makeSingleton', 'makeBase'],
  childSchemaPat = /child\(\{[^}]*schema\s*:\s*object\(\{/gu,
  childNamePat = /(?<cname>\w+)\s*:\s*child\(/u,
  childValidPat = /child\(\{[^}]*foreignKey[^}]*parent[^}]*schema/u,
  objPropPat = /(?<pname>\w+)\s*:\s*object\(\{/gu,
  fieldLinePat = /^(?<fname>\w+)\s*:\s*(?<ftype>.+?)\s*,?$/u,
  trailingCommaPat = /,$/u,
  parenContentPat = /\([^)]*\)/gu,
  braceContentPat = /\{[^}]*\}/gu,
  schemaFactoryMap: Record<string, string> = {
    child: 'childCrud',
    makeBase: 'cacheCrud',
    makeOrgScoped: 'orgCrud',
    makeOwned: 'crud',
    makeSingleton: 'singletonCrud'
  },
  CRUD_BASE = ['create', 'update', 'rm', 'bulkCreate', 'bulkRm', 'bulkUpdate'],
  CRUD_PUB = ['pub.list', 'pub.read'],
  ORG_CRUD_BASE = ['list', 'read', 'create', 'update', 'rm', 'bulkCreate', 'bulkRm', 'bulkUpdate'],
  ORG_ACL = ['addEditor', 'removeEditor', 'setEditors', 'editors'],
  CHILD_BASE = ['list', 'create', 'update', 'rm', 'bulkCreate', 'bulkRm', 'bulkUpdate'],
  CACHE_BASE = ['get', 'all', 'list', 'create', 'update', 'rm', 'invalidate', 'purge', 'load', 'refresh'],
  SINGLETON_BASE = ['get', 'upsert'],
  hasOption = (opts: string, key: string): boolean => opts.includes(key),
  parseObjectFields = (content: string, startPos: number): SchemaField[] => {
    const fields: SchemaField[] = []
    let depth = 1,
      pos = startPos
    while (pos < content.length && depth > 0) {
      if (content[pos] === '(' || content[pos] === '{' || content[pos] === '[') depth += 1
      else if (content[pos] === ')' || content[pos] === '}' || content[pos] === ']') depth -= 1
      pos += 1
    }
    const block = content.slice(startPos, pos - 1)
    for (const line of block.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('//')) {
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
  },
  extractSchemaFields = (content: string): SchemaTable[] => {
    const tables: SchemaTable[] = [],
      allFactories = [...wrapperFactories, 'child']
    for (const factory of allFactories) {
      const pat = factory === 'child' ? new RegExp(childSchemaPat.source, 'gu') : new RegExp(`${factory}\\(\\{`, 'gu')
      let fm = pat.exec(content)
      while (fm !== null) {
        const startBlock = fm.index + fm[0].length
        if (factory === 'child') {
          const lookback = Math.max(0, fm.index - 50)
          if (childValidPat.test(content.slice(fm.index))) {
            const tableLine = childNamePat.exec(content.slice(lookback, fm.index + 10)),
              tableName = tableLine?.groups?.cname ?? 'unknown',
              fields = parseObjectFields(content, startBlock)
            tables.push({ factory: schemaFactoryMap[factory] ?? factory, fields, table: tableName })
          }
        } else {
          let depth = 1,
            pos = startBlock
          while (pos < content.length && depth > 0) {
            if (content[pos] === '{') depth += 1
            else if (content[pos] === '}') depth -= 1
            pos += 1
          }
          const block = content.slice(startBlock, pos - 1),
            pp = new RegExp(objPropPat.source, 'gu')
          let pm = pp.exec(block)
          while (pm !== null) {
            const tableName = pm.groups?.pname ?? 'unknown',
              objStart = block.indexOf('{', pm.index + pm[0].length - 1) + 1,
              fields = parseObjectFields(block, objStart)
            tables.push({ factory: schemaFactoryMap[factory] ?? factory, fields, table: tableName })
            pm = pp.exec(block)
          }
        }
        fm = pat.exec(content)
      }
    }
    return tables
  },
  endpointsForFactory = (call: FactoryCall): string[] => {
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

export {
  CACHE_BASE,
  CHILD_BASE,
  CRUD_BASE,
  CRUD_PUB,
  endpointsForFactory,
  extractSchemaFields,
  hasOption,
  ORG_ACL,
  ORG_CRUD_BASE,
  parseObjectFields,
  SINGLETON_BASE,
  wrapperFactories
}
export type { FactoryCall, SchemaField, SchemaTable }

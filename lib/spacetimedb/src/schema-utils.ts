import type { FactoryCall, SchemaField, SchemaTable } from '@a/shared/schema-utils'
import {
  CACHE_BASE,
  CHILD_BASE,
  createCommonSchemaUtils,
  CRUD_BASE,
  CRUD_PUB,
  endpointsForFactory,
  hasOption,
  ORG_ACL,
  ORG_CRUD_BASE,
  parseObjectFields,
  SINGLETON_BASE
} from '@a/shared/schema-utils'
const wrapperFactories = ['makeOwned', 'makeOrgScoped', 'makeSingleton', 'makeBase', 'defineTables'],
  tableCallPat = /(?<pname>\w+)\s*:\s*t\.table\(\{/gu,
  schemaFactoryMap: Record<string, string> = {
    child: 'childCrud',
    defineTables: 'spacetimeCrud',
    makeBase: 'cacheCrud',
    makeOrgScoped: 'orgCrud',
    makeOwned: 'crud',
    makeSingleton: 'singletonCrud'
  },
  { extractFactoryTables } = createCommonSchemaUtils({
    factoryMap: schemaFactoryMap,
    wrapperFactories: ['makeOwned', 'makeOrgScoped', 'makeSingleton', 'makeBase']
  }),
  extractSpacetimeTables = (content: string): SchemaTable[] => {
    const tables: SchemaTable[] = [],
      p = new RegExp(tableCallPat.source, 'gu')
    let m = p.exec(content)
    /** biome-ignore lint/nursery/noUnnecessaryConditions: regex exec returns null when exhausted */
    while (m) {
      const tableName = m.groups?.pname ?? 'unknown',
        startBlock = m.index + m[0].length,
        fields = parseObjectFields(content, startBlock)
      tables.push({ factory: 'spacetimeCrud', fields, table: tableName })
      m = p.exec(content)
    }
    return tables
  },
  extractSchemaFields = (content: string): SchemaTable[] => [
    ...extractSpacetimeTables(content),
    ...extractFactoryTables(content)
  ]
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

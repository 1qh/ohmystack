// biome-ignore-all lint/nursery/noUnnecessaryConditions: type narrowing
/* eslint-disable max-depth */
/* oxlint-disable eslint/max-statements, eslint/complexity */
import {
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
} from '@a/shared/schema-utils'
import type { FactoryCall, SchemaField, SchemaTable } from '@a/shared/schema-utils'

const tableCallPat = /(?<pname>\w+)\s*:\s*t\.table\(\{/gu,
  wrapperFactories = ['makeOwned', 'makeOrgScoped', 'makeSingleton', 'makeBase', 'defineTables'],
  extractSpacetimeTables = (content: string): SchemaTable[] => {
    const tables: SchemaTable[] = [],
      p = new RegExp(tableCallPat.source, 'gu')
    let m = p.exec(content)
    while (m) {
      const tableName = m.groups?.pname ?? 'unknown',
        startBlock = m.index + m[0].length,
        fields = parseObjectFields(content, startBlock)
      tables.push({ factory: 'spacetimeCrud', fields, table: tableName })
      m = p.exec(content)
    }
    return tables
  },
  { endpointsForFactory, extractSchemaFields } = createSchemaUtils({
    baseTables: extractSpacetimeTables,
    schemaFactoryMap: { defineTables: 'spacetimeCrud' },
    wrapperFactories
  })

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

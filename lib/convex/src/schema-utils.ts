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
const wrapperFactories = ['makeOwned', 'makeOrgScoped', 'makeSingleton', 'makeBase'],
  schemaFactoryMap: Record<string, string> = {
    child: 'childCrud',
    makeBase: 'cacheCrud',
    makeOrgScoped: 'orgCrud',
    makeOwned: 'crud',
    makeSingleton: 'singletonCrud'
  },
  { extractFactoryTables } = createCommonSchemaUtils({
    factoryMap: schemaFactoryMap,
    wrapperFactories
  }),
  extractSchemaFields = (content: string): SchemaTable[] => extractFactoryTables(content)
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

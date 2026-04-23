/* oxlint-disable eslint/complexity, max-depth */
import type { FactoryCall, SchemaField, SchemaTable } from '../shared/schema-utils'
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
} from '../shared/schema-utils'
const wrapperFactories = ['makeOwned', 'makeOrgScoped', 'makeSingleton', 'makeBase']
const { endpointsForFactory, extractSchemaFields } = createSchemaUtils({ wrapperFactories })
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

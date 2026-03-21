/* oxlint-disable eslint/max-statements, eslint/complexity, max-depth */
/* eslint-disable max-depth */
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

const wrapperFactories = ['makeOwned', 'makeOrgScoped', 'makeSingleton', 'makeBase'],
  { endpointsForFactory, extractSchemaFields } = createSchemaUtils({ wrapperFactories })

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

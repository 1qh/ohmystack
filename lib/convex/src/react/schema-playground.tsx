'use client'
import type { PlaygroundProps as SharedPlaygroundProps } from '@a/shared/react/schema-playground'
import { createSchemaPlayground, DEFAULT_SCHEMA } from '@a/shared/react/schema-playground'
import { endpointsForFactory, extractSchemaFields } from '../schema-utils'
type PlaygroundProps = Omit<SharedPlaygroundProps, 'metricClassName'>
const InternalSchemaPlayground = createSchemaPlayground({
    extractSchemaFields,
    getEndpoints: table => endpointsForFactory({ factory: table.factory, file: '', options: '', table: table.table }),
    labels: {
      emptyWithInput: 'No tables detected. Use makeOwned, makeOrgScoped, etc.',
      emptyWithoutInput: 'Enter a schema to preview generated endpoints',
      metricLabel: 'endpoint',
      previewTitle: 'Generated Preview'
    }
  }),
  SchemaPlayground = (props: PlaygroundProps) => <InternalSchemaPlayground {...props} />
export default SchemaPlayground
export { DEFAULT_SCHEMA }
export type { PlaygroundProps }

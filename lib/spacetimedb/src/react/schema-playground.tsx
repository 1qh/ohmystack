'use client'
import type { PlaygroundProps as SharedPlaygroundProps } from '@a/shared/react/schema-playground'
import { createSchemaPlayground, DEFAULT_SCHEMA } from '@a/shared/react/schema-playground'
import { endpointsForFactory, extractSchemaFields } from '../schema-utils'
interface PlaygroundProps extends SharedPlaygroundProps {
  reducerClassName?: string
}
const InternalSchemaPlayground = createSchemaPlayground({
    extractSchemaFields,
    getEndpoints: table => endpointsForFactory({ factory: table.factory, file: '', options: '', table: table.table }),
    labels: {
      emptyWithInput: 'No tables detected. Use defineTables, makeOwned, makeOrgScoped, etc.',
      emptyWithoutInput: 'Enter a schema to preview generated tables and reducers',
      metricLabel: 'reducer',
      previewTitle: 'SpacetimeDB Preview'
    }
  }),
  SchemaPlayground = ({ reducerClassName, ...props }: PlaygroundProps) => (
    <InternalSchemaPlayground {...props} metricClassName={reducerClassName ?? props.endpointClassName} />
  )
export default SchemaPlayground
export { DEFAULT_SCHEMA }
export type { PlaygroundProps }

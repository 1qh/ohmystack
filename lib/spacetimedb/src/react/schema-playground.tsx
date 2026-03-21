/* oxlint-disable eslint/complexity */
'use client'
import SharedSchemaPlayground from '@a/shared/react/schema-playground'
import type { ComponentProps } from 'react'
import { endpointsForFactory, extractSchemaFields } from '../schema-utils'

interface PlaygroundProps
  extends Omit<ComponentProps<typeof SharedSchemaPlayground>, 'endpointClassName' | 'endpointsForFactory' | 'extractSchemaFields' | 'labels'> {
  endpointClassName?: string
  reducerClassName?: string
}

const SchemaPlayground = ({ endpointClassName, reducerClassName, ...props }: PlaygroundProps) => (
  <SharedSchemaPlayground
    {...props}
    endpointClassName={reducerClassName ?? endpointClassName}
    endpointsForFactory={endpointsForFactory}
    extractSchemaFields={extractSchemaFields}
    labels={{
      generatedCountNoun: 'reducer',
      generatedEmptyWithSchema: 'No tables detected. Use defineTables, makeOwned, makeOrgScoped, etc.',
      generatedEmptyWithoutSchema: 'Enter a schema to preview generated tables and reducers',
      generatedTitle: 'SpacetimeDB Preview',
      tableItemsLabel: 'Reducers'
    }}
  />
)

export default SchemaPlayground
export type { PlaygroundProps }

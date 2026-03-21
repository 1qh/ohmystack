/* oxlint-disable eslint/complexity */
'use client'
import SharedSchemaPlayground from '@a/shared/react/schema-playground'
import type { ComponentProps } from 'react'
import { endpointsForFactory, extractSchemaFields } from '../schema-utils'

interface PlaygroundProps extends Omit<ComponentProps<typeof SharedSchemaPlayground>, 'endpointsForFactory' | 'extractSchemaFields' | 'labels'> {}

const SchemaPlayground = (props: PlaygroundProps) => (
  <SharedSchemaPlayground
    {...props}
    endpointsForFactory={endpointsForFactory}
    extractSchemaFields={extractSchemaFields}
    labels={{
      generatedCountNoun: 'endpoint',
      generatedEmptyWithSchema: 'No tables detected. Use makeOwned, makeOrgScoped, etc.',
      generatedEmptyWithoutSchema: 'Enter a schema to preview generated endpoints',
      generatedTitle: 'Generated Preview',
      tableItemsLabel: 'Endpoints'
    }}
  />
)

export default SchemaPlayground
export type { PlaygroundProps }

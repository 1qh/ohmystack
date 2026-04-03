/* oxlint-disable eslint/complexity */
'use client'
import type { ComponentProps } from 'react'
import SharedSchemaPlayground from '@a/shared/react/schema-playground'
import { endpointsForFactory, extractSchemaFields } from '../schema-utils'
type PlaygroundProps = Omit<
  ComponentProps<typeof SharedSchemaPlayground>,
  'endpointsForFactory' | 'extractSchemaFields' | 'labels'
>
const labels: ComponentProps<typeof SharedSchemaPlayground>['labels'] = {
  generatedCountNoun: 'endpoint',
  generatedEmptyWithSchema: 'No tables detected. Use makeOwned, makeOrgScoped, etc.',
  generatedEmptyWithoutSchema: 'Enter a schema to preview generated endpoints',
  generatedTitle: 'Generated Preview',
  tableItemsLabel: 'Endpoints'
}
const SchemaPlayground = (props: PlaygroundProps) => (
  <SharedSchemaPlayground
    {...props}
    endpointsForFactory={endpointsForFactory}
    extractSchemaFields={extractSchemaFields}
    labels={labels}
  />
)
export default SchemaPlayground
export type { PlaygroundProps }

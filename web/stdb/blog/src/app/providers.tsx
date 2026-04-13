'use client'
import type { ReactNode } from 'react'
import { tables } from '@a/be-spacetimedb/spacetimedb'
import SpacetimeProvider from '@a/fe/spacetimedb-provider'
import { DevtoolsAutoMount, FileProvider } from '@noboil/spacetimedb/react'
import { useTable } from 'spacetimedb/react'
const FileSubscription = ({ children }: { children: ReactNode }) => {
  const [files] = useTable(tables.file)
  return <FileProvider files={files}>{children}</FileProvider>
}
const SpacetimeWrapper = ({ children }: { children: ReactNode }) => (
  <SpacetimeProvider fileApi>
    <FileSubscription>{children}</FileSubscription>
    <DevtoolsAutoMount />
  </SpacetimeProvider>
)
export { SpacetimeWrapper }

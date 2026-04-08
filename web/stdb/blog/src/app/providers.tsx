'use client'
import type { ReactNode } from 'react'
import SpacetimeProvider from '@a/fe/spacetimedb-provider'
const renderSpacetimeProvider = (inner: ReactNode): ReactNode => <SpacetimeProvider fileApi>{inner}</SpacetimeProvider>
export { renderSpacetimeProvider }

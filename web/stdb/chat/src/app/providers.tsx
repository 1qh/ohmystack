'use client'
import type { ReactNode } from 'react'
import SpacetimeProvider from '@a/fe/spacetimedb-provider'
const SpacetimeWrapper = ({ children }: { children: ReactNode }) => <SpacetimeProvider>{children}</SpacetimeProvider>
export { SpacetimeWrapper }

'use client'
import type { ReactNode } from 'react'
import SpacetimeProvider from '@a/fe/spacetimedb-provider'
import { Toaster } from '@a/ui/sonner'
import { ErrorBoundary, OfflineIndicator } from '@noboil/spacetimedb/components'
import { Devtools } from '@noboil/spacetimedb/react'
import { ThemeProvider } from 'next-themes'
import { Suspense } from 'react'
const Providers = ({ children }: { children: ReactNode }) => (
  <Suspense>
    <ErrorBoundary className='mx-auto max-w-4xl'>
      <SpacetimeProvider noAuth>
        <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
          {children}
        </ThemeProvider>
        <Devtools position='bottom-right' />
        <OfflineIndicator />
      </SpacetimeProvider>
      <Toaster duration={1000} />
    </ErrorBoundary>
  </Suspense>
)
export default Providers

// oxlint-disable no-unassigned-import
import '@a/ui/globals.css'
import type { ReactNode } from 'react'

import SpacetimeProvider from '@a/fe/spacetimedb-provider'
import { Toaster } from '@a/ui/sonner'
import { ErrorBoundary } from '@noboil/spacetimedb/components'
import { BetterspaceDevtools } from '@noboil/spacetimedb/react'
import { ThemeProvider } from 'next-themes'
import { Suspense } from 'react'

const Layout = ({ children }: { children: ReactNode }) => (
  <html lang='en' suppressHydrationWarning>
    <body className='min-h-screen bg-background font-sans tracking-tight text-foreground antialiased'>
      <Suspense>
        <ErrorBoundary className='mx-auto max-w-4xl'>
          <SpacetimeProvider noAuth>
            <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
              {children}
            </ThemeProvider>
            <BetterspaceDevtools position='bottom-right' />
          </SpacetimeProvider>
          <Toaster duration={1000} />
        </ErrorBoundary>
      </Suspense>
    </body>
  </html>
)

export default Layout

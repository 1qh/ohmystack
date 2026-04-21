'use client'
import type { ReactNode } from 'react'
import ConvexProvider from '@a/fe/convex-provider'
import { Toaster } from '@a/ui/sonner'
import { ThemeProvider } from 'next-themes'
import { ErrorBoundary, OfflineIndicator } from 'noboil/convex/components'
import { Suspense } from 'react'
const Providers = ({ children }: { children: ReactNode }) => (
  <Suspense>
    <ErrorBoundary>
      <ConvexProvider noAuth>
        <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
          {children}
        </ThemeProvider>
        <OfflineIndicator />
      </ConvexProvider>
      <Toaster duration={1000} />
    </ErrorBoundary>
  </Suspense>
)
export default Providers

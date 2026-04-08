'use client'
import type { ReactNode } from 'react'
import ConvexProvider from '@a/fe/convex-provider'
import { Toaster } from '@a/ui/sonner'
import { ConvexErrorBoundary, OfflineIndicator } from '@noboil/convex/components'
import { ThemeProvider } from 'next-themes'
import { Suspense } from 'react'
const Providers = ({ children }: { children: ReactNode }) => (
  <Suspense>
    <ConvexErrorBoundary>
      <ConvexProvider noAuth>
        <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
          {children}
        </ThemeProvider>
        <OfflineIndicator />
      </ConvexProvider>
      <Toaster duration={1000} />
    </ConvexErrorBoundary>
  </Suspense>
)
export default Providers

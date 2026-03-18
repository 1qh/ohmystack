// oxlint-disable-next-line import/no-unassigned-import
import '@a/ui/globals.css'
import type { ReactNode } from 'react'

import ConvexProvider from '@a/fe/convex-provider'
import { Toaster } from '@a/ui/sonner'
import { ConvexErrorBoundary } from '@noboil/convex/components'
import { ThemeProvider } from 'next-themes'
import { Suspense } from 'react'

const Layout = ({ children }: { children: ReactNode }) => (
  <html lang='en' suppressHydrationWarning>
    <body className='min-h-screen bg-background font-sans tracking-tight text-foreground antialiased'>
      <Suspense>
        <ConvexErrorBoundary>
          <ConvexProvider noAuth>
            <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
              {children}
            </ThemeProvider>
          </ConvexProvider>
          <Toaster duration={1000} />
        </ConvexErrorBoundary>
      </Suspense>
    </body>
  </html>
)

export default Layout

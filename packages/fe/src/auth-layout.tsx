// oxlint-disable-next-line import/no-unassigned-import
import '@a/ui/globals.css'
import type { ReactNode } from 'react'

import { Toaster } from '@a/ui/sonner'
import { ConvexAuthNextjsServerProvider as AuthProvider } from '@convex-dev/auth/nextjs/server'
import { OfflineIndicator } from '@ohmystack/convex/components'
import { ThemeProvider } from 'next-themes'
import { Suspense } from 'react'

import ErrorBoundary from './error-boundary'

interface AuthLayoutProps {
  children: ReactNode
  convexProvider: (children: ReactNode) => ReactNode
}

const AuthLayout = ({ children, convexProvider }: AuthLayoutProps) => (
  <html lang='en' suppressHydrationWarning>
    <body className='min-h-screen bg-background font-sans tracking-tight text-foreground antialiased'>
      <Suspense>
        <ErrorBoundary>
          <AuthProvider>
            {convexProvider(
              <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
                {children}
              </ThemeProvider>
            )}
          </AuthProvider>
          <Toaster duration={1000} />
          <OfflineIndicator />
        </ErrorBoundary>
      </Suspense>
    </body>
  </html>
)

export default AuthLayout

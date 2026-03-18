// oxlint-disable-next-line import/no-unassigned-import
import '@a/ui/globals.css'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@a/ui'
import { Toaster } from '@a/ui/sonner'
import { ConvexAuthNextjsServerProvider as AuthProvider } from '@convex-dev/auth/nextjs/server'
import { OfflineIndicator } from '@noboil/convex/components'
import { ThemeProvider } from 'next-themes'
import { Suspense } from 'react'

import ErrorBoundary from './error-boundary'

interface AuthLayoutProps {
  bodyClassName?: string
  bodyProps?: Omit<ComponentProps<'body'>, 'children' | 'className'>
  children: ReactNode
  convexProvider: (children: ReactNode) => ReactNode
  htmlProps?: Omit<ComponentProps<'html'>, 'children' | 'lang' | 'suppressHydrationWarning'>
  offlineIndicatorProps?: ComponentProps<typeof OfflineIndicator>
  themeProviderProps?: Omit<ComponentProps<typeof ThemeProvider>, 'children'>
  toasterProps?: ComponentProps<typeof Toaster>
}

const AuthLayout = ({
  bodyClassName,
  bodyProps,
  children,
  convexProvider,
  htmlProps,
  offlineIndicatorProps,
  themeProviderProps,
  toasterProps
}: AuthLayoutProps) => (
  <html {...htmlProps} lang='en' suppressHydrationWarning>
    <body
      {...bodyProps}
      className={cn('min-h-screen bg-background font-sans tracking-tight text-foreground antialiased', bodyClassName)}>
      <Suspense>
        <ErrorBoundary>
          <AuthProvider>
            {convexProvider(
              <ThemeProvider {...themeProviderProps} attribute='class' defaultTheme='system' enableSystem>
                {children}
              </ThemeProvider>
            )}
          </AuthProvider>
          <Toaster {...toasterProps} duration={1000} />
          <OfflineIndicator {...offlineIndicatorProps} />
        </ErrorBoundary>
      </Suspense>
    </body>
  </html>
)

export default AuthLayout

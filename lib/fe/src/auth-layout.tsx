import '@a/ui/globals.css'
import './overrides.css'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@a/ui'
import { Toaster } from '@a/ui/sonner'
import { ConvexAuthNextjsServerProvider as AuthProvider } from '@convex-dev/auth/nextjs/server'
import { ThemeProvider } from 'next-themes'
import { OfflineIndicator } from 'noboil/convex/components'
import { Suspense } from 'react'
import ErrorBoundary from './error-boundary'
interface AuthLayoutProps {
  bodyClassName?: string
  bodyProps?: Omit<ComponentProps<'body'>, 'children' | 'className'>
  children: ReactNode
  ConvexProvider: (props: { children: ReactNode }) => ReactNode
  htmlProps?: Omit<ComponentProps<'html'>, 'children' | 'lang' | 'suppressHydrationWarning'>
  offlineIndicatorProps?: ComponentProps<typeof OfflineIndicator>
  themeProviderProps?: Omit<ComponentProps<typeof ThemeProvider>, 'children'>
  toasterProps?: ComponentProps<typeof Toaster>
}
const AuthLayout = ({
  bodyClassName,
  bodyProps,
  children,
  ConvexProvider,
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
            <ConvexProvider>
              <ThemeProvider {...themeProviderProps} attribute='class' defaultTheme='system' enableSystem>
                {children}
              </ThemeProvider>
            </ConvexProvider>
          </AuthProvider>
          <Toaster {...toasterProps} duration={1000} />
          <OfflineIndicator {...offlineIndicatorProps} />
        </ErrorBoundary>
      </Suspense>
    </body>
  </html>
)
export default AuthLayout

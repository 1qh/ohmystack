// oxlint-disable no-unassigned-import
import '@a/ui/globals.css'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@a/ui'
import { Toaster } from '@a/ui/sonner'
import { OfflineIndicator } from '@noboil/spacetimedb/components'
import { ThemeProvider } from 'next-themes'
import { Suspense } from 'react'
import LoginLayout from './login-layout'
interface AuthLayoutProps {
  bodyClassName?: string
  bodyProps?: Omit<ComponentProps<'body'>, 'children' | 'className'>
  children: ReactNode
  htmlProps?: Omit<ComponentProps<'html'>, 'children' | 'lang' | 'suppressHydrationWarning'>
  offlineIndicatorProps?: ComponentProps<typeof OfflineIndicator>
  provider: (children: ReactNode) => ReactNode
  themeProviderProps?: Omit<ComponentProps<typeof ThemeProvider>, 'children'>
  toasterProps?: ComponentProps<typeof Toaster>
}
const AuthLayout = ({
  bodyClassName,
  bodyProps,
  children,
  htmlProps,
  offlineIndicatorProps,
  provider,
  themeProviderProps,
  toasterProps
}: AuthLayoutProps) => (
  <html {...htmlProps} lang='en' suppressHydrationWarning>
    <body
      {...bodyProps}
      className={cn('min-h-screen bg-background font-sans tracking-tight text-foreground antialiased', bodyClassName)}>
      <Suspense>
        {provider(
          <ThemeProvider {...themeProviderProps} attribute='class' defaultTheme='system' enableSystem>
            {children}
            <OfflineIndicator {...offlineIndicatorProps} />
          </ThemeProvider>
        )}
        <Toaster {...toasterProps} duration={1000} />
      </Suspense>
    </body>
  </html>
)
export { LoginLayout }
export default AuthLayout

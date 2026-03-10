// oxlint-disable no-unassigned-import
import '@a/ui/globals.css'
import type { ReactNode } from 'react'

import { Toaster } from '@a/ui/sonner'
import { OfflineIndicator } from '@ohmystack/spacetimedb/components'
import { ThemeProvider } from 'next-themes'
import { Suspense } from 'react'

interface AuthLayoutProps {
  children: ReactNode
  provider: (children: ReactNode) => ReactNode
}

const LoginLayout = ({ children }: { children: ReactNode }) => (
    <div className='flex h-screen w-screen items-center justify-center'>{children}</div>
  ),
  AuthLayout = ({ children, provider }: AuthLayoutProps) => (
    <html lang='en' suppressHydrationWarning>
      <body className='min-h-screen bg-background font-sans tracking-tight text-foreground antialiased'>
        <Suspense>
          {provider(
            <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
              {children}
              <OfflineIndicator />
            </ThemeProvider>
          )}
          <Toaster duration={1000} />
        </Suspense>
      </body>
    </html>
  )

export { LoginLayout }
export default AuthLayout

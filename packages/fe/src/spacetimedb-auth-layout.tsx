// oxlint-disable no-unassigned-import
import '@a/ui/globals.css'
import type { ReactNode } from 'react'

import { Toaster } from '@a/ui/sonner'
import { OfflineIndicator } from '@noboil/spacetimedb/components'
import { ThemeProvider } from 'next-themes'
import { Suspense } from 'react'

import LoginLayout from './login-layout'

interface AuthLayoutProps {
  children: ReactNode
  provider: (children: ReactNode) => ReactNode
}

const AuthLayout = ({ children, provider }: AuthLayoutProps) => (
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

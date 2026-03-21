// oxlint-disable-next-line import/no-unassigned-import
import '@a/ui/globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server'
import AgentConvexProvider from './convex-provider'
import TestLoginProvider from './test-login-provider'
const metadata: Metadata = { title: 'Agent' },
  RootLayout = ({ children }: { children: ReactNode }) => (
    <html lang='en' suppressHydrationWarning>
      <body>
        <ConvexAuthNextjsServerProvider>
          <AgentConvexProvider>
            <TestLoginProvider>{children}</TestLoginProvider>
          </AgentConvexProvider>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  )
export { metadata }
export default RootLayout

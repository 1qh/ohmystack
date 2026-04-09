// oxlint-disable-next-line import/no-unassigned-import
import '@a/ui/globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server'
import { Providers } from './providers'
const metadata: Metadata = { title: 'Agent' }
const Layout = ({ children }: { children: ReactNode }) => (
  <html lang='en' suppressHydrationWarning>
    <body className='antialiased'>
      <ConvexAuthNextjsServerProvider>
        <Providers>{children}</Providers>
      </ConvexAuthNextjsServerProvider>
    </body>
  </html>
)
export { metadata }
export default Layout

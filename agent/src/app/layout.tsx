import '@a/ui/globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { cn } from '@a/ui'
import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server'
import { mono, sans } from './fonts'
import { Providers } from './providers'
const metadata: Metadata = { title: 'Agent' }
const Layout = ({ children }: { children: ReactNode }) => (
  <html className={cn(sans.variable, mono.variable, 'font-sans tracking-[-0.02em]')} lang='en' suppressHydrationWarning>
    <body className='min-h-screen antialiased'>
      <ConvexAuthNextjsServerProvider>
        <Providers>{children}</Providers>
      </ConvexAuthNextjsServerProvider>
    </body>
  </html>
)
export { metadata }
export default Layout

// oxlint-disable-next-line import/no-unassigned-import
import '@a/ui/globals.css'
import type { ReactNode } from 'react'
import Providers from './providers'
const Layout = ({ children }: { children: ReactNode }) => (
  <html lang='en' suppressHydrationWarning>
    <body className='min-h-screen bg-background font-sans tracking-tight text-foreground antialiased'>
      <Providers>{children}</Providers>
    </body>
  </html>
)
export default Layout

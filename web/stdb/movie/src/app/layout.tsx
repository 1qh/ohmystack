import type { Metadata } from 'next'
import '@a/ui/globals.css'
import type { ReactNode } from 'react'
import { cn } from '@a/ui'
import { mono, sans } from './fonts'
import Providers from './providers'
const metadata: Metadata = { title: 'Movie' }
const Layout = ({ children }: { children: ReactNode }) => (
  <html className={cn(sans.variable, mono.variable, 'font-sans tracking-[-0.02em]')} lang='en' suppressHydrationWarning>
    <body className='min-h-screen bg-background tracking-tight text-foreground antialiased'>
      <Providers>{children}</Providers>
    </body>
  </html>
)
export { metadata }
export default Layout

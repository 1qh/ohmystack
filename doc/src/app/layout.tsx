import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { cn } from '@a/ui'
import '../app/global.css'
import { mono, sans } from './fonts'
import Providers from './providers'
const metadata: Metadata = { title: 'Doc' }
const Layout = ({ children }: { children: ReactNode }) => (
  <html className={cn(sans.variable, mono.variable, 'font-sans tracking-[-0.02em]')} lang='en' suppressHydrationWarning>
    <body className='flex min-h-screen flex-col antialiased'>
      <Providers>{children}</Providers>
    </body>
  </html>
)
export { metadata }
export default Layout

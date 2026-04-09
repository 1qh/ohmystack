import type { Metadata } from 'next'
import type { ReactNode } from 'react'
// oxlint-disable-next-line import/no-unassigned-import
import '../app/global.css'
import Providers from './providers'
const metadata: Metadata = { title: 'Doc' }
const Layout = ({ children }: { children: ReactNode }) => (
  <html className='tracking-[-0.02em]' lang='en' suppressHydrationWarning>
    <body className='flex min-h-screen flex-col antialiased'>
      <Providers>{children}</Providers>
    </body>
  </html>
)
export { metadata }
export default Layout

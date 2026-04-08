import type { ReactNode } from 'react'
// oxlint-disable-next-line import/no-unassigned-import
import '../app/global.css'
import Providers from './providers'
const Layout = ({ children }: { children: ReactNode }) => (
  <html lang='en' suppressHydrationWarning>
    <body className='flex min-h-screen flex-col'>
      <Providers>{children}</Providers>
    </body>
  </html>
)
export default Layout

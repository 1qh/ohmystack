import type { ReactNode } from 'react'

import { RootProvider } from 'fumadocs-ui/provider/next'

import '../app/global.css'

const Layout = ({ children }: { children: ReactNode }) => (
  <html lang='en' suppressHydrationWarning>
    <body className='flex min-h-screen flex-col'>
      <RootProvider>{children}</RootProvider>
    </body>
  </html>
)

export default Layout

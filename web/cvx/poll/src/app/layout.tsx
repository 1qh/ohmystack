import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import AuthLayout from '@a/fe/convex-auth-layout'
import Logout from '@a/fe/convex-user-menu'
import { headers } from 'next/headers'
import { Devtools } from 'noboil/convex/react'
import { ConvexWrapper } from './providers'
const metadata: Metadata = { description: 'noboil poll demo (log + kv + quota factories)', title: 'Poll' }
const Layout = async ({ children }: { children: ReactNode }) => {
  const requestHeaders = await headers()
  const pathname = requestHeaders.get('x-pathname') ?? '/'
  const isLogin = pathname === '/login' || pathname.startsWith('/login/')
  return (
    <AuthLayout ConvexProvider={ConvexWrapper}>
      {isLogin ? (
        children
      ) : (
        <div className='mx-auto max-w-3xl py-2.5'>
          <Logout className='fixed right-2 bottom-12 z-20' />
          <Devtools position='bottom-right' />
          {children}
        </div>
      )}
    </AuthLayout>
  )
}
export { metadata }
export default Layout

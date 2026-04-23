import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import AuthLayout from '@a/fe/spacetimedb-auth-layout'
import Logout from '@a/fe/spacetimedb-user-menu'
import { headers } from 'next/headers'
import { Devtools } from 'noboil/spacetimedb/react'
import { SpacetimeWrapper } from './providers'
const metadata: Metadata = { description: 'spacetimedb poll demo', title: 'Poll' }
const Layout = async ({ children }: { children: ReactNode }) => {
  const pathname = (await headers()).get('x-pathname') ?? '/'
  const isLogin = pathname === '/login' || pathname.startsWith('/login/')
  return (
    <AuthLayout Provider={SpacetimeWrapper}>
      {isLogin ? (
        children
      ) : (
        <div className='mx-auto max-w-3xl py-2.5'>
          <Logout className='fixed right-2 bottom-12 z-20' />
          {children}
          <Devtools position='bottom-right' />
        </div>
      )}
    </AuthLayout>
  )
}
export { metadata }
export default Layout

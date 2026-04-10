import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import AuthLayout from '@a/fe/auth-layout'
import Logout from '@a/fe/user-menu'
import { OfflineIndicator } from '@noboil/convex/components'
import { Devtools } from '@noboil/convex/react'
import { UserRound } from 'lucide-react'
import { headers } from 'next/headers'
import Link from 'next/link'
import { renderConvexProvider } from './providers'
const metadata: Metadata = { description: 'noboil blog demo', title: 'Blog' }
const Layout = async ({ children }: { children: ReactNode }) => {
  const requestHeaders = await headers()
  const pathname = requestHeaders.get('x-pathname') ?? '/'
  const isLogin = pathname === '/login' || pathname.startsWith('/login/')
  return (
    <AuthLayout convexProvider={renderConvexProvider}>
      {isLogin ? (
        children
      ) : (
        <div className='mx-auto max-w-3xl py-2.5'>
          <Link
            className='fixed bottom-12 left-2 size-10 rounded-full bg-muted p-2 transition-all duration-300 hover:scale-110 hover:bg-border active:scale-75'
            data-testid='profile-link'
            href='/profile'>
            <UserRound className='size-full' />
          </Link>
          <Logout className='fixed bottom-2 left-2' />
          <OfflineIndicator />
          <Devtools position='bottom-right' />
          {children}
        </div>
      )}
    </AuthLayout>
  )
}
export { metadata }
export default Layout

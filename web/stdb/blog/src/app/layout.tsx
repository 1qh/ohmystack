/* oxlint-disable forbid-component-props -- shadcn/Tailwind pattern requires className/style on shared components */
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import AuthLayout from '@a/fe/spacetimedb-auth-layout'
import Logout from '@a/fe/spacetimedb-user-menu'
import { UserRound } from 'lucide-react'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Devtools } from 'noboil/spacetimedb/react'
import { SpacetimeWrapper } from './providers'
const metadata: Metadata = { description: 'spacetimedb blog demo', title: 'Blog' }
const Layout = async ({ children }: { children: ReactNode }) => {
  const pathname = (await headers()).get('x-pathname') ?? '/'
  const isLogin = pathname === '/login' || pathname.startsWith('/login/')
  return (
    <AuthLayout Provider={SpacetimeWrapper}>
      {isLogin ? (
        children
      ) : (
        <div className='mx-auto max-w-3xl py-2.5'>
          <Link
            aria-label='Profile'
            className='fixed bottom-12 left-2 size-10 rounded-full bg-muted p-2 transition-all duration-300 hover:scale-110 hover:bg-border active:scale-75'
            data-testid='profile-link'
            href='/profile'>
            <UserRound className='size-full' />
          </Link>
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

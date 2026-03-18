// oxlint-disable no-await-expression-member
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import AuthLayout from '@a/fe/spacetimedb-auth-layout'
import SpacetimeProvider from '@a/fe/spacetimedb-provider'
import Logout from '@a/fe/spacetimedb-user-menu'
import { BetterspaceDevtools } from '@noboil/spacetimedb/react'
import { UserRound } from 'lucide-react'
import { headers } from 'next/headers'
import Link from 'next/link'

const metadata: Metadata = { description: 'spacetimedb blog demo', title: 'Blog' },
  renderSpacetimeProvider = (inner: ReactNode): ReactNode => <SpacetimeProvider fileApi>{inner}</SpacetimeProvider>,
  Layout = async ({ children }: { children: ReactNode }) => {
    const pathname = (await headers()).get('x-pathname') ?? '/',
      isLogin = pathname === '/login' || pathname.startsWith('/login/')

    return (
      <AuthLayout provider={renderSpacetimeProvider}>
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
            {children}
            <BetterspaceDevtools position='bottom-right' />
          </div>
        )}
      </AuthLayout>
    )
  }

export { metadata }
export default Layout

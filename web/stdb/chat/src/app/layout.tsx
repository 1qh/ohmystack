// oxlint-disable no-await-expression-member
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import AuthLayout from '@a/fe/spacetimedb-auth-layout'
import SpacetimeProvider from '@a/fe/spacetimedb-provider'
import { SidebarInset, SidebarProvider } from '@a/ui/sidebar'
import { BetterspaceDevtools } from '@noboil/spacetimedb/react'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import Sidebar from './sidebar'

const metadata: Metadata = { description: 'spacetimedb chat demo', title: 'Chat' },
  PUBLIC_PATHS = ['/login', '/public'],
  isPublicPath = (pathname: string) => {
    for (const p of PUBLIC_PATHS) if (pathname === p || pathname.startsWith(`${p}/`)) return true
    return false
  },
  renderSpacetimeProvider = (inner: ReactNode): ReactNode => <SpacetimeProvider>{inner}</SpacetimeProvider>,
  Layout = async ({ children }: { children: ReactNode }) => {
    const pathname = (await headers()).get('x-pathname') ?? '/',
      token = (await cookies()).get('spacetimedb_token')?.value,
      // eslint-disable-next-line no-restricted-properties
      isPlaywright = process.env.PLAYWRIGHT === '1' || process.env.NEXT_PUBLIC_PLAYWRIGHT === '1'

    if (!(isPublicPath(pathname) || isPlaywright || (typeof token === 'string' && token.length > 0))) redirect('/login')

    const showSidebar = !isPublicPath(pathname)

    return (
      <AuthLayout provider={renderSpacetimeProvider}>
        {showSidebar ? (
          <SidebarProvider>
            <Sidebar />
            <SidebarInset className='flex h-screen flex-col'>{children}</SidebarInset>
          </SidebarProvider>
        ) : (
          children
        )}
        <BetterspaceDevtools position='bottom-right' />
      </AuthLayout>
    )
  }

export { metadata }
export default Layout

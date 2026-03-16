import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import AuthLayout from '@a/fe/auth-layout'
import ConvexProvider from '@a/fe/convex-provider'
import { SidebarInset, SidebarProvider } from '@a/ui/sidebar'
import { isAuthenticated } from '@noboil/convex/next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import Sidebar from './sidebar'

const metadata: Metadata = { description: 'lazyconvex chat demo', title: 'Chat' },
  PUBLIC_PATHS = ['/login', '/public'],
  renderConvexProvider = (inner: ReactNode): ReactNode => <ConvexProvider>{inner}</ConvexProvider>,
  isPublicPath = (pathname: string) => {
    for (const p of PUBLIC_PATHS) if (pathname === p || pathname.startsWith(`${p}/`)) return true
    return false
  },
  Layout = async ({ children }: { children: ReactNode }) => {
    const requestHeaders = await headers(),
      pathname = requestHeaders.get('x-pathname') ?? '/'

    if (!(isPublicPath(pathname) || (await isAuthenticated()))) redirect('/login')

    const showSidebar = !isPublicPath(pathname)

    return (
      <AuthLayout convexProvider={renderConvexProvider}>
        {showSidebar ? (
          <SidebarProvider>
            <Sidebar />
            <SidebarInset className='flex h-screen flex-col'>{children}</SidebarInset>
          </SidebarProvider>
        ) : (
          children
        )}
      </AuthLayout>
    )
  }

export { metadata }
export default Layout

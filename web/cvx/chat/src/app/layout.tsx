import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import AuthLayout from '@a/fe/auth-layout'
import { SidebarInset, SidebarProvider } from '@a/ui/sidebar'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { isAuthenticated } from 'noboil/convex/next'
import { Devtools } from 'noboil/convex/react'
import { ConvexWrapper } from './providers'
import Sidebar from './sidebar'
const metadata: Metadata = { description: 'noboil chat demo', title: 'Chat' }
const PUBLIC_PATHS = ['/login', '/public']
const isPublicPath = (pathname: string) => {
  for (const p of PUBLIC_PATHS) if (pathname === p || pathname.startsWith(`${p}/`)) return true
  return false
}
const Layout = async ({ children }: { children: ReactNode }) => {
  const requestHeaders = await headers()
  const pathname = requestHeaders.get('x-pathname') ?? '/'
  if (!(isPublicPath(pathname) || (await isAuthenticated()))) redirect('/login')
  const showSidebar = !isPublicPath(pathname)
  return (
    <AuthLayout ConvexProvider={ConvexWrapper}>
      <Devtools position='bottom-right' />
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

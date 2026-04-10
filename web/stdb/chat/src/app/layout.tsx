// oxlint-disable no-await-expression-member
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import AuthLayout from '@a/fe/spacetimedb-auth-layout'
import { SidebarInset, SidebarProvider } from '@a/ui/sidebar'
import { Devtools } from '@noboil/spacetimedb/react'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SpacetimeWrapper } from './providers'
import Sidebar from './sidebar'
const metadata: Metadata = { description: 'spacetimedb chat demo', title: 'Chat' }
const PUBLIC_PATHS = ['/login', '/public']
const isPublicPath = (pathname: string) => {
  for (const p of PUBLIC_PATHS) if (pathname === p || pathname.startsWith(`${p}/`)) return true
  return false
}
const Layout = async ({ children }: { children: ReactNode }) => {
  const pathname = (await headers()).get('x-pathname') ?? '/'
  const token = (await cookies()).get('spacetimedb_token')?.value
  const isPlaywright = process.env.PLAYWRIGHT === '1' || process.env.NEXT_PUBLIC_PLAYWRIGHT === '1'
  if (!(isPublicPath(pathname) || isPlaywright || (typeof token === 'string' && token.length > 0))) redirect('/login')
  const showSidebar = !isPublicPath(pathname)
  return (
    <AuthLayout Provider={SpacetimeWrapper}>
      {showSidebar ? (
        <SidebarProvider>
          <Sidebar />
          <SidebarInset className='flex h-screen flex-col'>{children}</SidebarInset>
        </SidebarProvider>
      ) : (
        children
      )}
      <Devtools position='bottom-right' />
    </AuthLayout>
  )
}
export { metadata }
export default Layout

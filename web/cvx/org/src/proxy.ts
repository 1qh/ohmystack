import { createProxy } from '@a/fe/convex-proxy'
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
export default createProxy()

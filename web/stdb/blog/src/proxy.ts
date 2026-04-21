import type { NextRequest } from 'next/server'
/* oxlint-disable unicorn/no-anonymous-default-export */
/** biome-ignore-all lint/style/noDefaultExport: next.js middleware */
import { NextResponse } from 'next/server'
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
export default (request: NextRequest) => {
  const response = NextResponse.next()
  response.headers.set('x-pathname', request.nextUrl.pathname)
  return response
}

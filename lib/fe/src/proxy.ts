import { convexAuthNextjsMiddleware } from '@convex-dev/auth/nextjs/server'
import { NextResponse } from 'next/server'
const createProxy = () =>
  convexAuthNextjsMiddleware(request => {
    const response = NextResponse.next()
    response.headers.set('x-pathname', request.nextUrl.pathname)
    return response
  })
export { createProxy }

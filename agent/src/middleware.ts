import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
const middleware = (request: NextRequest) => {
  const headers = new Headers(request.headers)
  headers.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ headers })
}
export { middleware }

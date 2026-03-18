import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

const createProxy = () => (request: NextRequest) => {
  const response = NextResponse.next()
  response.headers.set('x-pathname', request.nextUrl.pathname)
  return response
}

export { createProxy }

import type { NextRequest } from 'next/server'

import { setActiveOrgCookie } from '@noboil/convex/next'
import { NextResponse } from 'next/server'

const GET = async (req: NextRequest) => {
  const { searchParams } = req.nextUrl,
    orgId = searchParams.get('orgId'),
    slug = searchParams.get('slug'),
    to = searchParams.get('to') ?? '/dashboard'

  if (orgId && slug) await setActiveOrgCookie({ orgId, slug })

  return NextResponse.redirect(new URL(to, req.url))
}

export { GET }

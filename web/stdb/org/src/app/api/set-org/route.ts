import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { setActiveOrgCookie } from 'noboil/spacetimedb/next'
const GET = async (req: NextRequest) => {
  const { searchParams } = req.nextUrl
  const orgId = searchParams.get('orgId')
  const slug = searchParams.get('slug')
  const rawTo = searchParams.get('to') ?? '/dashboard'
  const to = rawTo.startsWith('/') && !rawTo.startsWith('//') ? rawTo : '/dashboard'
  if (orgId && slug) await setActiveOrgCookie({ orgId, slug })
  return NextResponse.redirect(new URL(to, req.url))
}
export { GET }

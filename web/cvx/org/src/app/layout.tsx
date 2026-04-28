/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
/* oxlint-disable eslint(no-underscore-dangle) */
import type { Doc } from '@a/be-convex/model'
import type { FunctionReference } from 'convex/server'
import type { Metadata } from 'next'
import type { OrgRole } from 'noboil/convex'
import type { ReactNode } from 'react'
import { api } from '@a/be-convex'
import AuthLayout from '@a/fe/convex-auth-layout'
import { fetchQuery } from 'convex/nextjs'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getActiveOrg, getToken, isAuthenticated } from 'noboil/convex/next'
import { Devtools } from 'noboil/convex/react'
import { getTestClient } from '~/utils'
import OrgLayoutClient from './layout-client'
import { ConvexWrapper } from './providers'
const ORG_PATHS = ['/dashboard', '/members', '/projects', '/wiki', '/settings']
const needsOrgLayout = (pathname: string) => {
  for (const p of ORG_PATHS) if (pathname === p || pathname.startsWith(`${p}/`)) return true
  return false
}
interface MembershipResult {
  memberId: null | string
  role: OrgRole
}
interface MyOrgsResult {
  org: { _id: string; avatarId?: string; name: string; slug: string }
  role: OrgRole
}
const queryOrDirect = async <T,>(
  token: null | string | undefined,
  query: FunctionReference<'query'>,
  args: Record<string, unknown>
): Promise<null | T> => {
  if (token) return fetchQuery(query, args, { token }) as Promise<T>
  return getTestClient().query(query, args) as Promise<T>
}
type OrgContext =
  | { kind: 'ok'; membership: MembershipResult; org: Doc<'org'> }
  | { kind: 'redirect'; orgId: string; slug: string; to: string }
const resolveOrgContext = async (pathname: string): Promise<OrgContext> => {
  await connection()
  if (!(await isAuthenticated())) redirect('/login')
  const token = await getToken()
  const org = (await getActiveOrg({ query: api.org.get, token: token ?? null })) as Doc<'org'> | null
  if (!org) {
    const orgs = (await queryOrDirect<MyOrgsResult[]>(token, api.org.myOrgs, {})) ?? []
    if (orgs.length === 0) redirect('/')
    const [first] = orgs
    if (first) return { kind: 'redirect', orgId: first.org._id, slug: first.org.slug, to: pathname }
    redirect('/')
  }
  const membership = await queryOrDirect<MembershipResult>(token, api.org.membership, {
    orgId: org._id
  })
  if (!membership) redirect('/')
  return { kind: 'ok', membership, org }
}
const Layout = async ({ children }: { children: ReactNode }) => {
  const requestHeaders = await headers()
  const pathname = requestHeaders.get('x-pathname') ?? '/'
  let content: ReactNode = children
  if (needsOrgLayout(pathname)) {
    const ctx = await resolveOrgContext(pathname)
    if (ctx.kind === 'redirect') {
      const params = new URLSearchParams({ orgId: ctx.orgId, slug: ctx.slug, to: ctx.to })
      redirect(`/api/set-org?${params.toString()}`)
    }
    content = (
      <OrgLayoutClient membership={null} org={ctx.org} role={ctx.membership.role}>
        {children}
      </OrgLayoutClient>
    )
  }
  return (
    <AuthLayout ConvexProvider={ConvexWrapper}>
      <Devtools position='bottom-right' />
      {content}
    </AuthLayout>
  )
}
const metadata: Metadata = { description: 'noboil org demo', title: 'Org' }
export { metadata }
export default Layout

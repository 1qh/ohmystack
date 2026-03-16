/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
import type { Doc } from '@a/be-convex/model'
import type { OrgRole } from '@noboil/convex'
import type { FunctionReference } from 'convex/server'
import type { ReactNode } from 'react'

import { api } from '@a/be-convex'
import AuthLayout from '@a/fe/auth-layout'
import ConvexProvider from '@a/fe/convex-provider'
import { getActiveOrg, getToken, isAuthenticated } from '@noboil/convex/next'
import { fetchQuery } from 'convex/nextjs'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'

import { getTestClient } from '~/utils'

import OrgLayoutClient from './layout-client'
import OrgRedirect from './org-redirect'

const ORG_PATHS = ['/dashboard', '/members', '/projects', '/wiki', '/settings'],
  needsOrgLayout = (pathname: string) => {
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

    const token = await getToken(),
      org = (await getActiveOrg({ query: api.org.get, token: token ?? null })) as Doc<'org'> | null

    if (!org) {
      const orgs = (await queryOrDirect<MyOrgsResult[]>(token, api.org.myOrgs as FunctionReference<'query'>, {})) ?? []

      if (orgs.length === 0) redirect('/')
      const [first] = orgs
      if (first) return { kind: 'redirect', orgId: first.org._id, slug: first.org.slug, to: pathname }
      redirect('/')
    }

    const membership = await queryOrDirect<MembershipResult>(token, api.org.membership as FunctionReference<'query'>, {
      orgId: org._id
    })

    if (!membership) redirect('/')

    return { kind: 'ok', membership, org }
  },
  Layout = async ({ children }: { children: ReactNode }) => {
    const requestHeaders = await headers(),
      pathname = requestHeaders.get('x-pathname') ?? '/'

    let content: ReactNode = children

    if (needsOrgLayout(pathname)) {
      const ctx = await resolveOrgContext(pathname)
      if (ctx.kind === 'redirect')
        return (
          <AuthLayout convexProvider={inner => <ConvexProvider fileApi>{inner}</ConvexProvider>}>
            <OrgRedirect orgId={ctx.orgId} slug={ctx.slug} to={ctx.to} />
          </AuthLayout>
        )
      content = (
        <OrgLayoutClient membership={null} org={ctx.org} role={ctx.membership.role}>
          {children}
        </OrgLayoutClient>
      )
    }

    return <AuthLayout convexProvider={inner => <ConvexProvider fileApi>{inner}</ConvexProvider>}>{content}</AuthLayout>
  }

export default Layout

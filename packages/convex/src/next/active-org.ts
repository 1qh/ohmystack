/** biome-ignore-all lint/style/noProcessEnv: env detection */
'use server'
import type { FunctionReference } from 'convex/server'

import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server'
import { ConvexHttpClient } from 'convex/browser'
import { fetchQuery } from 'convex/nextjs'
import { cookies } from 'next/headers'

import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_SLUG_COOKIE, ONE_YEAR_SECONDS } from '../constants'

/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
const isTestMode = () =>
    Boolean(
      process.env.PLAYWRIGHT || process.env.NEXT_PUBLIC_PLAYWRIGHT || process.env.TEST_MODE || process.env.CONVEX_TEST_MODE
    ),
  directQuery = async (query: FunctionReference<'query'>, args: Record<string, unknown>) => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL
    if (!url) return null
    const client = new ConvexHttpClient(url)
    try {
      return await client.query(query, args)
    } catch {
      return null
    }
  },
  getToken = async (): Promise<string | undefined> => {
    if (isTestMode()) return
    // oxlint-disable-next-line promise/prefer-await-to-then
    const t = await convexAuthNextjsToken().catch(() => null)
    return t ?? undefined
  },
  isAuthenticated = async () => {
    if (isTestMode()) return true
    try {
      return Boolean(await convexAuthNextjsToken())
    } catch {
      return false
    }
  },
  setActiveOrgCookie = async ({ orgId, slug }: { orgId: string; slug: string }) => {
    const cookieStore = await cookies(),
      opts = { httpOnly: false, maxAge: ONE_YEAR_SECONDS, path: '/' } as const
    cookieStore.set(ACTIVE_ORG_COOKIE, orgId, opts)
    cookieStore.set(ACTIVE_ORG_SLUG_COOKIE, slug, opts)
  },
  clearActiveOrgCookie = async () => {
    const cookieStore = await cookies()
    cookieStore.delete(ACTIVE_ORG_COOKIE)
    cookieStore.delete(ACTIVE_ORG_SLUG_COOKIE)
  },
  getActiveOrg = async ({ query, token }: { query: FunctionReference<'query'>; token: null | string }) => {
    const cookieStore = await cookies(),
      orgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value
    if (!orgId) return null
    try {
      if (token) return await fetchQuery(query, { orgId }, { token })

      return await directQuery(query, { orgId })
    } catch {
      cookieStore.delete(ACTIVE_ORG_COOKIE)
      cookieStore.delete(ACTIVE_ORG_SLUG_COOKIE)
      return null
    }
  }

/** Gets the Convex authentication token for the current user. */
export { getToken }

/** Checks if the user is authenticated with Convex. */
export { isAuthenticated }

/** Sets the active organization cookies with orgId and slug. */
export { setActiveOrgCookie }

/** Clears the active organization cookies from the browser. */
export { clearActiveOrgCookie }

/** Retrieves the active organization from cookies and validates it via query. */
export { getActiveOrg }

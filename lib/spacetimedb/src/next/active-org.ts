// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
'use server'
import { cookies } from 'next/headers'
import type { ActiveOrgQuery } from './active-org-types'
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_SLUG_COOKIE, ONE_YEAR_SECONDS } from '../constants'
/** Detects whether auth helpers are running in test mode. */
const isTestMode = () =>
  Boolean(
    process.env.PLAYWRIGHT || // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing
      process.env.NEXT_PUBLIC_PLAYWRIGHT || // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing
      process.env.TEST_MODE || // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing
      process.env.SPACETIMEDB_TEST_MODE
  )
const toHttpUri = (uri: string) => {
  if (uri.startsWith('wss://')) return uri.replace('wss://', 'https://')
  if (uri.startsWith('ws://')) return uri.replace('ws://', 'http://')
  return uri
}
/** Reads the SpacetimeDB auth token from cookies, with test fallback. */
const getToken = async (): Promise<string | undefined> => {
  const cookieStore = await cookies()
  const token = cookieStore.get('spacetimedb_token')?.value
  if (token) return token
  if (isTestMode()) return process.env.SPACETIMEDB_TEST_TOKEN ?? process.env.NOBOIL_TEST_TOKEN
}
/** Returns whether a valid token is currently available. */
const isAuthenticated = async () => Boolean(await getToken())
/** Persists active org id and slug in response cookies. */
const setActiveOrgCookie = async ({ orgId, slug }: { orgId: string; slug: string }) => {
  const cookieStore = await cookies()
  const opts = { httpOnly: true, maxAge: ONE_YEAR_SECONDS, path: '/' } as const
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, opts)
  cookieStore.set(ACTIVE_ORG_SLUG_COOKIE, slug, opts)
}
/** Clears active org cookies from the current request context. */
const clearActiveOrgCookie = async () => {
  const cookieStore = await cookies()
  cookieStore.delete(ACTIVE_ORG_COOKIE)
  cookieStore.delete(ACTIVE_ORG_SLUG_COOKIE)
}
const clearActiveOrgSelection = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  cookieStore.delete(ACTIVE_ORG_COOKIE)
  cookieStore.delete(ACTIVE_ORG_SLUG_COOKIE)
}
const firstRow = (payload: unknown): null | Record<string, unknown> => {
  if (Array.isArray(payload) && payload.length > 0) {
    const [first] = payload as unknown[]
    if (typeof first === 'object' && first !== null) return first as Record<string, unknown>
  }
  if (typeof payload === 'object' && payload !== null) {
    const { rows } = payload as { rows?: unknown }
    if (Array.isArray(rows) && rows.length > 0) {
      const [first] = rows as unknown[]
      if (typeof first === 'object' && first !== null) return first as Record<string, unknown>
    }
  }
  return null
}
const queryActiveOrgSql = async <T>({
  orgId,
  sql,
  token
}: {
  orgId: string
  sql: string
  token: string
}): Promise<null | T> => {
  const wsUri = process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? process.env.SPACETIMEDB_URI
  const moduleName = process.env.SPACETIMEDB_MODULE_NAME
  if (!(wsUri && moduleName)) return null
  const parsed = Number.parseInt(orgId, 10)
  if (Number.isNaN(parsed) || parsed < 1) return null
  const statement = sql.replace(':orgId', `'${String(parsed)}'`)
  const response = await fetch(`${toHttpUri(wsUri)}/v1/database/${moduleName}/sql`, {
    body: statement,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    method: 'POST'
  })
  if (!response.ok) return null
  const body = (await response.json().catch(() => null)) as unknown
  if (body === null) return null
  return firstRow(body) as null | T
}
const resolveActiveOrg = async <T>({
  orgId,
  query,
  token
}: {
  orgId: string
  query: ActiveOrgQuery<T>
  token: null | string
}): Promise<null | T> => {
  const activeToken = token ?? (await getToken())
  if (!activeToken) return null
  if (typeof query === 'function') return query({ orgId })
  return queryActiveOrgSql<T>({ orgId, sql: query.sql, token: activeToken })
}
/** Resolves the active organization document from cookie state.
 * @param options - Active org query options
 * @returns Active organization row or null
 */
const getActiveOrg = async <T>({ query, token }: { query: ActiveOrgQuery<T>; token: null | string }) => {
  const cookieStore = await cookies()
  const orgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value
  if (!orgId) return null
  try {
    const org = await resolveActiveOrg({ orgId, query, token })
    if (org) return org
    clearActiveOrgSelection(cookieStore)
    return null
  } catch {
    clearActiveOrgSelection(cookieStore)
    return null
  }
}
export { clearActiveOrgCookie, getActiveOrg, getToken, isAuthenticated, setActiveOrgCookie }

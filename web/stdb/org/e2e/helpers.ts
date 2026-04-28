/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential test operations */
/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
/* oxlint-disable eslint(no-underscore-dangle) */
import type { Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
interface InviteResponse {
  _id?: string
  inviteId: string
  token: string
}
interface MemberResponse {
  _id?: string
  isAdmin?: boolean
  role?: string
  userId?: string
}
interface OrgMembershipResponse {
  role?: string
  userId?: string
}
interface OrgResponse {
  _id?: string
  name?: string
  slug?: string
  userId?: string
}
interface OrgWithRole {
  org: { _id: string; name?: string; slug?: string }
  role: string
}
interface PaginatedResponse<T> {
  isDone: boolean
  page: T[]
}
interface PendingAction {
  args: unknown[]
  reducer: string
}
interface ProjectResponse {
  _id?: string
  description?: string
  name?: string
  orgId?: string
  status?: string
}
interface TaskResponse {
  _id?: string
  completed?: boolean
  id?: number
  orgId?: string
  priority?: string
  title?: string
}
interface WikiResponse {
  _id?: string
  content?: string
  deletedAt?: unknown
  id?: number
  orgId?: string
  slug?: string
  status?: string
  title?: string
}
const TOKEN_FILE = join(import.meta.dirname, '.stdb-test-token.json')
const PENDING_FILE = join(import.meta.dirname, '.stdb-pending-actions.json')
const readTokenData = (): null | { identity: string; orgId?: string; token: string } => {
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) as { identity: string; orgId?: string; token: string }
  } catch {
    return null
  }
}
const readPendingActions = (): PendingAction[] => {
  try {
    const raw = readFileSync(PENDING_FILE, 'utf8')
    writeFileSync(PENDING_FILE, '[]')
    return JSON.parse(raw) as PendingAction[]
  } catch {
    return []
  }
}
const login = async (page?: Page): Promise<void> => {
  if (!page) return
  const data = readTokenData()
  if (!data) return
  await page.context().clearCookies()
  await page
    .context()
    .addCookies([
      { domain: 'localhost', name: 'spacetimedb_token', path: '/', value: encodeURIComponent(data.token) },
      ...(data.orgId ? [{ domain: 'localhost', name: 'activeOrgId', path: '/', value: data.orgId }] : [])
    ])
  await page.addInitScript(
    ({ t }) => {
      const g = globalThis as Record<string, unknown>
      g.PLAYWRIGHT = '1'
      globalThis.localStorage.clear()
      globalThis.localStorage.setItem('spacetimedb.token', t)
    },
    { t: data.token }
  )
  const pending = readPendingActions()
  if (pending.length > 0) {
    for (const action of pending)
      await page.evaluate(async ({ args, reducer }) => {
        const stdb = (globalThis as Record<string, unknown>).__SPACETIMEDB_CONNECTION__ as
          | undefined
          | { reducers: Record<string, (...a: unknown[]) => Promise<void>> }
        if (stdb?.reducers[reducer]) await stdb.reducers[reducer](...args)
      }, action)
    /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: needed for SpacetimeDB subscription sync */
    await page.waitForTimeout(1000)
  }
}
export {
  addTestOrgMember,
  api,
  createTestOrg,
  createTestUser,
  ensureTestUser,
  expectError,
  extractErrorCode,
  makeOrgTestUtils,
  removeTestOrgMember,
  setupOrg,
  tc
} from '@a/e2e/stdb-org-helpers'
export type {
  InviteResponse,
  MemberResponse,
  OrgMembershipResponse,
  OrgResponse,
  OrgWithRole,
  PaginatedResponse,
  ProjectResponse,
  TaskResponse,
  WikiResponse
}
export { login }

import type { Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
interface PendingAction {
  args: unknown[]
  reducer: string
}
const TOKEN_FILE = join(import.meta.dirname, '.stdb-test-token.json'),
  PENDING_FILE = join(import.meta.dirname, '.stdb-pending-actions.json'),
  readTokenData = (): { identity: string; orgId?: string; token: string } | null => {
    try {
      return JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) as { identity: string; orgId?: string; token: string }
    } catch {
      return null
    }
  },
  readPendingActions = (): PendingAction[] => {
    try {
      const raw = readFileSync(PENDING_FILE, 'utf8')
      writeFileSync(PENDING_FILE, '[]')
      return JSON.parse(raw) as PendingAction[]
    } catch {
      return []
    }
  },
  login = async (page?: Page): Promise<void> => {
    if (!page) return
    const data = readTokenData()
    if (!data) return
    await page.context().addCookies([
      { domain: 'localhost', name: 'spacetimedb_token', path: '/', value: encodeURIComponent(data.token) },
      ...(data.orgId ? [{ domain: 'localhost', name: 'activeOrgId', path: '/', value: data.orgId }] : [])
    ])
    await page.addInitScript(
      ({ t }) => {
        window.localStorage.setItem('spacetimedb.token', t)
      },
      { t: data.token }
    )
    const pending = readPendingActions()
    if (pending.length > 0) {
      await page.goto('/')
      await page.waitForTimeout(2000)
      for (const action of pending)
        await page.evaluate(
          async ({ args, reducer }) => {
            const stdb = (globalThis as Record<string, unknown>).__SPACETIMEDB_CONNECTION__ as
              | { reducers: Record<string, (...a: unknown[]) => Promise<void>> }
              | undefined
            if (stdb?.reducers?.[reducer]) await stdb.reducers[reducer](...args)
          },
          action
        )
      await page.waitForTimeout(1000)
    }
  }
export { login }

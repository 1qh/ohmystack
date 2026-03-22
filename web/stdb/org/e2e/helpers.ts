import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
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
const getTestToken = (): string => {
    const raw = readFileSync(join(import.meta.dirname, '.stdb-test-token.json'), 'utf8'),
      data = JSON.parse(raw) as { token: string }
    return data.token
  },
  login = async (page?: Page): Promise<void> => {
    if (!page) return
    try {
      const raw = readFileSync(join(import.meta.dirname, '.stdb-test-token.json'), 'utf8'),
        data = JSON.parse(raw) as { identity: string; orgId?: string; token: string }
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
    } catch {
      /* Token file not yet created */
    }
  }
export { login }

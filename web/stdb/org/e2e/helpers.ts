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
const getTestToken = (): { identity: string; token: string } => {
  const raw = readFileSync(join(import.meta.dirname, '.stdb-test-token.json'), 'utf8')
  return JSON.parse(raw) as { identity: string; token: string }
}
const login = async (page?: Page): Promise<void> => {
  if (!page) return
  const { token } = getTestToken()
  await page.context().addCookies([
    {
      domain: 'localhost',
      name: 'spacetimedb_token',
      path: '/',
      value: encodeURIComponent(token)
    }
  ])
  await page.addInitScript(
    ({ t }) => {
      window.localStorage.setItem('spacetimedb.token', t)
    },
    { t: token }
  )
}
export { login }

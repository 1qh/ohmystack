import { expect, test } from './fixtures'

const DELETE_RE = /delete/iu
const NAME_RE = /name/iu
const URL_RE = /url/iu
const ADD_RE = /add/iu
const DUPLICATE_RE = /name.*taken|duplicate/iu
const BLOCKED_RE = /blocked/iu
const DISABLE_RE = /disable/iu
const ENABLE_RE = /enable/iu
const MCP_SERVERS_RE = /mcp servers/iu

test.describe
  .serial('Settings (MCP)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/settings')
      const names = ['test-server', 'evil-server']
      for (const name of names) {
        const row = page.locator('li', { hasText: name })
        /** biome-ignore lint/performance/noAwaitInLoops: sequential Playwright page interactions */
        while ((await row.count()) > 0) {
          /** biome-ignore lint/performance/noAwaitInLoops: sequential Playwright page interactions */
          await row.first().getByRole('button', { name: DELETE_RE }).click() // oxlint-disable-line eslint/no-await-in-loop
          /** biome-ignore lint/performance/noAwaitInLoops: sequential Playwright page interactions */
          await expect(page.getByText(name, { exact: true })).not.toBeVisible() // oxlint-disable-line eslint/no-await-in-loop
        }
      }
    })

    test('add server with valid URL', async ({ page }) => {
      await page.goto('/settings')
      await page.getByPlaceholder(NAME_RE).fill('test-server')
      await page.getByPlaceholder(URL_RE).fill('https://example.com/mcp')
      await page.getByRole('button', { name: ADD_RE }).click()
      await expect(page.getByText('test-server')).toBeVisible()
    })

    test('duplicate name rejected', async ({ page }) => {
      await page.goto('/settings')
      await page.getByPlaceholder(NAME_RE).fill('test-server')
      await page.getByPlaceholder(URL_RE).fill('https://example.com/mcp')
      await page.getByRole('button', { name: ADD_RE }).click()
      await expect(page.getByText('test-server')).toBeVisible()

      await page.getByPlaceholder(NAME_RE).fill('test-server')
      await page.getByPlaceholder(URL_RE).fill('https://other.com/mcp')
      await page.getByRole('button', { name: ADD_RE }).click()
      await expect(page.getByText(DUPLICATE_RE)).toBeVisible()
    })

    test('SSRF URL rejected', async ({ page }) => {
      await page.goto('/settings')
      await page.getByPlaceholder(NAME_RE).fill('evil-server')
      await page.getByPlaceholder(URL_RE).fill('http://localhost:8080/mcp')
      await page.getByRole('button', { name: ADD_RE }).click()
      await expect(page.getByText(BLOCKED_RE)).toBeVisible()
    })

    test('delete server removes from list', async ({ page }) => {
      await page.goto('/settings')
      await page.getByPlaceholder(NAME_RE).fill('test-server')
      await page.getByPlaceholder(URL_RE).fill('https://example.com/mcp')
      await page.getByRole('button', { name: ADD_RE }).click()
      await expect(page.getByText('test-server')).toBeVisible()

      const serverRow = page.locator('li', { hasText: 'test-server' })
      await serverRow.getByRole('button', { name: DELETE_RE }).click()
      await expect(page.getByText('test-server')).not.toBeVisible()
    })
  })

test.describe
  .serial('Settings (MCP) - matrix additions', () => {
    test('server enable/disable toggle', async ({ page }) => {
      const name = `toggle-${Date.now()}`
      await page.goto('/settings')
      await page.getByPlaceholder(NAME_RE).fill(name)
      await page.getByPlaceholder(URL_RE).fill('https://example.com/toggle')
      await page.getByRole('button', { name: ADD_RE }).click()
      await expect(page.getByText(name)).toBeVisible()
      const disableBtn = page.getByRole('button', { name: DISABLE_RE }).first()
      await disableBtn.click()
      /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: wait for Convex reactive update */
      await page.waitForTimeout(2000)
      await expect(page.getByRole('button', { name: ENABLE_RE }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('settings page includes MCP heading', async ({ page }) => {
      await page.goto('/settings')
      await expect(page.getByRole('heading', { name: MCP_SERVERS_RE })).toBeVisible()
    })
  })

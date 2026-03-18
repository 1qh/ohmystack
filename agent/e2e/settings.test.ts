/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Playwright page interactions */
/** biome-ignore-all lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
import { expect, test } from './fixtures'

const DELETE_RE = /delete/iu,
  NAME_RE = /name/iu,
  URL_RE = /url/iu,
  ADD_RE = /add/iu,
  DUPLICATE_RE = /name.*taken|duplicate/iu,
  BLOCKED_RE = /blocked/iu,
  DISABLE_RE = /disable/iu,
  ENABLE_RE = /enable/iu,
  MCP_SERVERS_RE = /mcp servers/iu

test.describe
  .serial('Settings (MCP)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/settings')
      const names = ['test-server', 'evil-server']
      for (const name of names) {
        const row = page.locator('li', { hasText: name })
        while ((await row.count()) > 0) {
          await row.first().getByRole('button', { name: DELETE_RE }).click()
          await expect(page.getByText(name, { exact: true })).not.toBeVisible()
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
      await page.waitForTimeout(2000)
      await expect(page.getByRole('button', { name: ENABLE_RE }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('settings page includes MCP heading', async ({ page }) => {
      await page.goto('/settings')
      await expect(page.getByRole('heading', { name: MCP_SERVERS_RE })).toBeVisible()
    })
  })

import { expect, test } from './fixtures'

test.describe('Frontend States', () => {
  test('session list shows New Chat for new user', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /new/i })).toBeVisible()
  })

  test('settings back link works', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('link', { name: /sessions/i }).click()
    await page.waitForURL('/')
  })

  test('chat shows loading then content', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await expect(page.getByText(/no messages/i)).toBeVisible()
  })
})

test.describe('Frontend States - remaining coverage', () => {
  test('settings page shows MCP section', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /mcp/i })).toBeVisible()
  })

  test('session list shows session after creation', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await page.getByRole('link', { name: /sessions/i }).click()
    await page.waitForURL('/')
    await expect(page.locator('button').filter({ has: page.locator('.font-medium') }).first()).toBeVisible()
  })
})

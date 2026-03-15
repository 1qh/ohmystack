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

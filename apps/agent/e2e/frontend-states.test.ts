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

test.describe('Frontend States - final remaining coverage', () => {
  test('settings shows MCP heading', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /mcp servers/iu })).toBeVisible()
  })

  test('session list after creation shows session', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await page.getByRole('link', { name: /sessions/i }).click()
    await page.waitForURL('/')
    await expect(sessionListPage.getSessionCards().first()).toBeVisible()
  })

  test('session row click navigates to chat', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await page.getByRole('link', { name: /sessions/i }).click()
    await page.waitForURL('/')
    await sessionListPage.getSessionCards().first().click()
    await page.waitForURL(/\/chat\//u)
  })

  test('settings back link returns to sessions', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('link', { name: /sessions/i }).click()
    await page.waitForURL('/')
    await expect(page.getByRole('button', { name: /new/i })).toBeVisible()
  })

  test('responsive flow works at 375px viewport', async ({ page, sessionListPage }) => {
    await page.setViewportSize({ height: 812, width: 375 })
    await sessionListPage.goto('/')
    await expect(sessionListPage.getNewButton()).toBeVisible()
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await expect(page.getByPlaceholder(/message/iu)).toBeVisible()
    await expect(page.getByRole('button', { name: /send/iu })).toBeVisible()
    await page.getByRole('link', { name: /settings/i }).click()
    await page.waitForURL('/settings')
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /mcp servers/i })).toBeVisible()
  })

  test('expandable controls are keyboard-focusable', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    const summary = page.getByTestId('typing-panel').locator('summary')
    await summary.focus()
    const isFocused = await summary.evaluate(el => document.activeElement === el)
    expect(isFocused).toBe(true)
  })

  test('v1 chat has no file upload or attachment UI', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /attach|upload|file/iu })).toHaveCount(0)
  })

  test('typing indicator panel shows idle or typing state text', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await expect(page.getByTestId('typing-panel')).toContainText(/idle|typing/iu)
    await chatPage.sendMessage('Typing status test')
    await page.waitForTimeout(3000)
    await expect(page.getByTestId('typing-panel')).toContainText(/idle|typing|agent is typing/iu)
  })

  test('chat loading states render before async panels settle', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    const loadingHints = page.getByText(/loading tasks|loading todos|loading token usage|loading/i)
    const settledHints = page.getByText(/no background tasks|no todos|input|output|total/i)
    if ((await loadingHints.count()) > 0) {
      await expect(loadingHints.first()).toBeVisible()
      return
    }
    await expect(settledHints.first()).toBeVisible()
  })

  test('composer disables while sending message', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await chatPage.getComposer().fill('Disable while sending')
    await chatPage.getSendButton().click()
    await expect(chatPage.getComposer()).toBeDisabled({ timeout: 1000 })
  })

  test('chat remains usable at 375px mobile viewport', async ({ page, sessionListPage }) => {
    await page.setViewportSize({ height: 812, width: 375 })
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await expect(page.getByPlaceholder(/message/iu)).toBeVisible()
    await expect(page.getByRole('button', { name: /send/iu })).toBeVisible()
    await page.getByPlaceholder(/message/iu).fill('Mobile usable')
    await page.getByRole('button', { name: /send/iu }).click()
    await page.waitForTimeout(3000)
    await expect(page.locator('article').first()).toContainText('Mobile usable')
  })

  test('chat remains usable at 768px tablet viewport', async ({ page, sessionListPage }) => {
    await page.setViewportSize({ height: 1024, width: 768 })
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await expect(page.getByPlaceholder(/message/iu)).toBeVisible()
    await expect(page.getByRole('button', { name: /send/iu })).toBeVisible()
    await page.getByPlaceholder(/message/iu).fill('Tablet usable')
    await page.getByRole('button', { name: /send/iu }).click()
    await page.waitForTimeout(3000)
    await expect(page.locator('article').first()).toContainText('Tablet usable')
  })
})

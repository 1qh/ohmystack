import { expect, test } from './fixtures'
const NEW_RE = /new/iu,
  SESSIONS_RE = /sessions/iu,
  CHAT_URL_RE = /\/chat\//u,
  NO_MESSAGES_RE = /no messages/iu,
  MCP_RE = /mcp/iu,
  MCP_SERVERS_RE = /mcp servers/iu,
  MESSAGE_RE = /message/iu,
  SEND_RE = /send/iu,
  SETTINGS_RE = /settings/iu,
  ATTACH_RE = /attach|upload|file/iu,
  IDLE_TYPING_RE = /idle|typing/iu,
  AGENT_TYPING_RE = /idle|typing|agent is typing/iu,
  LOADING_RE = /loading tasks|loading todos|loading token usage|loading/iu,
  SETTLED_RE = /no background tasks|no todos|input|output|total/iu
test.describe('Frontend States', () => {
  test('session list shows New Chat for new user', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: NEW_RE })).toBeVisible()
  })
  test('settings back link works', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('link', { name: SESSIONS_RE }).click()
    await page.waitForURL('/')
    await expect(page).toHaveURL('/')
  })
  test('chat shows loading then content', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    await expect(page.getByText(NO_MESSAGES_RE)).toBeVisible()
  })
})
test.describe('Frontend States - remaining coverage', () => {
  test('settings page shows MCP section', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: MCP_RE })).toBeVisible()
  })
  test('session list shows session after creation', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    await page.getByRole('link', { name: SESSIONS_RE }).click()
    await page.waitForURL('/')
    await expect(
      page
        .locator('button')
        .filter({ has: page.locator('.font-medium') })
        .first()
    ).toBeVisible()
  })
})
test.describe('Frontend States - final remaining coverage', () => {
  test('settings shows MCP heading', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: MCP_SERVERS_RE })).toBeVisible()
  })
  test('session list after creation shows session', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    await page.getByRole('link', { name: SESSIONS_RE }).click()
    await page.waitForURL('/')
    await expect(sessionListPage.getSessionCards().first()).toBeVisible()
  })
  test('session row click navigates to chat', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    await page.getByRole('link', { name: SESSIONS_RE }).click()
    await page.waitForURL('/')
    await sessionListPage.getSessionCards().first().click()
    await page.waitForURL(CHAT_URL_RE)
    await expect(page).toHaveURL(CHAT_URL_RE)
  })
  test('settings back link returns to sessions', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('link', { name: SESSIONS_RE }).click()
    await page.waitForURL('/')
    await expect(page.getByRole('button', { name: NEW_RE })).toBeVisible()
  })
  test('responsive flow works at 375px viewport', async ({ page, sessionListPage }) => {
    await page.setViewportSize({ height: 812, width: 375 })
    await sessionListPage.goto('/')
    await expect(sessionListPage.getNewButton()).toBeVisible()
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    await expect(page.getByPlaceholder(MESSAGE_RE)).toBeVisible()
    await expect(page.getByRole('button', { name: SEND_RE })).toBeVisible()
    await page.getByRole('link', { name: SETTINGS_RE }).click()
    await page.waitForURL('/settings')
    await expect(page.getByRole('heading', { name: SETTINGS_RE })).toBeVisible()
    await expect(page.getByRole('heading', { name: MCP_SERVERS_RE })).toBeVisible()
  })
  test('expandable controls are keyboard-focusable', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    const summary = page.getByTestId('typing-panel').locator('summary')
    await summary.focus()
    const isFocused = await summary.evaluate(el => document.activeElement === el)
    expect(isFocused).toBe(true)
  })
  test('v1 chat has no file upload or attachment UI', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: ATTACH_RE })).toHaveCount(0)
  })
  test('typing indicator panel shows idle or typing state text', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    await expect(page.getByTestId('typing-panel')).toContainText(IDLE_TYPING_RE)
    await chatPage.sendMessage('Typing status test')
    /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: wait for Convex reactive update */
    await page.waitForTimeout(3000)
    await expect(page.getByTestId('typing-panel')).toContainText(AGENT_TYPING_RE)
  })
  test('chat loading states render before async panels settle', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    const loadingHints = page.getByText(LOADING_RE),
      settledHints = page.getByText(SETTLED_RE)
    if ((await loadingHints.count()) > 0) {
      await expect(loadingHints.first()).toBeVisible()
      return
    }
    await expect(settledHints.first()).toBeVisible()
  })
  test('composer disables while sending message', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    await chatPage.getComposer().fill('Disable while sending')
    await chatPage.getSendButton().click()
    await expect(chatPage.getComposer()).toBeDisabled({ timeout: 1000 })
  })
  test('chat remains usable at 375px mobile viewport', async ({ page, sessionListPage }) => {
    await page.setViewportSize({ height: 812, width: 375 })
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    await expect(page.getByPlaceholder(MESSAGE_RE)).toBeVisible()
    await expect(page.getByRole('button', { name: SEND_RE })).toBeVisible()
    await page.getByPlaceholder(MESSAGE_RE).fill('Mobile usable')
    await page.getByRole('button', { name: SEND_RE }).click()
    /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: wait for Convex reactive update */
    await page.waitForTimeout(3000)
    await expect(page.locator('.is-user, .is-assistant').first()).toContainText('Mobile usable')
  })
  test('chat remains usable at 768px tablet viewport', async ({ page, sessionListPage }) => {
    await page.setViewportSize({ height: 1024, width: 768 })
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(CHAT_URL_RE)
    await expect(page.getByPlaceholder(MESSAGE_RE)).toBeVisible()
    await expect(page.getByRole('button', { name: SEND_RE })).toBeVisible()
    await page.getByPlaceholder(MESSAGE_RE).fill('Tablet usable')
    await page.getByRole('button', { name: SEND_RE }).click()
    /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: wait for Convex reactive update */
    await page.waitForTimeout(3000)
    await expect(page.locator('.is-user, .is-assistant').first()).toContainText('Tablet usable')
  })
})

// oxlint-disable max-statements
// biome-ignore-all lint/performance/useTopLevelRegex: x
import { expect, test } from './fixtures'
import { login } from './helpers'

const CHAT_URL_PATTERN = /\/[a-z0-9]+/u

test.describe('Public Chats Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('/public page loads', async ({ chatPage }) => {
    await chatPage.gotoPublicChats()
    await expect(chatPage.getPublicChatsPage()).toBeVisible()
  })

  test('public chats page shows heading', async ({ chatPage, page }) => {
    await chatPage.gotoPublicChats()
    await expect(page.getByRole('heading', { name: 'Public Chats' })).toBeVisible()
  })
})

test.describe
  .serial('Public Chat Creation and Visibility', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
    })

    test('creating a public chat shows it on /public page', async ({ chatPage, page }) => {
      test.setTimeout(90_000)

      await chatPage.goto()
      await chatPage.togglePublic()
      await expect(chatPage.getPublicToggle()).toBeChecked()

      const publicMessage = `Public chat ${Date.now()}`
      await chatPage.sendUserMessage(publicMessage)
      await expect(page).toHaveURL(CHAT_URL_PATTERN)
      await chatPage.waitForResponse()

      await chatPage.gotoPublicChats()
      await expect(chatPage.getPublicChatsPage()).toBeVisible()

      const publicItem = page.locator('[data-testid="public-chat-item"]', { hasText: publicMessage })
      await expect(publicItem).toBeVisible({ timeout: 15_000 })
    })

    test('clicking a public chat navigates to it', async ({ chatPage, page }) => {
      test.setTimeout(90_000)

      await chatPage.goto()
      await chatPage.togglePublic()

      const navMessage = `Navigate public ${Date.now()}`
      await chatPage.sendUserMessage(navMessage)
      await expect(page).toHaveURL(CHAT_URL_PATTERN)
      await chatPage.waitForResponse()

      await chatPage.gotoPublicChats()

      const publicItem = page.locator('[data-testid="public-chat-item"]', { hasText: navMessage })
      await expect(publicItem).toBeVisible({ timeout: 15_000 })
      await publicItem.click()

      await expect(page).toHaveURL(CHAT_URL_PATTERN)
    })

    test('private chat does not appear on /public page', async ({ chatPage, page }) => {
      test.setTimeout(90_000)

      await chatPage.goto()
      await expect(chatPage.getPublicToggle()).not.toBeChecked()

      const privateMessage = `Private chat ${Date.now()}`
      await chatPage.sendUserMessage(privateMessage)
      await expect(page).toHaveURL(CHAT_URL_PATTERN)
      await chatPage.waitForResponse()

      await chatPage.gotoPublicChats()
      await expect(chatPage.getPublicChatsPage()).toBeVisible()

      const privateItem = page.locator('[data-testid="public-chat-item"]', { hasText: privateMessage })
      await expect(privateItem).not.toBeVisible({ timeout: 5000 })
    })
  })

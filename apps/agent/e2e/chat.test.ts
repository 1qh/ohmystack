import { expect, test } from './fixtures'

test.describe
  .serial('Chat & Streaming', () => {
    test('send message shows user row', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await chatPage.sendMessage('Hello agent')
      await page.waitForTimeout(2000)
      await expect(chatPage.getMessages().first()).toContainText('Hello agent', { timeout: 10_000 })
    })

    test('chat log has role=log', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await expect(chatPage.getMessageLog()).toHaveAttribute('role', 'log')
    })

    test('empty chat shows placeholder', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await expect(page.getByText('No messages yet')).toBeVisible()
    })

    test('blank submit is no-op', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await chatPage.getSendButton().click()
      await expect(page.getByText('No messages yet')).toBeVisible()
    })

    test('composer disabled during send', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await chatPage.getComposer().fill('Test message')
      await chatPage.getSendButton().click()
      await expect(chatPage.getComposer()).toBeDisabled({ timeout: 1000 })
    })

    test('header links navigate correctly', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await page.getByRole('link', { name: /sessions/i }).click()
      await page.waitForURL('/')
      await expect(page.getByRole('heading', { name: /sessions/i })).toBeVisible()
    })
  })

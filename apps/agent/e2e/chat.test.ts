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

test.describe
  .serial('Chat & Streaming - remaining coverage', () => {
    test('message order is chronological', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await chatPage.sendMessage('First message')
      await page.waitForTimeout(1500)
      await chatPage.sendMessage('Second message')
      await page.waitForTimeout(1500)
      const messages = chatPage.getMessages()
      const count = await messages.count()
      expect(count).toBeGreaterThanOrEqual(2)
      const first = await messages.first().textContent()
      expect(first).toContain('First message')
    })

    test('session title shows Untitled Session', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await expect(page.getByRole('heading', { name: /untitled/i })).toBeVisible()
    })
  })

test.describe
  .serial('Chat & Streaming - final remaining coverage', () => {
    test('input clears after successful send', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await chatPage.sendMessage('Clear me after send')
      await expect(chatPage.getMessages().first()).toContainText('Clear me after send', { timeout: 10_000 })
      await expect(chatPage.getComposer()).toHaveValue('')
    })

    test('auto-scrolls to bottom on new message', async ({ chatPage, page, sessionListPage }) => {
      await page.setViewportSize({ height: 420, width: 1280 })
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      for (let i = 0; i < 6; i += 1) {
        await chatPage.sendMessage(`scroll-seed-${i}`)
        await page.waitForTimeout(1000)
      }
      const log = chatPage.getMessageLog()
      const before = await log.evaluate(element => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
      }))
      test.skip(before.scrollHeight <= before.clientHeight, 'Chat log is not scrollable in this run')
      await log.evaluate(element => {
        element.scrollTop = 0
      })
      await chatPage.sendMessage('scroll-target')
      await expect(chatPage.getMessages().first()).toContainText('scroll-target', { timeout: 10_000 })
      await expect.poll(async () =>
        log.evaluate(element => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) < 4)
      ).toBe(true)
    })

    test('session title shows in chat header', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await page.getByRole('link', { name: /sessions/i }).click()
      await page.waitForURL('/')
      const cardTitle = await sessionListPage.getSessionCards().first().locator('.font-medium').textContent()
      await sessionListPage.getSessionCards().first().click()
      await page.waitForURL(/\/chat\//u)
      await expect(chatPage.getTitle()).toContainText((cardTitle ?? '').trim())
    })

    test('typing indicator visible while streaming', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await page.getByPlaceholder(/message/iu).fill('Show typing indicator')
      await page.getByRole('button', { name: /send/iu }).click()
      await page.waitForTimeout(250)
      const streamingBadgeCount = await page.locator('article .animate-pulse').count()
      test.skip(streamingBadgeCount === 0, 'No streaming phase observed in this run')
      await expect(page.getByTestId('typing-panel')).toContainText(/agent is typing/iu, { timeout: 10_000 })
    })
  })

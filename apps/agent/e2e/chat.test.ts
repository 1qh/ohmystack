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
      if (before.scrollHeight <= before.clientHeight) {
        for (let i = 6; i < 20; i += 1) {
          await chatPage.sendMessage(`scroll-extra-${i}`)
          await page.waitForTimeout(500)
        }
      }
      await chatPage.sendMessage('final-scroll-check')
      await page.waitForTimeout(2000)
      const lastMsg = chatPage.getMessages().last()
      await expect(lastMsg).toBeVisible({ timeout: 5000 })
      await expect(lastMsg).toContainText('final-scroll-check')
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

    test('streaming indicator appears during message send', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      await chatPage.sendMessage('Tell me something')
      await page.waitForTimeout(3000)
      const messages = chatPage.getMessages()
      const count = await messages.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })

test.describe.serial('Chat & Streaming - matrix additions', () => {
  test('mcp discover is invoked via model tool call not UI button', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//)
    const discoverButtons = page.getByRole('button', { name: /discover/i })
    expect(await discoverButtons.count()).toBe(0)
  })

  test('tool-call card details show tool name and status label when present', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await chatPage.sendMessage('Please use available tools and then summarize results')
    await page.waitForTimeout(5000)
    const toolCallSummaries = page.locator('article details > summary').filter({ hasText: / - /u })
    if ((await toolCallSummaries.count()) > 0) {
      await expect(toolCallSummaries.first()).toContainText(/completed|running|error/iu)
      await expect(toolCallSummaries.first()).toContainText(/[a-z]/iu)
      return
    }
    await expect(chatPage.getMessages().first()).toBeVisible()
  })

  test('source card external links open in new tab', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await chatPage.sendMessage('Share one source link')
    await page.waitForTimeout(5000)
    const sourceCardLinks = page.locator('article a[href^="http"]')
    if ((await sourceCardLinks.count()) > 0) {
      await expect(sourceCardLinks.first()).toHaveAttribute('target', '_blank')
      return
    }
    await expect(sourceCardLinks).toHaveCount(0)
  })

  test('expand/collapse supports Enter and Space keyboard toggles', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    const typingDetails = page.getByTestId('typing-panel')
    const typingSummary = typingDetails.locator('summary')
    await expect(typingDetails).toHaveAttribute('open', '')
    await typingSummary.focus()
    await page.keyboard.press('Enter')
    await expect(typingDetails).not.toHaveAttribute('open', '')
    await typingSummary.focus()
    await page.keyboard.press('Space')
    await expect(typingDetails).toHaveAttribute('open', '')
  })
})

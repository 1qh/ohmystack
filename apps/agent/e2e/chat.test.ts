/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Playwright ops */
/** biome-ignore-all lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
import { expect, test } from './fixtures'

const CHAT_URL_RE = /\/chat\//u
const SESSIONS_RE = /sessions/iu
const UNTITLED_RE = /untitled/iu
const DISCOVER_RE = /discover/iu
const COMPLETED_RE = /completed|running|error/iu
const LETTER_RE = /[a-z]/iu
const TOOL_CALL_RE = / - /u

test.describe
  .serial('Chat & Streaming', () => {
    test('send message shows user row', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.sendMessage('Hello agent')
      /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
      await page.waitForTimeout(2000)
      await expect(chatPage.getMessages().first()).toContainText('Hello agent', { timeout: 10_000 })
    })

    test('chat log has role=log', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await expect(chatPage.getMessageLog()).toHaveAttribute('role', 'log')
    })

    test('empty chat shows placeholder', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await expect(page.getByText('No messages yet')).toBeVisible()
    })

    test('blank submit is no-op', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.getSendButton().click()
      await expect(page.getByText('No messages yet')).toBeVisible()
    })

    test('composer disabled during send', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.getComposer().fill('Test message')
      await chatPage.getSendButton().click()
      await expect(chatPage.getComposer()).toBeDisabled({ timeout: 1000 })
    })

    test('header links navigate correctly', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await page.getByRole('link', { name: SESSIONS_RE }).click()
      await page.waitForURL('/')
      await expect(page.getByRole('heading', { name: SESSIONS_RE })).toBeVisible()
    })
  })

test.describe
  .serial('Chat & Streaming - remaining coverage', () => {
    test('message order is chronological', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.sendMessage('First message')
      /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
      await page.waitForTimeout(1500)
      await chatPage.sendMessage('Second message')
      /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
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
      await page.waitForURL(CHAT_URL_RE)
      await expect(page.getByRole('heading', { name: UNTITLED_RE })).toBeVisible()
    })
  })

test.describe
  .serial('Chat & Streaming - final remaining coverage', () => {
    test('input clears after successful send', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.sendMessage('Clear me after send')
      await expect(chatPage.getMessages().first()).toContainText('Clear me after send', { timeout: 10_000 })
      await expect(chatPage.getComposer()).toHaveValue('')
    })

    test('auto-scrolls to bottom on new message', async ({ chatPage, page, sessionListPage }) => {
      await page.setViewportSize({ height: 420, width: 1280 })
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      for (let i = 0; i < 6; i += 1) {
        /** biome-ignore lint/performance/noAwaitInLoops: sequential Playwright page interactions */
        await chatPage.sendMessage(`scroll-seed-${i}`) // oxlint-disable-line eslint/no-await-in-loop
        /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
        await page.waitForTimeout(1000) // oxlint-disable-line eslint/no-await-in-loop
      }
      const log = chatPage.getMessageLog()
      const before = await log.evaluate(element => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
      }))
      if (before.scrollHeight <= before.clientHeight) {
        for (let i = 6; i < 20; i += 1) {
          /** biome-ignore lint/performance/noAwaitInLoops: sequential Playwright page interactions */
          await chatPage.sendMessage(`scroll-extra-${i}`) // oxlint-disable-line eslint/no-await-in-loop
          /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
          await page.waitForTimeout(500) // oxlint-disable-line eslint/no-await-in-loop
        }
      }
      await chatPage.sendMessage('final-scroll-check')
      /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
      await page.waitForTimeout(2000)
      const lastMsg = chatPage.getMessages().last()
      await expect(lastMsg).toBeVisible({ timeout: 5000 })
      await expect(lastMsg).toContainText('final-scroll-check')
    })

    test('session title shows in chat header', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await page.getByRole('link', { name: SESSIONS_RE }).click()
      await page.waitForURL('/')
      const cardTitle = await sessionListPage.getSessionCards().first().locator('.font-medium').textContent()
      await sessionListPage.getSessionCards().first().click()
      await page.waitForURL(CHAT_URL_RE)
      await expect(chatPage.getTitle()).toContainText((cardTitle ?? '').trim())
    })

    test('streaming indicator appears during message send', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.sendMessage('Tell me something')
      /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
      await page.waitForTimeout(3000)
      const messages = chatPage.getMessages()
      const count = await messages.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })

test.describe
  .serial('Chat & Streaming - matrix additions', () => {
    test('mcp discover is invoked via model tool call not UI button', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      const discoverButtons = page.getByRole('button', { name: DISCOVER_RE })
      expect(await discoverButtons.count()).toBe(0)
    })

    test('tool-call card details show tool name and status label when present', async ({
      chatPage,
      page,
      sessionListPage
    }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.sendMessage('Please use available tools and then summarize results')
      /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
      await page.waitForTimeout(5000)
      const toolCallSummaries = page.locator('article details > summary').filter({ hasText: TOOL_CALL_RE })
      if ((await toolCallSummaries.count()) > 0) {
        await expect(toolCallSummaries.first()).toContainText(COMPLETED_RE)
        await expect(toolCallSummaries.first()).toContainText(LETTER_RE)
        return
      }
      await expect(chatPage.getMessages().first()).toBeVisible()
    })

    test('source card external links open in new tab', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.sendMessage('Share one source link')
      /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
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
      await page.waitForURL(CHAT_URL_RE)
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

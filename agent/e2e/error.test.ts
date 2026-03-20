import type { FunctionReference } from 'convex/server'

import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import { expect, test } from './fixtures'
const convex = new ConvexHttpClient('http://127.0.0.1:3212'),
  CHAT_URL_RE = /\/chat\//u,
  MESSAGE_RE = /message/iu,
  SEND_RE = /send/iu,
  SESSION_ARCHIVED_RE = /session_archived/iu,
  ERROR_INVALID_RE = /error|invalid|not found/iu
test.describe
  .serial('Error States', () => {
    test('submit error is displayed to the user', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      const sessionId = (page.url().split('/chat/')[1] ?? '').trim()
      await convex.mutation(anyApi.sessions.archiveSession as FunctionReference<'mutation'>, {
        sessionId: sessionId as never
      })
      await page.getByPlaceholder(MESSAGE_RE).fill('This should fail')
      await page.getByRole('button', { name: SEND_RE }).click()
      await expect(page.getByTestId('submit-error')).toBeVisible()
      await expect(page.getByTestId('submit-error')).toContainText(SESSION_ARCHIVED_RE)
    })
    test('navigating to nonexistent session shows controlled error state', async ({ page }) => {
      await page.goto('/chat/not-a-convex-id')
      await expect(page.getByText(ERROR_INVALID_RE).first()).toBeVisible()
    })
    test('rate limiting is bypassed in test mode (messages send successfully)', async ({
      chatPage,
      page,
      sessionListPage
    }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.sendMessage('Rate limit test')
      /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
      await page.waitForTimeout(1500)
      await expect(chatPage.getMessages().first()).toContainText('Rate limit test', { timeout: 5000 })
    })
    test('archived-session navigation does not crash', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      const sessionId = (page.url().split('/chat/')[1] ?? '').trim()
      await convex.mutation(anyApi.sessions.archiveSession as FunctionReference<'mutation'>, {
        sessionId: sessionId as never
      })
      await page.goto(`/chat/${sessionId}`)
      /** biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
      await page.waitForTimeout(2000)
      const main = page.locator('main')
      await expect(main).toBeVisible()
    })
  })

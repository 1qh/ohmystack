import { expect, test } from './fixtures'
import { ConvexHttpClient } from 'convex/browser'
import type { FunctionReference } from 'convex/server'
import { anyApi } from 'convex/server'

const convex = new ConvexHttpClient('http://127.0.0.1:3212')

test.describe
  .serial('Error States', () => {
    test('submit error is displayed to the user', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      const sessionId = (page.url().split('/chat/')[1] ?? '').trim()
      await convex.mutation(anyApi.sessions.archiveSession as FunctionReference<'mutation'>, {
        sessionId: sessionId as never
      })
      await page.getByPlaceholder(/message/iu).fill('This should fail')
      await page.getByRole('button', { name: /send/iu }).click()
      await expect(page.getByTestId('submit-error')).toBeVisible()
      await expect(page.getByTestId('submit-error')).toContainText(/session_archived/iu)
    })

    test('navigating to nonexistent session shows controlled error state', async ({ page }) => {
      await page.goto('/chat/not-a-convex-id')
      await expect(page.getByText(/error|invalid|not found/iu).first()).toBeVisible()
    })

    test('rate limiting is bypassed in test mode (messages send successfully)', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//)
      await chatPage.sendMessage('Rate limit test')
      await page.waitForTimeout(1500)
      await expect(chatPage.getMessages().first()).toContainText('Rate limit test', { timeout: 5000 })
    })

    test('archived-session navigation does not crash', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      const sessionId = (page.url().split('/chat/')[1] ?? '').trim()
      await convex.mutation(anyApi.sessions.archiveSession as FunctionReference<'mutation'>, {
        sessionId: sessionId as never
      })
      await page.goto(`/chat/${sessionId}`)
      await page.waitForTimeout(2000)
      const main = page.locator('main')
      await expect(main).toBeVisible()
    })
  })

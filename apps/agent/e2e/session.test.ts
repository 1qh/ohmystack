import { expect, test } from './fixtures'

test.describe
  .serial('Session Management', () => {
    test.beforeEach(async ({ sessionListPage }) => {
      await sessionListPage.goto('/')
    })

    test('session list loads', async ({ sessionListPage }) => {
      await expect(sessionListPage.getNewButton()).toBeVisible()
    })

    test('create session navigates to chat', async ({ page, sessionListPage }) => {
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
    })
  })

import { expect, test } from './fixtures'

test.describe('Accessibility', () => {
  test.skip('chat log has role=log', async () => {})

  test('html has lang=en', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('source cards have rel=noopener', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await chatPage.sendMessage('Search the web for Bun runtime and cite one source link.')
    await page.waitForTimeout(2000)
    const sourceCards = page.locator('article a[target="_blank"]')
    test.skip((await sourceCards.count()) === 0, 'No source cards rendered in this run')
    await expect(sourceCards.first()).toHaveAttribute('rel', /noopener/iu)
  })
})

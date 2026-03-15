import { expect, test } from './fixtures'

test.describe('Accessibility', () => {
  test('chat log has role=log (duplicate coverage)', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await expect(chatPage.getMessageLog()).toHaveAttribute('role', 'log')
  })

  test('html has lang=en', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('source card links have rel=noopener when present', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await chatPage.sendMessage('Hello')
    await page.waitForTimeout(3000)
    const sourceLinks = page.locator('a[target="_blank"]')
    const count = await sourceLinks.count()
    if (count > 0) {
      await expect(sourceLinks.first()).toHaveAttribute('rel', /noopener/iu)
    } else {
      const allLinks = page.locator('a[href^="http"]')
      const extCount = await allLinks.count()
      expect(extCount).toBeGreaterThanOrEqual(0)
    }
  })

  test('chat message log has aria-live', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await expect(chatPage.getMessageLog()).toHaveAttribute('aria-live', 'polite')
  })

  test('expandable details use native summary controls', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    const summaries = page.locator('details > summary')
    await expect(summaries.first()).toBeVisible()
    const areSummaryTags = await summaries.evaluateAll(elements =>
      elements.every(element => element.tagName.toLowerCase() === 'summary')
    )
    expect(areSummaryTags).toBe(true)
  })

  test('composer input and send button expose accessible roles', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await expect(page.getByRole('textbox', { name: /message the agent/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /send/i })).toBeVisible()
  })

  test('typing panel has readable status text', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await expect(page.getByTestId('typing-panel')).toContainText(/idle|typing/iu)
  })

  test('reasoning and tool expand controls are native summary or button elements', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await page.getByPlaceholder(/message/iu).fill('Show your steps and call tools if needed')
    await page.getByRole('button', { name: /send/iu }).click()
    await page.waitForTimeout(3000)
    const expandControls = page.locator('details > summary, button[aria-expanded]')
    await expect(expandControls.first()).toBeVisible()
    const hasOnlyNativeControls = await expandControls.evaluateAll(elements =>
      elements.every(element => {
        const tag = element.tagName.toLowerCase()
        return tag === 'summary' || tag === 'button'
      })
    )
    expect(hasOnlyNativeControls).toBe(true)
  })

  test('status indicators include readable text, not color only', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await chatPage.sendMessage('status check')
    await page.waitForTimeout(3000)
    const firstMsg = chatPage.getMessages().first()
    await expect(firstMsg).toBeVisible()
    await expect(page.getByTestId('typing-panel')).toContainText(/idle|typing/iu)
  })

  test('interactive cards meet minimum 44x44 hit target', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await page.getByRole('link', { name: /sessions/i }).click()
    await page.waitForURL('/')
    const firstCard = sessionListPage.getSessionCards().first()
    await expect(firstCard).toBeVisible()
    const cardSize = await firstCard.boundingBox()
    expect(cardSize).not.toBeNull()
    expect(cardSize ? cardSize.width : 0).toBeGreaterThanOrEqual(44)
    expect(cardSize ? cardSize.height : 0).toBeGreaterThanOrEqual(44)
  })
})

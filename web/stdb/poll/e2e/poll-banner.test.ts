// biome-ignore-all lint/performance/useTopLevelRegex: x
import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('Banner (kv)', () => {
  test.beforeEach(async ({ page, pollPage }) => {
    await login(page)
    await pollPage.goto('/')
    await pollPage.clearBanner().catch(() => null)
  })
  test('saving banner displays message', async ({ pollPage }) => {
    const msg = `Maintenance ${Date.now()}`
    await pollPage.saveBanner(msg, true)
    await expect(pollPage.getBanner()).toContainText(msg, { timeout: 10_000 })
  })
  test('inactive banner is hidden from readers', async ({ page, pollPage }) => {
    await pollPage.saveBanner('hidden', false)
    await expect(page.getByTestId('poll-banner')).toHaveCount(0)
  })
  test('toggling active re-displays banner', async ({ pollPage }) => {
    await pollPage.saveBanner('toggle me', false)
    await pollPage.saveBanner('toggle me', true)
    await expect(pollPage.getBanner()).toContainText('toggle me', { timeout: 10_000 })
  })
  test('banner state reflects current kv row', async ({ pollPage }) => {
    await pollPage.saveBanner('hello', true)
    await expect(pollPage.getBannerState()).toContainText('active=true message=hello', { timeout: 10_000 })
  })
  test('clear banner removes kv row', async ({ pollPage }) => {
    await pollPage.saveBanner('gone soon', true)
    await expect(pollPage.getBanner()).toBeVisible()
    await pollPage.clearBanner()
    await expect(pollPage.getBannerState()).toContainText('no banner', { timeout: 10_000 })
  })
  test('updating banner replaces previous message', async ({ pollPage }) => {
    await pollPage.saveBanner('first', true)
    await pollPage.saveBanner('second', true)
    await expect(pollPage.getBanner()).toContainText('second', { timeout: 10_000 })
    await expect(pollPage.getBanner()).not.toContainText('first')
  })
})

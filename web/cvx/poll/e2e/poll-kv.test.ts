import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('KV factory behaviors', () => {
  test.beforeEach(async ({ pollPage }) => {
    await login()
    await pollPage.goto('/')
  })
  test('set + get reflects current value', async ({ pollPage }) => {
    const msg = `KV ${Date.now()}`
    await pollPage.saveBanner(msg, true)
    await expect(pollPage.getBannerState()).toContainText(msg, { timeout: 10_000 })
  })
  test('rm removes the row entirely', async ({ pollPage }) => {
    await pollPage.saveBanner('will vanish', true)
    await pollPage.clearBanner()
    await expect(pollPage.getBannerState()).toContainText('no banner', { timeout: 10_000 })
  })
  test('active flag controls banner visibility', async ({ page, pollPage }) => {
    await pollPage.saveBanner('off-state', false)
    await expect(page.getByTestId('poll-banner')).toHaveCount(0)
    await pollPage.saveBanner('on-state', true)
    await expect(page.getByTestId('poll-banner')).toBeVisible({ timeout: 10_000 })
  })
  test('multiple rapid updates result in final value', async ({ pollPage }) => {
    await pollPage.saveBanner('v1', true)
    await expect(pollPage.getBannerState()).toContainText('v1', { timeout: 10_000 })
    await pollPage.saveBanner('v2', true)
    await expect(pollPage.getBannerState()).toContainText('v2', { timeout: 10_000 })
    await pollPage.saveBanner('v3', true)
    await expect(pollPage.getBanner()).toContainText('v3', { timeout: 10_000 })
  })
})

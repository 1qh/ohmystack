import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('Quota factory', () => {
  test.beforeEach(async ({ page, pollPage }) => {
    await login(page)
    await pollPage.goto('/')
  })
  test('initial state shows full remaining count', async ({ pollPage }) => {
    const q = `Q-init ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    await expect(pollPage.getQuotaRemaining()).toContainText(/\d+/u)
  })
  test('vote button disables after exceeding limit', async ({ pollPage }) => {
    const q = `Q-disable ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    for (let i = 0; i < 30; i += 1) await pollPage.getVoteButton(0).click()
    await expect(pollPage.getVoteButton(0)).toBeDisabled({ timeout: 10_000 })
  })
  test('quota state independently tracked per parent', async ({ pollPage }) => {
    const t = Date.now()
    const qA = `QA-${t}`
    const qB = `QB-${t}`
    await pollPage.createPoll(qA, ['x', 'y'])
    await pollPage.createPoll(qB, ['x', 'y'])
    await pollPage.openPoll(qA)
    await pollPage.getVoteButton(0).click()
    await pollPage.openPoll(qB)
    await expect(pollPage.getQuotaRemaining()).not.toContainText('quota: 29')
  })
})
test.describe('KV conflict + edge cases', () => {
  test.beforeEach(async ({ page, pollPage }) => {
    await login(page)
    await pollPage.goto('/')
    await pollPage.clearBanner().catch(() => null)
  })
  test('save when no banner exists creates new row', async ({ pollPage }) => {
    await pollPage.saveBanner(`Fresh ${Date.now()}`, true)
    await expect(pollPage.getBannerState()).not.toContainText('no banner', { timeout: 10_000 })
  })
  test('inactive then active toggles banner display', async ({ page, pollPage }) => {
    await pollPage.saveBanner('hidden first', false)
    await expect(page.getByTestId('poll-banner')).toHaveCount(0)
    await pollPage.saveBanner('hidden first', true)
    await expect(page.getByTestId('poll-banner')).toBeVisible({ timeout: 10_000 })
  })
})
test.describe('Log indexed access + scenarios', () => {
  test.beforeEach(async ({ page, pollPage }) => {
    await login(page)
    await pollPage.goto('/')
  })
  test('reopening poll preserves vote state across navigation', async ({ pollPage }) => {
    const q = `Persist ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    await pollPage.getVoteButton(0).click()
    await expect(pollPage.getVoteCount(0)).toContainText('1', { timeout: 10_000 })
    await pollPage.goto('/')
    await pollPage.openPoll(q)
    await expect(pollPage.getVoteCount(0)).toContainText('1', { timeout: 10_000 })
  })
})

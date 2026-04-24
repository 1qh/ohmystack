import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('softDelete + restore', () => {
  test.beforeEach(async ({ page, pollPage }) => {
    await login(page)
    await pollPage.goto('/')
  })
  test('purge votes then restore brings them back', async ({ pollPage }) => {
    const q = `Restore ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    await pollPage.getVoteButton(0).click()
    await pollPage.getVoteButton(0).click()
    await expect(pollPage.getVoteCount(0)).toContainText('2', { timeout: 10_000 })
    await pollPage.getVotePurge().click()
    await expect(pollPage.getVoteCount(0)).toContainText('0', { timeout: 10_000 })
    await pollPage.getVoteRestore().click()
    await expect(pollPage.getVoteCount(0)).toContainText('2', { timeout: 10_000 })
  })
  test('clear banner then restore brings it back', async ({ pollPage }) => {
    const msg = `Resurrect ${Date.now()}`
    await pollPage.saveBanner(msg, true)
    await pollPage.clearBanner()
    await expect(pollPage.getBannerState()).toContainText('no banner', { timeout: 10_000 })
    await pollPage.getBannerRestore().click()
    await expect(pollPage.getBannerState()).toContainText(msg, { timeout: 10_000 })
  })
  test('bulk append adds one vote per option', async ({ pollPage }) => {
    const q = `Bulk ${Date.now()}`
    await pollPage.createPoll(q, ['x', 'y', 'z'])
    await pollPage.openPoll(q)
    await pollPage.getVoteBulk().click()
    await expect(pollPage.getVoteCount(0)).toContainText('1', { timeout: 10_000 })
    await expect(pollPage.getVoteCount(1)).toContainText('1', { timeout: 10_000 })
    await expect(pollPage.getVoteCount(2)).toContainText('1', { timeout: 10_000 })
  })
})

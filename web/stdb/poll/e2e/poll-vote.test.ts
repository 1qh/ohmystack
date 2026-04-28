/* oxlint-disable eslint-plugin-vitest(no-conditional-in-test) */
// biome-ignore-all lint/performance/useTopLevelRegex: x
import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('Vote (log + quota)', () => {
  test.beforeEach(async ({ page, pollPage }) => {
    await login(page)
    await pollPage.goto('/')
  })
  test('vote increments tally for chosen option', async ({ pollPage }) => {
    const q = `Tally ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    await pollPage.getVoteButton(0).click()
    await expect(pollPage.getVoteCount(0)).toContainText('1', { timeout: 10_000 })
  })
  test('multiple votes stack on same option', async ({ pollPage }) => {
    const q = `Stack ${Date.now()}`
    await pollPage.createPoll(q, ['yes', 'no'])
    await pollPage.openPoll(q)
    await pollPage.getVoteButton(0).click()
    await pollPage.getVoteButton(0).click()
    await pollPage.getVoteButton(0).click()
    await expect(pollPage.getVoteCount(0)).toContainText('3', { timeout: 10_000 })
  })
  test('votes on different options are independent', async ({ pollPage }) => {
    const q = `Split ${Date.now()}`
    await pollPage.createPoll(q, ['x', 'y'])
    await pollPage.openPoll(q)
    await pollPage.getVoteButton(0).click()
    await pollPage.getVoteButton(1).click()
    await pollPage.getVoteButton(1).click()
    await expect(pollPage.getVoteCount(0)).toContainText('1', { timeout: 10_000 })
    await expect(pollPage.getVoteCount(1)).toContainText('2', { timeout: 10_000 })
  })
  test('quota remaining decrements with votes', async ({ pollPage }) => {
    const q = `Quota ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    const before = await pollPage.getQuotaRemaining().textContent()
    await pollPage.getVoteButton(0).click()
    await expect(pollPage.getQuotaRemaining()).not.toHaveText(before ?? '', { timeout: 10_000 })
  })
  test('purge clears votes for a poll', async ({ pollPage }) => {
    const q = `Purge ${Date.now()}`
    await pollPage.createPoll(q, ['u', 'v'])
    await pollPage.openPoll(q)
    await pollPage.getVoteButton(0).click()
    await expect(pollPage.getVoteCount(0)).toContainText('1', { timeout: 10_000 })
    await pollPage.getVotePurge().click()
    await expect(pollPage.getVoteCount(0)).toContainText('0', { timeout: 10_000 })
  })
  test('votes are scoped to the poll (parent isolation)', async ({ pollPage }) => {
    const qA = `Iso-A ${Date.now()}`
    const qB = `Iso-B ${Date.now()}`
    await pollPage.createPoll(qA, ['a', 'b'])
    await pollPage.createPoll(qB, ['a', 'b'])
    await pollPage.openPoll(qA)
    await pollPage.getVoteButton(0).click()
    await expect(pollPage.getVoteCount(0)).toContainText('1', { timeout: 10_000 })
    await pollPage.openPoll(qB)
    await expect(pollPage.getVoteCount(0)).toContainText('0', { timeout: 10_000 })
  })
})

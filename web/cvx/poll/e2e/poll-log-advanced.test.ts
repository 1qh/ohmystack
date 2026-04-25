import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('Log factory advanced', () => {
  test.beforeEach(async ({ pollPage }) => {
    await login()
    await pollPage.goto('/')
  })
  test('bulk append adds one vote per option in single call', async ({ pollPage }) => {
    const q = `Bulk ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    await pollPage.getVoteBulk().click()
    await expect(pollPage.getVoteCount(0)).toContainText('1', { timeout: 10_000 })
    await expect(pollPage.getVoteCount(1)).toContainText('1', { timeout: 10_000 })
  })
  test('restore brings back purged votes (softDelete semantics)', async ({ pollPage }) => {
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
  test('bulk + restore are independent of single append', async ({ pollPage }) => {
    const q = `Mixed ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    await pollPage.getVoteButton(0).click()
    await pollPage.getVoteBulk().click()
    await expect(pollPage.getVoteCount(0)).toContainText('2', { timeout: 10_000 })
    await expect(pollPage.getVoteCount(1)).toContainText('1', { timeout: 10_000 })
    await pollPage.getVotePurge().click()
    await expect(pollPage.getVoteCount(0)).toContainText('0', { timeout: 10_000 })
    await pollPage.getVoteRestore().click()
    await expect(pollPage.getVoteCount(0)).toContainText('2', { timeout: 10_000 })
    await expect(pollPage.getVoteCount(1)).toContainText('1', { timeout: 10_000 })
  })
})

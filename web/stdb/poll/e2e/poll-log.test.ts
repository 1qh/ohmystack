import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('Log factory behaviors', () => {
  test.beforeEach(async ({ page, pollPage }) => {
    await login(page)
    await pollPage.goto('/')
  })
  test('seq increases monotonically per parent (via tally ordering)', async ({ pollPage }) => {
    const q = `Seq ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    await pollPage.getVoteButton(0).click()
    await pollPage.getVoteButton(1).click()
    await pollPage.getVoteButton(0).click()
    await expect(pollPage.getVoteCount(0)).toContainText('2', { timeout: 10_000 })
    await expect(pollPage.getVoteCount(1)).toContainText('1', { timeout: 10_000 })
  })
  test('purge empties the log for this parent only', async ({ pollPage }) => {
    const qA = `LogA-${Date.now()}`
    const qB = `LogB-${Date.now()}`
    await pollPage.createPoll(qA, ['a', 'b'])
    await pollPage.createPoll(qB, ['a', 'b'])
    await pollPage.openPoll(qA)
    await pollPage.getVoteButton(0).click()
    await pollPage.openPoll(qB)
    await pollPage.getVoteButton(0).click()
    await pollPage.openPoll(qA)
    await pollPage.getVotePurge().click()
    await expect(pollPage.getVoteCount(0)).toContainText('0', { timeout: 10_000 })
    const bItem = pollPage.getPollItems().filter({ hasText: qB }).first()
    await bItem.getByRole('button', { name: qB }).click()
    await expect(bItem.getByTestId('vote-count-0')).toContainText('1', { timeout: 10_000 })
  })
  test('opening unopened poll shows 0 counts (no stale reuse)', async ({ pollPage }) => {
    const q = `Fresh ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    await expect(pollPage.getVoteCount(0)).toContainText('0')
    await expect(pollPage.getVoteCount(1)).toContainText('0')
  })
  test('vote button disabled when quota exhausted', async ({ pollPage }) => {
    const q = `Limit ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    for (let i = 0; i < 30; i += 1) await pollPage.getVoteButton(0).click()
    await expect(pollPage.getVoteButton(0)).toBeDisabled({ timeout: 10_000 })
  })
})

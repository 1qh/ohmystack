import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('Poll factories e2e', () => {
  test.beforeEach(async ({ pollPage }) => {
    await login()
    await pollPage.goto('/')
  })
  test('renders poll page', async ({ page }) => {
    await expect(page.getByTestId('poll-page')).toBeVisible()
  })
  test('can create a poll and see it listed', async ({ pollPage }) => {
    const question = `Test poll ${Date.now()}`
    await pollPage.createPoll(question, ['yes', 'no'])
    await expect(pollPage.getPollItems().filter({ hasText: question })).toHaveCount(1, { timeout: 10_000 })
  })
  test('can vote on a poll option and see tally', async ({ page, pollPage }) => {
    const question = `Vote poll ${Date.now()}`
    await pollPage.createPoll(question, ['alpha', 'beta'])
    const item = pollPage.getPollItems().filter({ hasText: question }).first()
    await item.getByRole('button', { name: question }).click()
    await expect(pollPage.getVoteView()).toBeVisible()
    await pollPage.getVoteButton(0).click()
    await expect(page.getByText('1 votes').first()).toBeVisible({ timeout: 10_000 })
  })
})

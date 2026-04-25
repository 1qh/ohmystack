// biome-ignore-all lint/performance/useTopLevelRegex: x
import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('Poll UX polish', () => {
  test.beforeEach(async ({ pollPage }) => {
    await login()
    await pollPage.goto('/')
  })
  test('poll card shows relative timestamp', async ({ pollPage }) => {
    const q = `Time ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    await expect(item.getByTestId('poll-card-time')).toContainText(/(?:ago|less than a minute)/u, { timeout: 10_000 })
  })
  test('poll card question is clickable as a separate element', async ({ pollPage }) => {
    const q = `Click ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    await expect(item.getByTestId('poll-card-question')).toContainText(q)
  })
  test('option count badge reflects number of options', async ({ pollPage }) => {
    const q = `Badge ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b', 'c', 'd'])
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    await expect(item).toContainText(/4 options/u, { timeout: 10_000 })
  })
  test('singular vote/votes pluralization', async ({ pollPage }) => {
    const q = `Plural ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await pollPage.openPoll(q)
    await expect(pollPage.getVoteCount(0)).toContainText('0 votes')
    await pollPage.getVoteButton(0).click()
    await expect(pollPage.getVoteCount(0)).toContainText('1 vote', { timeout: 10_000 })
    await pollPage.getVoteButton(0).click()
    await expect(pollPage.getVoteCount(0)).toContainText('2 votes', { timeout: 10_000 })
  })
  test('optimistic delete removes card before backend confirms', async ({ page, pollPage }) => {
    const q = `Optim ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    await item.getByTestId(/poll-delete-/u).click()
    await page.getByRole('button', { exact: true, name: 'Delete' }).click()
    await expect(page.getByTestId('poll-item').filter({ hasText: q })).toHaveCount(0, { timeout: 2000 })
  })
  test('progress bar renders for each option', async ({ pollPage }) => {
    const q = `Bars ${Date.now()}`
    await pollPage.createPoll(q, ['x', 'y'])
    await pollPage.openPoll(q)
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    const bars = item.locator('[role="progressbar"]')
    await expect(bars).toHaveCount(2, { timeout: 10_000 })
  })
})

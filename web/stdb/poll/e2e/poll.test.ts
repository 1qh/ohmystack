// biome-ignore-all lint/performance/useTopLevelRegex: x
import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('Poll page', () => {
  test.beforeEach(async ({ page, pollPage }) => {
    await login(page)
    await pollPage.goto('/')
  })
  test('renders poll page', async ({ page }) => {
    await expect(page.getByTestId('poll-page')).toBeVisible()
  })
  test('shows create form', async ({ pollPage }) => {
    await expect(pollPage.getQuestionInput()).toBeVisible()
    await expect(pollPage.getOptionsTagInput()).toBeVisible()
    await expect(pollPage.getCreateSubmit()).toBeVisible()
  })
  test('shows search input', async ({ pollPage }) => {
    await expect(pollPage.getSearchInput()).toBeVisible()
  })
  test('shows banner admin panel', async ({ page }) => {
    await expect(page.getByTestId('banner-admin')).toBeVisible()
  })
})
test.describe('Poll CRUD', () => {
  test.beforeEach(async ({ page, pollPage }) => {
    await login(page)
    await pollPage.goto('/')
  })
  test('can create a poll with 2 options', async ({ pollPage }) => {
    const q = `Create ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    await expect(pollPage.getPollItems().filter({ hasText: q })).toHaveCount(1, { timeout: 10_000 })
  })
  test('can create poll with multiple options', async ({ pollPage }) => {
    const q = `Multi ${Date.now()}`
    await pollPage.createPoll(q, ['one', 'two', 'three', 'four'])
    await expect(pollPage.getPollItems().filter({ hasText: q })).toHaveCount(1, { timeout: 10_000 })
  })
  test('form validates required question', async ({ page, pollPage }) => {
    await pollPage.getCreateSubmit().click()
    await expect(pollPage.getQuestionInput()).toBeVisible()
    await expect(page.locator('[data-invalid="true"]').first()).toBeVisible()
  })
  test('can delete a poll', async ({ page, pollPage }) => {
    const q = `Del ${Date.now()}`
    await pollPage.createPoll(q, ['yes', 'no'])
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    await item.getByTestId(/poll-delete-/u).click()
    await expect(page.getByTestId('poll-item').filter({ hasText: q })).toHaveCount(0, { timeout: 10_000 })
  })
  test('created poll shows both options to vote', async ({ pollPage }) => {
    const q = `Opts ${Date.now()}`
    await pollPage.createPoll(q, ['alpha', 'beta'])
    await pollPage.openPoll(q)
    await expect(pollPage.getVoteButton(0)).toBeVisible()
    await expect(pollPage.getVoteButton(1)).toBeVisible()
  })
  test('polls list updates immediately after create', async ({ pollPage }) => {
    const q = `Live ${Date.now()}`
    await pollPage.createPoll(q, ['x', 'y'])
    await expect(pollPage.getPollItems().filter({ hasText: q })).toHaveCount(1, { timeout: 10_000 })
  })
})

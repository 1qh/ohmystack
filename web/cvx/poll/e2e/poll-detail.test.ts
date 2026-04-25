// biome-ignore-all lint/performance/useTopLevelRegex: x
import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('Poll detail page', () => {
  test.beforeEach(async ({ pollPage }) => {
    await login()
    await pollPage.goto('/')
  })
  test('clicking question navigates to detail page', async ({ page, pollPage }) => {
    const q = `Detail ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    const href = await item.getByTestId(/poll-edit-/u).getAttribute('href')
    expect(href).toMatch(/^\/.+\/edit$/u)
    const id = (href ?? '').replace(/^\//u, '').replace(/\/edit$/u, '')
    await page.goto(`/${id}`)
    await expect(page.getByTestId('poll-detail-page')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('poll-detail-question')).toContainText(q)
  })
  test('detail page lists all options', async ({ page, pollPage }) => {
    const q = `Opts ${Date.now()}`
    await pollPage.createPoll(q, ['alpha', 'beta', 'gamma'])
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    const href = await item.getByTestId(/poll-edit-/u).getAttribute('href')
    const id = (href ?? '').replace(/^\//u, '').replace(/\/edit$/u, '')
    await page.goto(`/${id}`)
    const options = page.getByTestId('poll-detail-options').getByRole('listitem')
    await expect(options).toHaveCount(3)
  })
  test('back link returns to list', async ({ page, pollPage }) => {
    const q = `Back ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    const href = await item.getByTestId(/poll-edit-/u).getAttribute('href')
    const id = (href ?? '').replace(/^\//u, '').replace(/\/edit$/u, '')
    await page.goto(`/${id}`)
    await page.getByTestId('detail-back').click()
    await expect(page).toHaveURL('/')
  })
  test('detail page shows creation timestamp', async ({ page, pollPage }) => {
    const q = `When ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    const href = await item.getByTestId(/poll-edit-/u).getAttribute('href')
    const id = (href ?? '').replace(/^\//u, '').replace(/\/edit$/u, '')
    await page.goto(`/${id}`)
    await expect(page.getByTestId('poll-detail-time')).toContainText(/Created/u, { timeout: 10_000 })
  })
})
test.describe('Poll edit page', () => {
  test.beforeEach(async ({ pollPage }) => {
    await login()
    await pollPage.goto('/')
  })
  test('edit page loads with current question', async ({ page, pollPage }) => {
    const q = `Editable ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    await item.getByTestId(/poll-edit-/u).click()
    await expect(page.getByTestId('poll-edit-page')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('edit-poll-question').locator('input')).toHaveValue(q)
  })
  test('saving updates question', async ({ page, pollPage }) => {
    const q = `Original ${Date.now()}`
    const updated = `Updated ${Date.now()}`
    await pollPage.createPoll(q, ['a', 'b'])
    const item = pollPage.getPollItems().filter({ hasText: q }).first()
    await item.getByTestId(/poll-edit-/u).click()
    await page.getByTestId('edit-poll-question').locator('input').fill(updated)
    await page.getByTestId('edit-poll-submit').click()
    await page.getByTestId('edit-back').click()
    await pollPage.goto('/')
    await expect(pollPage.getPollItems().filter({ hasText: updated })).toHaveCount(1, { timeout: 10_000 })
  })
})

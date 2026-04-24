// biome-ignore-all lint/performance/useTopLevelRegex: x
import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('Poll search', () => {
  test.beforeEach(async ({ page, pollPage }) => {
    await login(page)
    await pollPage.goto('/')
  })
  test('filter by matching query', async ({ pollPage }) => {
    const tag = `Tag${Date.now()}`
    await pollPage.createPoll(`Alpha ${tag}`, ['a', 'b'])
    await pollPage.createPoll('Beta unrelated', ['a', 'b'])
    await pollPage.getSearchInput().fill(tag)
    await expect(pollPage.getPollItems()).toHaveCount(1, { timeout: 10_000 })
  })
  test('empty query shows all polls', async ({ pollPage }) => {
    await pollPage.createPoll(`Foo ${Date.now()}`, ['a', 'b'])
    await pollPage.getSearchInput().fill('xyz-nope')
    await pollPage.getSearchInput().fill('')
    const count = await pollPage.getPollItems().count()
    expect(count).toBeGreaterThanOrEqual(1)
  })
  test('search is case-insensitive', async ({ pollPage }) => {
    const tag = `Insensitive${Date.now()}`
    await pollPage.createPoll(`${tag} title`, ['a', 'b'])
    await pollPage.getSearchInput().fill(tag.toLowerCase())
    await expect(pollPage.getPollItems().filter({ hasText: tag })).toHaveCount(1, { timeout: 10_000 })
  })
  test('clearing search shows all again', async ({ pollPage }) => {
    await pollPage.createPoll(`Clear ${Date.now()}`, ['a', 'b'])
    await pollPage.getSearchInput().fill('no-match-string')
    await expect(pollPage.getPollItems()).toHaveCount(0)
    await pollPage.getSearchInput().fill('')
    const after = await pollPage.getPollItems().count()
    expect(after).toBeGreaterThanOrEqual(1)
  })
})

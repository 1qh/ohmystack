import { expect, test } from './fixtures'
import { login } from './helpers'
test.describe('Poll list pagination', () => {
  test.beforeEach(async ({ pollPage }) => {
    await login()
    await pollPage.goto('/')
  })
  test('list renders at least 1 poll after create', async ({ pollPage }) => {
    await pollPage.createPoll(`Pg ${Date.now()}`, ['a', 'b'])
    const count = await pollPage.getPollItems().count()
    expect(count).toBeGreaterThanOrEqual(1)
  })
})

import { test as baseTest, expect } from '@a/e2e/base-test'
import PollPage from './pages/poll'
interface Fixtures {
  pollPage: PollPage
}
const test = baseTest.extend<Fixtures>({
  pollPage: async ({ page }, run) => {
    const pollPage = new PollPage(page)
    await run(pollPage)
  }
})
export { expect, test }

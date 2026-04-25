import { test as baseTest, expect } from '@a/e2e/base-test'
import PollPage from './pages/poll'
import ProfilePage from './pages/profile'
interface Fixtures {
  pollPage: PollPage
  profilePage: ProfilePage
}
const test = baseTest.extend<Fixtures>({
  pollPage: async ({ page }, run) => {
    const pollPage = new PollPage(page)
    await run(pollPage)
  },
  profilePage: async ({ page }, run) => {
    const profilePage = new ProfilePage(page)
    await run(profilePage)
  }
})
export { expect, test }

import { test as baseTest, expect } from '@a/e2e/base-test'

import BlogPage from './pages/blog'
import ProfilePage from './pages/profile'

interface Fixtures {
  blogPage: BlogPage
  profilePage: ProfilePage
}

const test = baseTest.extend<Fixtures>({
  blogPage: async ({ page }, run) => {
    const blogPage = new BlogPage(page)
    await run(blogPage)
  },
  profilePage: async ({ page }, run) => {
    const profilePage = new ProfilePage(page)
    await run(profilePage)
  }
})

export { expect, test }

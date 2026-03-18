import { test as baseTest, expect } from '@a/e2e/base-test'

import ChatPage from './pages/chat'
import SessionListPage from './pages/session-list'

interface Fixtures {
  chatPage: ChatPage
  sessionListPage: SessionListPage
}

const test = baseTest.extend<Fixtures>({
  chatPage: async ({ page }, run) => {
    await run(new ChatPage(page))
  },
  sessionListPage: async ({ page }, run) => {
    await run(new SessionListPage(page))
  }
})

export { expect, test }

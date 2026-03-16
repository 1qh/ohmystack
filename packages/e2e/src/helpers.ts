import { api, ensureTestUser, tc } from './org-helpers'

const login = async () => {
    await ensureTestUser()
  },
  cleanupTestData = async () => {
    await ensureTestUser()
    let result = await tc.mutation(api.testauth.cleanupTestData, {})
    while (!result.done) {
      /** biome-ignore lint/performance/noAwaitInLoops: sequential cleanup required */
      // oxlint-disable-next-line eslint/no-await-in-loop
      result = await tc.mutation(api.testauth.cleanupTestData, {})
    }
  }

export { cleanupTestData, login }

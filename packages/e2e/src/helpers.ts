import { api, ensureTestUser, tc } from './org-helpers'

const login = async () => {
    await ensureTestUser()
  },
  cleanupTestData = async () => {
    await ensureTestUser()
    let result = await tc.mutation(api.testauth.cleanupTestData, {})
    while (!result.done) result = await tc.mutation(api.testauth.cleanupTestData, {})
  }

export { cleanupTestData, login }

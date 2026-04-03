/* eslint-disable no-await-in-loop */
import { api, ensureTestUser, tc } from './org-helpers'
const login = async () => {
  await ensureTestUser()
}
const cleanupTestData = async () => {
  await ensureTestUser()
  let result = await tc.mutation(api.testauth.cleanupTestData, {})
  while (!result.done)
    /** biome-ignore lint/performance/noAwaitInLoops: sequential cleanup required */
    result = await tc.mutation(api.testauth.cleanupTestData, {})
}
export { cleanupTestData, login }

import { createStdbLogin } from '@a/e2e/stdb-helpers'
const { cleanupTestData, login } = createStdbLogin(import.meta.dirname)
export { cleanupTestData, login }

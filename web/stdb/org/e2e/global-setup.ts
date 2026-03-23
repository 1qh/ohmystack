import { ensureTestUser } from './helpers'
const globalSetup = async () => {
  await ensureTestUser()
}
export default globalSetup

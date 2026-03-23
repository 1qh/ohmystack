import { cleanupTestData } from './helpers'
const globalSetup = async () => {
  await cleanupTestData()
}
export default globalSetup

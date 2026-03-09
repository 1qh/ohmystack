/** biome-ignore-all lint/style/noProcessEnv: env detection in test teardown */
/* eslint-disable no-console */
import { execSync } from 'node:child_process'

const globalTeardown = () => {
  if (process.env.SKIP_CONVEX_ENV_TOGGLE) return

  try {
    execSync('bun with-env convex env remove CONVEX_TEST_MODE', { cwd: '../../packages/be', stdio: 'pipe' })
    console.log('CONVEX_TEST_MODE disabled on server')
  } catch {
    console.log('CONVEX_TEST_MODE was not set (already clean)')
  }
}

export default globalTeardown

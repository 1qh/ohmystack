/** biome-ignore-all lint/style/noProcessEnv: env detection in test teardown */
/* eslint-disable no-console */
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { config } from '@a/config'
const BACKEND_CWD = join(resolve(import.meta.dirname, '../../..'), config.paths.backendConvex)
const globalTeardown = () => {
  if (process.env.SKIP_CONVEX_ENV_TOGGLE) return
  try {
    execSync('nb-env convex env remove CONVEX_TEST_MODE', { cwd: BACKEND_CWD, stdio: 'pipe' })
    console.log('CONVEX_TEST_MODE disabled on server')
  } catch {
    console.log('CONVEX_TEST_MODE was not set (already clean)')
  }
}
export default globalTeardown

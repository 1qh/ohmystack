/** biome-ignore-all lint/style/noProcessEnv: env detection in test setup */
/* eslint-disable no-console, no-await-in-loop */
import type { FunctionReference } from 'convex/server'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { config } from '../../../noboil.config'
const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const BACKEND_CWD = join(REPO_ROOT, config.paths.backendConvex)
const parseEnvLine = (line: string): [string, string] | null => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 1) return null
  const key = trimmed.slice(0, eqIdx)
  let val = trimmed.slice(eqIdx + 1)
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
  return [key, val]
}
const loadRootEnv = () => {
  const envPath = join(REPO_ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const parsed = parseEnvLine(line)
    if (parsed && !process.env[parsed[0]]) process.env[parsed[0]] = parsed[1]
  }
}
interface CleanupResult {
  count: number
  done: boolean
}
const setConvexTestMode = (enabled: boolean) => {
  const cmd = enabled ? 'convex env set CONVEX_TEST_MODE true' : 'convex env remove CONVEX_TEST_MODE'
  try {
    execSync(`bun with-env ${cmd}`, { cwd: BACKEND_CWD, stdio: 'pipe' })
    console.log(`CONVEX_TEST_MODE ${enabled ? 'enabled' : 'disabled'} on server`)
  } catch (error) {
    if (enabled) throw new Error('Failed to set CONVEX_TEST_MODE on Convex server', { cause: error })
  }
}
const cleanup = async (client: ConvexHttpClient): Promise<CleanupResult> =>
  client.mutation(anyApi.testauth?.cleanupTestData as FunctionReference<'mutation'>, {}) as Promise<CleanupResult>
const globalSetup = async () => {
  loadRootEnv()
  if (!process.env.SKIP_CONVEX_ENV_TOGGLE) setConvexTestMode(true)
  const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? ''
  if (!convexUrl) throw new Error('CONVEX_URL or NEXT_PUBLIC_CONVEX_URL not set')
  const client = new ConvexHttpClient(convexUrl)
  await client.mutation(anyApi.testauth?.ensureTestUser as FunctionReference<'mutation'>, {})
  let result = await cleanup(client)
  while (!result.done) {
    console.log(`Cleaned up ${result.count} test records, continuing...`)
    /** biome-ignore lint/performance/noAwaitInLoops: sequential cleanup required */
    result = await cleanup(client)
  }
  console.log('Test data cleanup complete')
}
export default globalSetup

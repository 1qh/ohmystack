/** biome-ignore-all lint/style/noProcessEnv: env detection in test setup */
/* eslint-disable no-console */
import type { FunctionReference } from 'convex/server'

import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import { execSync } from 'node:child_process'

interface CleanupResult {
  count: number
  done: boolean
}

const setConvexTestMode = (enabled: boolean) => {
    const cmd = enabled ? 'convex env set CONVEX_TEST_MODE true' : 'convex env remove CONVEX_TEST_MODE'
    try {
      execSync(`bun with-env ${cmd}`, { cwd: '../../packages/be', stdio: 'pipe' })
      console.log(`CONVEX_TEST_MODE ${enabled ? 'enabled' : 'disabled'} on server`)
    } catch (error) {
      if (enabled) throw new Error('Failed to set CONVEX_TEST_MODE on Convex server', { cause: error })
    }
  },
  cleanup = async (client: ConvexHttpClient): Promise<CleanupResult> =>
    client.mutation(anyApi.testauth?.cleanupTestData as FunctionReference<'mutation'>, {}) as Promise<CleanupResult>,
  globalSetup = async () => {
    if (!process.env.SKIP_CONVEX_ENV_TOGGLE) setConvexTestMode(true)

    const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? ''
    if (!convexUrl) throw new Error('CONVEX_URL or NEXT_PUBLIC_CONVEX_URL not set')

    const client = new ConvexHttpClient(convexUrl)

    await client.mutation(anyApi.testauth?.ensureTestUser as FunctionReference<'mutation'>, {})

    let result = await cleanup(client)
    while (!result.done) {
      console.log(`Cleaned up ${result.count} test records, continuing...`)

      result = await cleanup(client)
    }
    console.log('Test data cleanup complete')
  }

export default globalSetup

/** biome-ignore-all lint/style/noProcessEnv: playwright global setup reads injected env */
import type { FunctionReference } from 'convex/server'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import { execSync } from 'node:child_process'
const readEnvUrl = ({ fallback, key }: { fallback: string; key: 'NEXT_PUBLIC_CONVEX_URL' }) => {
    const raw = process.env[key],
      candidate = typeof raw === 'string' && raw.trim().length > 0 ? raw : fallback
    return URL.canParse(candidate) ? candidate : fallback
  },
  globalSetup = async () => {
    try {
      execSync('bun with-env convex env set CONVEX_TEST_MODE true', {
        cwd: '../../backend/agent',
        stdio: 'pipe'
      })
    } catch (error) {
      globalThis.console.debug(String(error))
    }
    const convexUrl = readEnvUrl({ fallback: 'http://127.0.0.1:4001', key: 'NEXT_PUBLIC_CONVEX_URL' }),
      client = new ConvexHttpClient(convexUrl)
    await client.mutation(anyApi.testauth?.ensureTestUser as FunctionReference<'mutation'>, {})
  }
export default globalSetup

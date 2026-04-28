/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/* eslint-disable no-await-in-loop */
import { config } from '@a/config'
/* oxlint-disable no-await-in-loop */
import { $ } from 'bun'
import { readEnv, root } from './utils'
const setEnv = async (k: string, v: string) => {
  const proc = await $`cd ${config.paths.backendConvex} && nb-env npx convex env set ${k} -- ${v}`
    .cwd(root)
    .quiet()
    .nothrow()
  if (proc.exitCode !== 0) throw new Error(`convex env set ${k} failed: ${proc.stderr.toString()}`)
}
interface SyncOpts {
  jwks?: string
  pem?: string
}
const syncConvexEnv = async ({ jwks, pem }: SyncOpts = {}) => {
  const env = readEnv()
  for (const [k, v] of [
    ['TMDB_KEY', env.TMDB_KEY],
    ['AUTH_GOOGLE_ID', env.AUTH_GOOGLE_ID],
    ['AUTH_GOOGLE_SECRET', env.AUTH_GOOGLE_SECRET]
  ] as const)
    if (v) await setEnv(k, v)
  await setEnv('CONVEX_TEST_MODE', 'true')
  await setEnv('CI', '')
  if (!env.SITE_URL) throw new Error('SITE_URL missing from .env (setup should have set it)')
  await setEnv('SITE_URL', env.SITE_URL)
  if (jwks && pem) {
    await setEnv('JWKS', jwks)
    await setEnv('JWT_PRIVATE_KEY', pem.trimEnd())
  }
}
if (import.meta.main) await syncConvexEnv()
export { syncConvexEnv }

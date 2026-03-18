// biome-ignore-all lint/style/noProcessEnv: env validation

import { createEnv } from '@t3-oss/env-core'
import { string } from 'zod/v4'

if (process.env.CONVEX_CLOUD_URL?.includes('.convex.cloud') && process.env.CONVEX_TEST_MODE === 'true')
  throw new Error('FATAL: CONVEX_TEST_MODE must not be enabled on production deployments')

export default createEnv({
  runtimeEnv: process.env,
  server: {
    AUTH_GOOGLE_ID: string(),
    AUTH_GOOGLE_SECRET: string(),
    AUTH_SECRET: string(),
    GOOGLE_VERTEX_API_KEY: string().min(1)
  },
  skipValidation: process.env.npm_lifecycle_event === 'lint' || Boolean(process.env.CONVEX_TEST_MODE)
})

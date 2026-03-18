// biome-ignore-all lint/style/noProcessEnv: x

import { createEnv } from '@t3-oss/env-core'
import { string } from 'zod/v4'

export default createEnv({
  runtimeEnv: process.env,
  server: {
    TMDB_KEY: string()
  },
  skipValidation:
    Boolean(process.env.CI) || Boolean(process.env.CONVEX_TEST_MODE) || process.env.npm_lifecycle_event === 'lint'
})

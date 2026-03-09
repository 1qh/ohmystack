// biome-ignore-all lint/style/noProcessEnv: x

import { createEnv } from '@t3-oss/env-nextjs'
import { vercel } from '@t3-oss/env-nextjs/presets-zod'
import { literal, string, url, enum as zenum } from 'zod/v4'

export default createEnv({
  client: {
    NEXT_PUBLIC_CONVEX_URL: url().default('http://127.0.0.1:3210'),
    NEXT_PUBLIC_PLAYWRIGHT: literal('1').or(string().max(0)).optional()
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_PLAYWRIGHT: process.env.NEXT_PUBLIC_PLAYWRIGHT,
    NODE_ENV: process.env.NODE_ENV
  },
  extends: [vercel()],
  server: {},
  shared: {
    NODE_ENV: zenum(['development', 'production', 'test']).default('development')
  },
  skipValidation: Boolean(process.env.CI) || process.env.npm_lifecycle_event === 'lint'
})

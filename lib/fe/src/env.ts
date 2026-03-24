// biome-ignore-all lint/style/noProcessEnv: x
import { createEnv } from '@t3-oss/env-nextjs'
import { vercel } from '@t3-oss/env-nextjs/presets-zod'
import { literal, string, url, enum as zenum } from 'zod/v4'
export default createEnv({
  client: {
    NEXT_PUBLIC_CONVEX_URL: url().default('http://127.0.0.1:4001'),
    NEXT_PUBLIC_PLAYWRIGHT: literal('1').or(string().max(0)).optional(),
    NEXT_PUBLIC_SPACETIMEDB_OIDC_CLIENT_ID: string().default('noboil'),
    NEXT_PUBLIC_SPACETIMEDB_URI: url().default('ws://127.0.0.1:4000')
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_PLAYWRIGHT: process.env.NEXT_PUBLIC_PLAYWRIGHT,
    NEXT_PUBLIC_SPACETIMEDB_OIDC_CLIENT_ID: process.env.NEXT_PUBLIC_SPACETIMEDB_OIDC_CLIENT_ID,
    NEXT_PUBLIC_SPACETIMEDB_URI: process.env.NEXT_PUBLIC_SPACETIMEDB_URI,
    NODE_ENV: process.env.NODE_ENV,
    SPACETIMEDB_MODULE_NAME: process.env.SPACETIMEDB_MODULE_NAME
  },
  extends: [vercel()],
  server: {},
  shared: {
    NODE_ENV: zenum(['development', 'production', 'test']).default('development'),
    SPACETIMEDB_MODULE_NAME: string().default('noboil')
  },
  skipValidation: Boolean(process.env.CI) || process.env.npm_lifecycle_event === 'lint'
})

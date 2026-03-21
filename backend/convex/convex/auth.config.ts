// biome-ignore-all lint/style/noProcessEnv: x
import type { AuthConfig } from 'convex/server'
import env from '../env'
export default {
  providers: [
    {
      applicationID: 'convex',
      domain: env.CONVEX_SITE_URL ?? ''
    }
  ]
} satisfies AuthConfig

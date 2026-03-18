// biome-ignore-all lint/style/noProcessEnv: x
import type { AuthConfig } from 'convex/server'

export default {
  providers: [
    {
      applicationID: 'convex',

      domain: process.env.CONVEX_SITE_URL ?? ''
    }
  ]
} satisfies AuthConfig

// biome-ignore-all lint/style/noProcessEnv: x
import type { AuthConfig } from 'convex/server'

export default {
  providers: [
    {
      applicationID: 'convex',
      // eslint-disable-next-line no-restricted-properties
      domain: process.env.CONVEX_SITE_URL ?? ''
    }
  ]
} satisfies AuthConfig

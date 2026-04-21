import { env as nodeEnv } from 'node:process'
import type { CreateNextConfigOptions } from './next-config-core'
import { createNextConfigWithCsp } from './next-config-core'
const isDev = nodeEnv.NODE_ENV === 'development'
const spacetimeDbUri = nodeEnv.NEXT_PUBLIC_SPACETIMEDB_URI
const createNextConfig = ({ experimental, imageDomains, imgSrc }: CreateNextConfigOptions = {}) =>
  createNextConfigWithCsp({
    csp: {
      connectSrc: isDev
        ? [
            "'self'",
            'https://auth.spacetimedb.com',
            'http://localhost:*',
            'ws://localhost:*',
            'http://127.0.0.1:*',
            'ws://127.0.0.1:*'
          ]
        : ["'self'", 'https://auth.spacetimedb.com', ...(spacetimeDbUri ? [spacetimeDbUri] : [])],
      imgSrc: ["'self'", 'data:', 'blob:', ...(isDev ? ['http://localhost:*', 'http://127.0.0.1:*'] : [])]
    },
    experimental,
    imageDomains,
    imgSrc,
    noboilCondition: 'noboil-spacetimedb',
    serverExternalPackages: ['spacetimedb/server']
  })
export { createNextConfig }

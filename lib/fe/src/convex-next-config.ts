import { env as nodeEnv } from 'node:process'
import type { CreateNextConfigOptions } from './next-config-core'
import { createNextConfigWithCsp } from './next-config-core'
const isDev = nodeEnv.NODE_ENV === 'development'
const createNextConfig = ({ experimental, imageDomains, imgSrc }: CreateNextConfigOptions = {}) =>
  createNextConfigWithCsp({
    csp: {
      connectSrc: isDev
        ? ["'self'", 'https://*.convex.cloud', 'wss://*.convex.cloud', 'http://127.0.0.1:*', 'ws://127.0.0.1:*']
        : ["'self'", 'https://*.convex.cloud', 'wss://*.convex.cloud'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.convex.cloud']
    },
    experimental,
    imageDomains,
    imgSrc
  })
export { createNextConfig }

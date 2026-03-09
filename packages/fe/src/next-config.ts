/** biome-ignore-all lint/style/noProcessEnv: env detection in config */
import type { NextConfig } from 'next'

interface CreateNextConfigOptions {
  experimental?: NextConfig['experimental']
  imageDomains?: string[]
  imgSrc?: string[]
}

const isDev = process.env.NODE_ENV === 'development',
  BASE_IMG_SRC = "'self' data: blob: https://*.convex.cloud",
  isPlaywright = process.env.PLAYWRIGHT === '1',
  createNextConfig = ({ experimental, imageDomains, imgSrc }: CreateNextConfigOptions = {}): NextConfig => ({
    ...(isPlaywright && { devIndicators: false }),
    experimental: { ...experimental },
    headers: () => [
      {
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              `img-src ${[BASE_IMG_SRC, ...(imgSrc ?? [])].join(' ')}`,
              isDev
                ? "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud http://127.0.0.1:* ws://127.0.0.1:*"
                : "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud",
              "font-src 'self'",
              "frame-ancestors 'none'"
            ].join('; ')
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ],
        source: '/:path*'
      }
    ],
    images: imageDomains ? { remotePatterns: imageDomains.map(hostname => ({ hostname })) } : undefined,
    reactCompiler: true,
    transpilePackages: ['@a/ui', '@a/be', '@a/fe']
  })

export { createNextConfig }

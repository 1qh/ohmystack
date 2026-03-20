import type { NextConfig } from 'next'

import { env as nodeEnv } from 'node:process'
interface CreateNextConfigOptions {
  experimental?: NextConfig['experimental']
  imageDomains?: string[]
  imgSrc?: string[]
}
interface CreateNextConfigWithCspOptions extends CreateNextConfigOptions {
  csp: CspOptions
  serverExternalPackages?: string[]
}
interface CspOptions {
  connectSrc: string[]
  imgSrc: string[]
}
const isPlaywright = nodeEnv.PLAYWRIGHT === '1',
  createNextConfigWithCsp = ({
    csp,
    experimental,
    imageDomains,
    imgSrc,
    serverExternalPackages
  }: CreateNextConfigWithCspOptions): NextConfig => ({
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
              `img-src ${[...csp.imgSrc, ...(imgSrc ?? [])].join(' ')}`,
              `connect-src ${csp.connectSrc.join(' ')}`,
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
    serverExternalPackages,
    transpilePackages: ['@a/ui', '@a/be', '@a/fe']
  })
export { createNextConfigWithCsp }
export type { CreateNextConfigOptions }

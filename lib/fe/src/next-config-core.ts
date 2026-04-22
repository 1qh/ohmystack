import type { NextConfig } from 'next'
import { resolveAliasFor } from 'noboil'
import { env as nodeEnv } from 'node:process'
interface CreateNextConfigOptions {
  experimental?: NextConfig['experimental']
  imageDomains?: string[]
  imgSrc?: string[]
}
interface CreateNextConfigWithCspOptions extends CreateNextConfigOptions {
  csp: CspOptions
  noboilCondition?: 'noboil-convex' | 'noboil-spacetimedb'
  serverExternalPackages?: string[]
}
interface CspOptions {
  connectSrc: string[]
  imgSrc: string[]
}
const isPlaywright = nodeEnv.PLAYWRIGHT === '1'
const createNextConfigWithCsp = ({
  csp,
  experimental,
  imageDomains,
  imgSrc,
  noboilCondition,
  serverExternalPackages
}: CreateNextConfigWithCspOptions): NextConfig => ({
  ...(isPlaywright && { devIndicators: false }),
  experimental: { ...experimental },
  ...(noboilCondition && {
    turbopack: { resolveAlias: resolveAliasFor(noboilCondition) } satisfies NextConfig['turbopack'],
    webpack: ((config: { resolve?: { conditionNames?: string[] } }) => {
      config.resolve ??= {}
      config.resolve.conditionNames = [noboilCondition, '...']
      return config
    }) as NextConfig['webpack']
  }),
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
  reactStrictMode: true,
  serverExternalPackages,
  transpilePackages: ['@a/ui', '@a/be', '@a/fe']
})
export { createNextConfigWithCsp }
export type { CreateNextConfigOptions }

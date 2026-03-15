'use client'

/** biome-ignore-all lint/style/noProcessEnv: env detection */
import { ConvexAuthNextjsProvider } from '@convex-dev/auth/nextjs'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import type { ReactNode } from 'react'

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? 'http://127.0.0.1:3212'),
  isTestMode = process.env.NEXT_PUBLIC_CONVEX_TEST_MODE === 'true'

const AgentConvexProvider = ({ children }: { children: ReactNode }) =>
  isTestMode ? (
    <ConvexProvider client={convex}>{children}</ConvexProvider>
  ) : (
    <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>
  )

export default AgentConvexProvider

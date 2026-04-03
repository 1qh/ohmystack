'use client'
import type { ReactNode } from 'react'
import { ConvexAuthNextjsProvider } from '@convex-dev/auth/nextjs'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import env from '~/env'
const runtimeEnv = env as Record<'NEXT_PUBLIC_CONVEX_TEST_MODE' | 'NEXT_PUBLIC_CONVEX_URL', string>
const convex = new ConvexReactClient(runtimeEnv.NEXT_PUBLIC_CONVEX_URL)
const isTestMode = runtimeEnv.NEXT_PUBLIC_CONVEX_TEST_MODE === 'true'
const AgentConvexProvider = ({ children }: { children: ReactNode }) =>
  isTestMode ? (
    <ConvexProvider client={convex}>{children}</ConvexProvider>
  ) : (
    <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>
  )
export default AgentConvexProvider

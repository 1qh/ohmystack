'use client'
import type { ReactNode } from 'react'
import AgentConvexProvider from './convex-provider'
import TestLoginProvider from './test-login-provider'
const Providers = ({ children }: { children: ReactNode }) => (
  <AgentConvexProvider>
    <TestLoginProvider>{children}</TestLoginProvider>
  </AgentConvexProvider>
)
export { Providers }

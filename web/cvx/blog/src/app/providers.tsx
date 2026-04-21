'use client'
import type { ReactNode } from 'react'
import ConvexProvider from '@a/fe/convex-provider'
import { DevtoolsAutoMount } from 'noboil/convex/react'
const ConvexWrapper = ({ children }: { children: ReactNode }) => (
  <ConvexProvider fileApi>
    {children}
    <DevtoolsAutoMount />
  </ConvexProvider>
)
export { ConvexWrapper }

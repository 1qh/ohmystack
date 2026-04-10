'use client'
import type { ReactNode } from 'react'
import ConvexProvider from '@a/fe/convex-provider'
const ConvexWrapper = ({ children }: { children: ReactNode }) => <ConvexProvider fileApi>{children}</ConvexProvider>
export { ConvexWrapper }

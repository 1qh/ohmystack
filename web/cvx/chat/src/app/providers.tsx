'use client'
import type { ReactNode } from 'react'
import ConvexProvider from '@a/fe/convex-provider'
const renderConvexProvider = (inner: ReactNode): ReactNode => <ConvexProvider>{inner}</ConvexProvider>
export { renderConvexProvider }

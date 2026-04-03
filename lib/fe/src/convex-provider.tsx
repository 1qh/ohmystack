'use client'
import type { ReactNode } from 'react'
import { api } from '@a/be-convex'
import { ConvexAuthNextjsProvider as AuthProvider } from '@convex-dev/auth/nextjs'
import { FileApiProvider } from '@noboil/convex/components'
import { ConvexProvider as BaseProvider, ConvexReactClient as Client } from 'convex/react'
import { NavigationGuardProvider } from 'next-navigation-guard'
import env from './env'
interface ConvexProviderProps {
  children: ReactNode
  convexUrl?: string
  fileApi?: boolean
  noAuth?: boolean
}
const FILE_API = { info: api.file.info, upload: api.file.upload }
const clients = new Map<string, Client>()
const FALLBACK_CONVEX_URL = 'http://127.0.0.1:4001'
const getClient = (url: string) => {
  let c = clients.get(url)
  if (!c) {
    c = new Client(url, { verbose: true })
    clients.set(url, c)
  }
  return c
}
const ConvexProvider = ({ children, convexUrl, fileApi, noAuth }: ConvexProviderProps) => {
  const resolvedUrl = convexUrl ?? (env.NEXT_PUBLIC_CONVEX_URL || FALLBACK_CONVEX_URL)
  const client = getClient(resolvedUrl)
  const guarded = <NavigationGuardProvider>{children}</NavigationGuardProvider>
  const inner = fileApi ? <FileApiProvider value={FILE_API}>{guarded}</FileApiProvider> : guarded
  return noAuth ? (
    <BaseProvider client={client}>{inner}</BaseProvider>
  ) : (
    <AuthProvider client={client}>{inner}</AuthProvider>
  )
}
export default ConvexProvider

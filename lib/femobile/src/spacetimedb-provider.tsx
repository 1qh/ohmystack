import type { ReactNode } from 'react'
import { DbConnection } from '@a/be-spacetimedb/spacetimedb'
import { createSpacetimeClient, createTokenStore } from '@noboil/spacetimedb/react'
import { SpacetimeDBProvider as BaseProvider } from 'spacetimedb/react'
interface SpacetimeDBProviderProps {
  children: ReactNode
  moduleName: string
  uri: string
}
const TOKEN_STORE = createTokenStore(),
  SpacetimeDBProvider = ({ children, moduleName, uri }: SpacetimeDBProviderProps) => {
    const builder = createSpacetimeClient({ DbConnection, moduleName, tokenStore: TOKEN_STORE, uri })
    return <BaseProvider connectionBuilder={builder}>{children}</BaseProvider>
  }
export default SpacetimeDBProvider

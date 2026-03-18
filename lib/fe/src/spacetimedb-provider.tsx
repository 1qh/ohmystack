'use client'

import type { ReactNode } from 'react'

import { DbConnection } from '@a/be-spacetimedb/spacetimedb'
import { FileApiProvider } from '@noboil/spacetimedb/components'
import { createFileUploader, createSpacetimeClient, createTokenStore } from '@noboil/spacetimedb/react'
import { NavigationGuardProvider } from 'next-navigation-guard'
import { AuthProvider as OidcProvider } from 'react-oidc-context'
import { SpacetimeDBProvider as BaseProvider } from 'spacetimedb/react'

import env from './env'

interface SpacetimeDBProviderProps {
  children: ReactNode
  fileApi?: boolean
  noAuth?: boolean
  spacetimeUri?: string
}

const TOKEN_STORE = createTokenStore(),
  FILE_API = createFileUploader('/api/upload/presign'),
  SpacetimeProvider = ({ children, fileApi, noAuth, spacetimeUri }: SpacetimeDBProviderProps) => {
    const moduleName = env.SPACETIMEDB_MODULE_NAME,
      uri = spacetimeUri ?? env.NEXT_PUBLIC_SPACETIMEDB_URI,
      builder = createSpacetimeClient({ DbConnection, moduleName, tokenStore: TOKEN_STORE, uri }),
      guarded = <NavigationGuardProvider>{children}</NavigationGuardProvider>,
      withFiles = fileApi ? <FileApiProvider value={FILE_API}>{guarded}</FileApiProvider> : guarded,
      withAuth = noAuth ? (
        withFiles
      ) : (
        <OidcProvider
          authority='https://auth.spacetimedb.com/oidc'
          client_id={env.NEXT_PUBLIC_SPACETIMEDB_OIDC_CLIENT_ID}
          post_logout_redirect_uri='/'
          redirect_uri='/login'
          scope='openid profile email'>
          {withFiles}
        </OidcProvider>
      )
    return <BaseProvider connectionBuilder={builder}>{withAuth}</BaseProvider>
  }

export default SpacetimeProvider

// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'

import type { ComponentProps } from 'react'

import { useAuth } from 'react-oidc-context'
import { toast } from 'sonner'

import OAuthLoginShell from './oauth-login-shell'

interface LoginPageProps {
  emailLoginPath?: string
  emailLoginText?: string
  redirectTo?: string
  shellProps?: Omit<ComponentProps<typeof OAuthLoginShell>, 'emailLoginPath' | 'emailLoginText' | 'onGoogleClick'>
}

const LoginPage = ({
  emailLoginPath = '/login/email',
  emailLoginText = 'Log in with email',
  redirectTo = '/',
  shellProps
}: LoginPageProps) => {
  const auth = useAuth(),
    signInWithGoogle = () => {
      ;(async () => {
        try {
          await auth.signinRedirect({
            extraQueryParams: { provider: 'google' },
            state: { redirectTo }
          })
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not sign in')
        }
      })()
    }
  return (
    <OAuthLoginShell
      {...shellProps}
      emailLoginPath={emailLoginPath}
      emailLoginText={emailLoginText}
      onGoogleClick={signInWithGoogle}
    />
  )
}

export default LoginPage

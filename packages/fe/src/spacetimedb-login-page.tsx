// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'

import { useAuth } from 'react-oidc-context'
import { toast } from 'sonner'

import OAuthLoginShell from './oauth-login-shell'

interface LoginPageProps {
  emailLoginPath?: string
  redirectTo?: string
}

const LoginPage = ({ emailLoginPath = '/login/email', redirectTo = '/' }: LoginPageProps) => {
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
    <OAuthLoginShell emailLoginPath={emailLoginPath} emailLoginText='Log in with email' onGoogleClick={signInWithGoogle} />
  )
}

export default LoginPage

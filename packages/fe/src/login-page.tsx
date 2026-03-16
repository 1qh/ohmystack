/* oxlint-disable promise/prefer-await-to-callbacks, promise/prefer-await-to-then */
'use client'

import { useAuthActions } from '@convex-dev/auth/react'

import OAuthLoginShell from './oauth-login-shell'

interface LoginPageProps {
  emailLoginPath?: string
  redirectTo?: string
}

const LoginPage = ({ emailLoginPath = '/login/email', redirectTo = '/' }: LoginPageProps) => {
  const { signIn } = useAuthActions(),
    onGoogleClick = () => {
      const signInAttempt = signIn('google', { redirectTo })
      signInAttempt.catch(error => {
        // eslint-disable-next-line no-console
        console.error(error)
      })
    }

  return (
    <OAuthLoginShell emailLoginPath={emailLoginPath} emailLoginText='Log in with password' onGoogleClick={onGoogleClick} />
  )
}

export default LoginPage

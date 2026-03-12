'use client'

import { useAuthActions } from '@convex-dev/auth/react'

import OAuthLoginShell from './oauth-login-shell'

interface LoginPageProps {
  emailLoginPath?: string
  redirectTo?: string
}

const LoginPage = ({ emailLoginPath = '/login/email', redirectTo = '/' }: LoginPageProps) => {
  const { signIn } = useAuthActions()
  return (
    <OAuthLoginShell
      emailLoginPath={emailLoginPath}
      emailLoginText='Log in with password'
      // oxlint-disable-next-line promise/prefer-await-to-then
      onGoogleClick={() => {
        signIn('google', { redirectTo }).catch((error: unknown) => {
          // eslint-disable-next-line no-console
          console.error(error)
        })
      }}
    />
  )
}

export default LoginPage

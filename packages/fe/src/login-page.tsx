'use client'

import { useAuthActions } from '@convex-dev/auth/react'

import OAuthLoginShell from './oauth-login-shell'

interface LoginPageProps {
  emailLoginPath?: string
  redirectTo?: string
}

const LoginPage = ({ emailLoginPath = '/login/email', redirectTo = '/' }: LoginPageProps) => {
  const { signIn } = useAuthActions()

  const onGoogleClick = async () => {
    try {
      await signIn('google', { redirectTo })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error)
    }
  }

  return (
    <OAuthLoginShell emailLoginPath={emailLoginPath} emailLoginText='Log in with password' onGoogleClick={onGoogleClick} />
  )
}

export default LoginPage

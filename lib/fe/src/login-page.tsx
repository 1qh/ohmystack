/* oxlint-disable promise/prefer-await-to-callbacks, promise/prefer-await-to-then */
'use client'
import type { ComponentProps } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import OAuthLoginShell from './oauth-login-shell'
interface LoginPageProps {
  emailLoginPath?: string
  emailLoginText?: string
  redirectTo?: string
  shellProps?: Omit<ComponentProps<typeof OAuthLoginShell>, 'emailLoginPath' | 'emailLoginText' | 'onGoogleClick'>
}
const LoginPage = ({
  emailLoginPath = '/login/email',
  emailLoginText = 'Log in with password',
  redirectTo = '/',
  shellProps
}: LoginPageProps) => {
  const { signIn } = useAuthActions(),
    onGoogleClick = () => {
      const signInAttempt = signIn('google', { redirectTo })
      signInAttempt.catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error(error)
      })
    }
  return (
    <OAuthLoginShell
      {...shellProps}
      emailLoginPath={emailLoginPath}
      emailLoginText={emailLoginText}
      onGoogleClick={onGoogleClick}
    />
  )
}
export default LoginPage

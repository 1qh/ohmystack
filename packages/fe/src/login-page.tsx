'use client'

import { Button } from '@a/ui/button'
import { useAuthActions } from '@convex-dev/auth/react'
import Link from 'next/link'

interface LoginPageProps {
  emailLoginPath?: string
  redirectTo?: string
}

const LoginPage = ({ emailLoginPath = '/login/email', redirectTo = '/' }: LoginPageProps) => {
  const { signIn } = useAuthActions()
  return (
    <div className='m-auto space-y-2'>
      <Button
        className='group rounded-full pr-5! tracking-tight transition-all duration-300 hover:scale-105 hover:gap-1 hover:pl-2 active:scale-90'
        // oxlint-disable-next-line promise/prefer-await-to-then
        onClick={() => {
          signIn('google', { redirectTo }).catch((error: unknown) => {
            // eslint-disable-next-line no-console
            console.error(error)
          })
        }}>
        Continue with Google
      </Button>
      <Link
        className='block text-center text-sm font-light text-muted-foreground transition-all duration-300 hover:font-normal hover:text-foreground'
        href={emailLoginPath}>
        Log in with password
      </Link>
    </div>
  )
}

export default LoginPage

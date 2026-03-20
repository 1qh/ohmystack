'use client'
import type { ComponentProps } from 'react'

import { Input } from '@a/ui/input'
import { useAuthActions } from '@convex-dev/auth/react'
import { ConvexError } from 'convex/values'
import { useState } from 'react'
import { toast } from 'sonner'

import EmailAuthShell from './email-auth-shell'
interface EmailLoginPageProps {
  emailInputProps?: Omit<ComponentProps<typeof Input>, 'name' | 'type'>
  passwordInputProps?: Omit<ComponentProps<typeof Input>, 'name' | 'type'>
  shellProps?: Omit<
    ComponentProps<typeof EmailAuthShell>,
    'children' | 'login' | 'onSubmit' | 'onToggle' | 'pending' | 'submitLabel'
  >
  signInLabel?: string
  signUpLabel?: string
}
const EmailLoginPage = ({
  emailInputProps,
  passwordInputProps,
  shellProps,
  signInLabel = 'Sign in',
  signUpLabel = 'Sign up'
}: EmailLoginPageProps) => {
  const { signIn } = useAuthActions(),
    [login, setLogin] = useState(true),
    [pending, setPending] = useState(false)
  return (
    <EmailAuthShell
      {...shellProps}
      login={login}
      onSubmit={ev => {
        ev.preventDefault()
        setPending(true)
        const fd = new FormData(ev.currentTarget)
        // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks
        signIn('password', fd).catch((signInError: unknown) => {
          // eslint-disable-next-line no-console
          console.error(signInError)
          let m: string
          if (signInError instanceof ConvexError && signInError.data === 'INVALID_PASSWORD')
            m = 'Invalid password - check the requirements and try again.'
          else m = login ? 'Could not sign in, did you mean to sign up?' : 'Could not sign up, did you mean to sign in?'
          toast.error(m)
          setPending(false)
        })
      }}
      onToggle={() => setLogin(!login)}
      pending={pending}
      submitLabel={login ? signInLabel : signUpLabel}>
      <Input {...emailInputProps} autoComplete='email' name='email' placeholder='Email' />
      <Input
        {...passwordInputProps}
        autoComplete={login ? 'current-password' : 'new-password'}
        name='password'
        placeholder='Password'
        type='password'
      />
      <input name='flow' type='hidden' value={login ? 'signIn' : 'signUp'} />
    </EmailAuthShell>
  )
}
export default EmailLoginPage

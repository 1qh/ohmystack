'use client'
import type { ComponentProps } from 'react'
import { Input } from '@a/ui/input'
import { useAuthActions } from '@convex-dev/auth/react'
import { ConvexError } from 'convex/values'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import EmailAuthShell from './email-auth-shell'
interface EmailLoginPageProps {
  emailInputProps?: Omit<ComponentProps<typeof Input>, 'name' | 'type'>
  passwordInputProps?: Omit<ComponentProps<typeof Input>, 'name' | 'type'>
  redirectTo?: string
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
  redirectTo = '/',
  shellProps,
  signInLabel = 'Sign in',
  signUpLabel = 'Sign up'
}: EmailLoginPageProps) => {
  const { signIn } = useAuthActions()
  const router = useRouter()
  const [login, setLogin] = useState(true)
  const [pending, setPending] = useState(false)
  return (
    <EmailAuthShell
      {...shellProps}
      login={login}
      onSubmit={ev => {
        ev.preventDefault()
        setPending(true)
        const fd = new FormData(ev.currentTarget)
        signIn('password', fd)
          // oxlint-disable-next-line promise/prefer-await-to-then, eslint-plugin-promise(always-return)
          .then(() => {
            router.replace(redirectTo)
          })
          // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks
          .catch((signInError: unknown) => {
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

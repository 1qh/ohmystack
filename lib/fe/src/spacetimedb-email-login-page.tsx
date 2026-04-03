// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'
import type { ComponentProps } from 'react'
import { Input } from '@a/ui/input'
import { useId, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import { toast } from 'sonner'
import EmailAuthShell from './email-auth-shell'
interface EmailLoginPageProps {
  emailInputProps?: Omit<ComponentProps<typeof Input>, 'id' | 'name' | 'type'>
  shellProps?: Omit<
    ComponentProps<typeof EmailAuthShell>,
    'children' | 'login' | 'onSubmit' | 'onToggle' | 'pending' | 'submitLabel'
  >
  signInLabel?: string
  signUpLabel?: string
}
const EmailLoginPage = ({
  emailInputProps,
  shellProps,
  signInLabel = 'Continue with email',
  signUpLabel = 'Create account with email'
}: EmailLoginPageProps) => {
  const emailId = useId()
  const auth = useAuth()
  const [login, setLogin] = useState(true)
  const [pending, setPending] = useState(false)
  const submitMagicLink = (email: string) => {
    ;(async () => {
      try {
        await auth.signinRedirect({
          extraQueryParams: {
            login_hint: email,
            provider: 'magic_link'
          },
          state: { flow: login ? 'signIn' : 'signUp' }
        })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not continue with email')
        setPending(false)
      }
    })()
  }
  return (
    <EmailAuthShell
      {...shellProps}
      login={login}
      onSubmit={ev => {
        ev.preventDefault()
        setPending(true)
        const fd = new FormData(ev.currentTarget)
        const emailVal = fd.get('email')
        const email = typeof emailVal === 'string' ? emailVal.trim() : ''
        submitMagicLink(email)
      }}
      onToggle={() => setLogin(!login)}
      pending={pending}
      submitLabel={login ? signInLabel : signUpLabel}>
      <Input {...emailInputProps} autoComplete='email' id={emailId} name='email' placeholder='Email' />
    </EmailAuthShell>
  )
}
export default EmailLoginPage

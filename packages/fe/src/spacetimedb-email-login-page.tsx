// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'

import { Input } from '@a/ui/input'
import { useId, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import { toast } from 'sonner'

import EmailAuthShell from './email-auth-shell'

const EmailLoginPage = () => {
  const emailId = useId(),
    auth = useAuth(),
    [login, setLogin] = useState(true),
    [pending, setPending] = useState(false),
    submitMagicLink = (email: string) => {
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
      login={login}
      onSubmit={ev => {
        ev.preventDefault()
        setPending(true)
        const fd = new FormData(ev.currentTarget),
          emailVal = fd.get('email'),
          email = typeof emailVal === 'string' ? emailVal.trim() : ''
        submitMagicLink(email)
      }}
      onToggle={() => setLogin(!login)}
      pending={pending}
      submitLabel={login ? 'Continue with email' : 'Create account with email'}>
      <Input autoComplete='email' id={emailId} name='email' placeholder='Email' />
    </EmailAuthShell>
  )
}

export default EmailLoginPage

'use client'

import { Button } from '@a/ui/button'
import { Input } from '@a/ui/input'
import { useAuthActions } from '@convex-dev/auth/react'
import { ConvexError } from 'convex/values'
import { useState } from 'react'
import { toast } from 'sonner'

const EmailLoginPage = () => {
  const { signIn } = useAuthActions(),
    [login, setLogin] = useState(true),
    [pending, setPending] = useState(false)
  return (
    <form
      className='m-auto max-w-60 space-y-2 *:w-full'
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
      }}>
      <Input autoComplete='email' name='email' placeholder='Email' />
      <Input
        autoComplete={login ? 'current-password' : 'new-password'}
        name='password'
        placeholder='Password'
        type='password'
      />
      <input name='flow' type='hidden' value={login ? 'signIn' : 'signUp'} />
      <Button disabled={pending} type='submit'>
        {login ? 'Sign in' : 'Sign up'}
      </Button>
      <button
        className='text-sm text-muted-foreground hover:text-foreground'
        onClick={() => setLogin(!login)}
        type='button'>
        {login ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
      </button>
    </form>
  )
}

export default EmailLoginPage

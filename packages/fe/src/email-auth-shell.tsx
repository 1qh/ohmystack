'use client'

import type { FormEventHandler, ReactNode } from 'react'

import { Button } from '@a/ui/button'

interface EmailAuthShellProps {
  children: ReactNode
  login: boolean
  pending: boolean
  submitLabel: string
  onSubmit: FormEventHandler<HTMLFormElement>
  onToggle: () => void
}

const EmailAuthShell = ({ children, login, onSubmit, onToggle, pending, submitLabel }: EmailAuthShellProps) => (
  <form className='m-auto max-w-60 space-y-2 *:w-full' onSubmit={onSubmit}>
    {children}
    <Button disabled={pending} type='submit'>
      {submitLabel}
    </Button>
    <button className='text-sm text-muted-foreground hover:text-foreground' onClick={onToggle} type='button'>
      {login ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
    </button>
  </form>
)

export default EmailAuthShell

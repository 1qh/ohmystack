'use client'

import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@a/ui'
import { Button } from '@a/ui/button'

interface EmailAuthShellProps {
  children: ReactNode
  childrenClassName?: string
  formClassName?: string
  login: boolean
  onSubmit: ComponentProps<'form'>['onSubmit']
  onToggle: () => void
  pending: boolean
  submitButtonProps?: Omit<ComponentProps<typeof Button>, 'children' | 'disabled' | 'type'>
  submitLabel: string
  toggleButtonProps?: Omit<ComponentProps<'button'>, 'children' | 'onClick' | 'type'>
  toggleLoginLabel?: string
  toggleSignupLabel?: string
  wrapperProps?: Omit<ComponentProps<'form'>, 'children' | 'onSubmit'>
}

const EmailAuthShell = ({
  children,
  childrenClassName,
  formClassName,
  login,
  onSubmit,
  onToggle,
  pending,
  submitButtonProps,
  submitLabel,
  toggleButtonProps,
  toggleLoginLabel = "Don't have an account? Sign up",
  toggleSignupLabel = 'Already have an account? Log in',
  wrapperProps
}: EmailAuthShellProps) => {
  const toggleLabel = login ? toggleLoginLabel : toggleSignupLabel

  return (
    <form
      {...wrapperProps}
      className={cn('m-auto max-w-60 space-y-2 *:w-full', formClassName, wrapperProps?.className)}
      onSubmit={onSubmit}>
      <div className={cn(childrenClassName)}>{children}</div>
      <Button {...submitButtonProps} disabled={pending} type='submit'>
        {submitLabel}
      </Button>
      <button
        {...toggleButtonProps}
        className={cn('text-sm text-muted-foreground hover:text-foreground', toggleButtonProps?.className)}
        onClick={onToggle}
        type='button'>
        {toggleLabel}
      </button>
    </form>
  )
}

export default EmailAuthShell

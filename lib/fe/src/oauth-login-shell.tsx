'use client'
import type { ComponentProps } from 'react'

import { cn } from '@a/ui'
import { Button } from '@a/ui/button'
import Link from 'next/link'
interface OAuthLoginShellProps {
  buttonLabel?: string
  buttonProps?: Omit<ComponentProps<typeof Button>, 'children' | 'onClick'>
  emailLoginPath: string
  emailLoginText: string
  linkProps?: Omit<ComponentProps<typeof Link>, 'children' | 'href'>
  onGoogleClick: () => void
  wrapperClassName?: string
  wrapperProps?: Omit<ComponentProps<'div'>, 'children'>
}
const OAuthLoginShell = ({
  buttonLabel = 'Continue with Google',
  buttonProps,
  emailLoginPath,
  emailLoginText,
  linkProps,
  onGoogleClick,
  wrapperClassName,
  wrapperProps
}: OAuthLoginShellProps) => (
  <div {...wrapperProps} className={cn('m-auto space-y-2', wrapperClassName, wrapperProps?.className)}>
    <Button
      {...buttonProps}
      className={cn(
        'group rounded-full pr-5! tracking-tight transition-all duration-300 hover:scale-105 hover:gap-1 hover:pl-2 active:scale-90',
        buttonProps?.className
      )}
      onClick={onGoogleClick}>
      {buttonLabel}
    </Button>
    <Link
      {...linkProps}
      className={cn(
        'block text-center text-sm font-light text-muted-foreground transition-all duration-300 hover:font-normal hover:text-foreground',
        linkProps?.className
      )}
      href={emailLoginPath}>
      {emailLoginText}
    </Link>
  </div>
)
export default OAuthLoginShell

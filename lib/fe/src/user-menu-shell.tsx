'use client'
/* oxlint-disable forbid-component-props -- shadcn/Tailwind pattern requires className/style on shared components */
/* oxlint-disable eslint-plugin-react(forbid-component-props) */
import type { ComponentProps } from 'react'
import { cn } from '@a/ui'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@a/ui/alert-dialog'
import { Button } from '@a/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@a/ui/popover'
import Image from 'next/image'
import Link from 'next/link'
import { createElement } from 'react'
import ThemeToggle from './theme-toggle'
/* eslint-disable complexity */
interface UserMenuShellProps {
  alertDialogContentProps?: Omit<ComponentProps<typeof AlertDialogContent>, 'children'>
  alertDialogDescriptionProps?: Omit<ComponentProps<typeof AlertDialogDescription>, 'children'>
  alertDialogTitleProps?: Omit<ComponentProps<typeof AlertDialogTitle>, 'children'>
  email?: string
  image?: string
  isSignedIn: boolean
  loginButtonProps?: Omit<ComponentProps<typeof Button>, 'children' | 'render'>
  loginHref?: string
  loginLabel?: string
  loginLinkProps?: Omit<ComponentProps<typeof Link>, 'children' | 'href'>
  logoutButtonProps?: Omit<ComponentProps<typeof Button>, 'children' | 'type'>
  logoutCancelLabel?: string
  logoutCancelProps?: Omit<ComponentProps<typeof AlertDialogCancel>, 'children'>
  logoutContinueButtonProps?: Omit<ComponentProps<typeof Button>, 'children' | 'type'>
  logoutContinueLabel?: string
  logoutDescription?: string
  logoutFormProps?: Omit<ComponentProps<'form'>, 'action' | 'children'>
  logoutLabel?: string
  logoutTriggerClassName?: string
  logoutTriggerProps?: Omit<ComponentProps<typeof AlertDialogTrigger>, 'children' | 'className' | 'render'>
  menuClassName?: string
  menuProps?: Omit<ComponentProps<typeof PopoverContent>, 'children'>
  name?: string
  onLogout: () => Promise<void>
  popoverProps?: Omit<ComponentProps<typeof Popover>, 'children'>
  themeToggleProps?: ComponentProps<typeof ThemeToggle>
  triggerAriaLabel?: string
  triggerClassName?: string
  triggerFallbackProps?: Omit<ComponentProps<'span'>, 'children'>
  triggerImageProps?: Omit<ComponentProps<typeof Image>, 'alt' | 'height' | 'src' | 'width'>
  triggerProps: ComponentProps<typeof PopoverTrigger>
}
const UserMenuShell = ({
  alertDialogContentProps,
  alertDialogDescriptionProps,
  alertDialogTitleProps,
  email,
  image,
  isSignedIn,
  loginButtonProps,
  loginHref = '/login',
  loginLabel = 'Log in',
  loginLinkProps,
  logoutButtonProps,
  logoutCancelLabel = 'Cancel',
  logoutCancelProps,
  logoutContinueButtonProps,
  logoutContinueLabel = 'Continue',
  logoutDescription,
  logoutFormProps,
  logoutLabel = 'Log out',
  logoutTriggerClassName,
  logoutTriggerProps,
  menuClassName,
  menuProps,
  name,
  onLogout,
  popoverProps,
  themeToggleProps,
  triggerAriaLabel = 'User menu',
  triggerClassName,
  triggerFallbackProps,
  triggerImageProps,
  triggerProps
}: UserMenuShellProps) => {
  const { className: triggerPropsClassName, ...triggerRestProps } = triggerProps
  const { className: triggerImageClassName, ...triggerImageRestProps } = triggerImageProps ?? {}
  const { className: triggerFallbackClassName, ...triggerFallbackRestProps } = triggerFallbackProps ?? {}
  const description = logoutDescription ?? (email ? `Log out of ${email}?` : 'Log out?')
  const title = name ?? 'Account'
  const trigger = createElement(
    'button',
    {
      ...triggerRestProps,
      'aria-label': triggerAriaLabel,
      className: cn('size-8 shrink-0 rounded-full', triggerClassName, triggerPropsClassName),
      type: 'button'
    },
    isSignedIn && image
      ? createElement(Image, {
          ...triggerImageRestProps,
          alt: '',
          className: cn('rounded-full', triggerImageClassName),
          height: 32,
          src: image,
          width: 32
        })
      : createElement('span', {
          ...triggerFallbackRestProps,
          className: cn('block size-8 rounded-full bg-muted-foreground', triggerFallbackClassName)
        })
  )
  const logoutTrigger = createElement(Button, {
    ...logoutButtonProps,
    type: 'button',
    variant: logoutButtonProps?.variant ?? 'ghost'
  })
  return (
    <Popover {...popoverProps}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        {...menuProps}
        className={cn('mx-1 w-fit space-y-1 rounded-xl p-1.5', menuClassName, menuProps?.className)}>
        <ThemeToggle {...themeToggleProps} />
        {isSignedIn ? (
          <AlertDialog>
            <AlertDialogTrigger
              {...logoutTriggerProps}
              className={cn('w-full', logoutTriggerClassName)}
              render={logoutTrigger}>
              {logoutLabel}
            </AlertDialogTrigger>
            <AlertDialogContent {...alertDialogContentProps}>
              <AlertDialogHeader>
                <AlertDialogTitle
                  {...alertDialogTitleProps}
                  className={cn('flex items-center gap-2', alertDialogTitleProps?.className)}>
                  {image ? <Image alt='' className='rounded-full' height={24} src={image} width={24} /> : null}
                  {title}
                </AlertDialogTitle>
                <AlertDialogDescription
                  {...alertDialogDescriptionProps}
                  className={cn(alertDialogDescriptionProps?.className)}>
                  {description}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel {...logoutCancelProps}>{logoutCancelLabel}</AlertDialogCancel>
                <form {...logoutFormProps} action={onLogout}>
                  <Button {...logoutContinueButtonProps} type='submit'>
                    {logoutContinueLabel}
                  </Button>
                </form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            {...loginButtonProps}
            className={cn('w-full', loginButtonProps?.className)}
            nativeButton={false}
            render={p => <Link {...p} {...loginLinkProps} href={loginHref} />}
            variant={loginButtonProps?.variant ?? 'ghost'}>
            {loginLabel}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
export default UserMenuShell

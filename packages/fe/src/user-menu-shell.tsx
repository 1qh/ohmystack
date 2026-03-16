import type { Popover as PopoverPrimitive } from 'radix-ui'
import { createElement, type ComponentProps } from 'react'

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

import ThemeToggle from './theme-toggle'

interface UserMenuShellProps {
  email?: string
  image?: string
  isSignedIn: boolean
  name?: string
  onLogout: () => Promise<void>
  triggerProps: ComponentProps<typeof PopoverPrimitive.Trigger>
}

const UserMenuShell = ({ email, image, isSignedIn, name, onLogout, triggerProps }: UserMenuShellProps) => {
  const trigger = createElement(
      'button',
      {
        ...triggerProps,
        'aria-label': 'User menu',
        className: 'size-8 shrink-0 rounded-full',
        type: 'button'
      },
      isSignedIn && image
        ? createElement(Image, { alt: '', className: 'rounded-full', height: 32, src: image, width: 32 })
        : createElement('span', { className: 'block size-8 rounded-full bg-muted-foreground' })
    ),
    logoutTrigger = createElement(Button, { variant: 'ghost' })

  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverContent className='mx-1 w-fit space-y-1 rounded-xl p-1.5'>
        <ThemeToggle />
        {isSignedIn ? (
          <AlertDialog>
            <AlertDialogTrigger className='w-full' render={logoutTrigger}>
              Log out
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className='flex items-center gap-2'>
                  {image ? <Image alt='' className='rounded-full' height={24} src={image} width={24} /> : null}
                  {name}
                </AlertDialogTitle>
                <AlertDialogDescription>Log out of {email}?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <form action={onLogout}>
                  <Button>Continue</Button>
                </form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button asChild className='w-full' variant='ghost'>
            <Link href='/login'>Log in</Link>
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

export default UserMenuShell
